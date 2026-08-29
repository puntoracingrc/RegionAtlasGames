#!/usr/bin/env python3
"""Sincronización semanal de precios ES por plataforma (rotación).

- P2P (Wallapop / eBay / Vinted / TodoColeccion): mediana con región verificada + reglas por plataforma.
- CeX: cexSellPrice / cexCashPrice aparte (no entra en la mediana P2P).
- Japan Game Online: jgoRetailPrice aparte (retail import JP en ES).
- Chollo Games: cholloRetailPrice aparte (importación Madrid).
- Kaoto Store: kaotoRetailPrice aparte (Shopify, import JP/PAL).
- TodoConsolas: tcnsRetailPrice aparte (PrestaShop, segunda mano ES).

Ver data/region-evidence-rules.json y scripts/region_evidence_rules.py
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from region_evidence_rules import (  # noqa: E402
    check_listing_evidence_meets_rules,
    check_retail_evidence_meets_rules,
)
from collectors.listing_recency import (  # noqa: E402
    enrich_tc_product,
    is_recent_listing,
    max_listing_age_days,
    tc_early_stop_stale_ratio,
    tc_max_pages,
)
from collectors.region_inference import normalize_region, regions_match as catalog_regions_match  # noqa: E402
from collectors.region_inference import title_conflicts_region  # noqa: E402
from collectors.condition_buckets import (  # noqa: E402
    DISPLAY_BUCKETS,
    format_data_sources,
    mean_by_bucket,
    observation_from_row,
)
from collectors.price_history import record_platform_snapshots  # noqa: E402
from collectors.price_ai_policy import price_collectors_use_ai  # noqa: E402
from collectors.price_review_queue import record_price_review_candidates  # noqa: E402
from collectors.tcns_policy import POLICY_VERSION as TCNS_POLICY_VERSION  # noqa: E402
from collectors.tcns_policy import tcns_row_is_auto_approved  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
STATE_FILE = ROOT / "data" / "price-sync-state.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
META_FILE = ROOT / "data" / "meta.json"

DEFAULT_FLOOR = 3.0
MAX_DROP_RATIO = 0.5
MIN_VS_PC_REF = 0.25
IQR_MULTIPLIER = 1.5

ES_MARKET_FOCUS = {"pal españa", "españa", "pal europa"}
GAME_PREOWNED_AUTO_MATCH_SCORE = 0.8
GAME_PREOWNED_AUTO_MATCH_MARGIN = 0.15
GAME_PREOWNED_AUTO_REGIONS = {"pal españa", "españa"}
GAME_IMPORT_MARKERS = (
    " import ",
    " imp ",
    " usa",
    " ntsc",
    " japan",
    " japón",
    " japon",
    " asia",
    " uk",
    " alemán",
    " aleman",
    " german",
)


def is_price_tracked_game(game: dict[str, Any]) -> bool:
    """Todas las ediciones del catálogo entran en el sync si cumplen reglas de región."""
    return game.get("listingStatus") != "excluded"


def is_es_market_game(game: dict[str, Any]) -> bool:
    """Retrocompat: ya no excluye Japón/USA del rastreo de precios."""
    return is_price_tracked_game(game)


def has_public_price(game: dict[str, Any]) -> bool:
    return bool(game.get("hasEsPrice") or game.get("recommendedPrice") is not None)


def price_coverage_snapshot(
    games: list[dict[str, Any]],
    platform_slug: str,
    region: str | None = None,
) -> dict[str, float | int]:
    scoped = [
        g
        for g in games
        if g.get("platformSlug") == platform_slug
        and g.get("listingStatus") != "excluded"
        and (not region or g.get("region") == region)
    ]
    priced = sum(1 for g in scoped if has_public_price(g))
    coverage = round((priced / len(scoped)) * 100, 1) if scoped else 0.0
    return {
        "totalGames": len(scoped),
        "pricedGames": priced,
        "coveragePct": coverage,
    }


def catalog_game_in_write_scope(
    game: dict[str, Any],
    *,
    platform_slug: str,
    region: str | None,
    selected_catalog_ids: set[str] | None,
    allow_cross_region_catalog_ids: bool,
) -> bool:
    if game.get("platformSlug") != platform_slug or not is_price_tracked_game(game):
        return False
    catalog_id = str(game.get("id") or "")
    if selected_catalog_ids is not None and catalog_id not in selected_catalog_ids:
        return False
    if not region or game.get("region") == region:
        return True
    return bool(allow_cross_region_catalog_ids and selected_catalog_ids is not None)


def is_listing_region_verified(row: dict[str, Any]) -> bool:
    if row.get("regionVerified") is not True:
        return False
    if not str(row.get("listingRegion") or "").strip():
        return False
    evidence = row.get("regionEvidence") or []
    return isinstance(evidence, list) and len(evidence) > 0


def is_game_preowned_auto_verified(row: dict[str, Any], catalog_region: str) -> bool:
    source = str(row.get("source") or "").strip().lower()
    if source != "game-es-preowned":
        return False
    if str(row.get("offerType") or "").strip().lower() != "preowned":
        return False
    if str(row.get("sourceType") or "").strip().lower() != "retail_es_preowned":
        return False
    if str(row.get("condition") or "").strip().lower() != "complete":
        return False
    if normalize_region(catalog_region) not in GAME_PREOWNED_AUTO_REGIONS:
        return False
    title = f" {str(row.get('title') or '').strip().lower()} "
    if any(marker in title for marker in GAME_IMPORT_MARKERS):
        return False
    if title_conflicts_region(str(row.get("title") or ""), catalog_region):
        return False
    try:
        match_score = float(row.get("matchScore") or 0)
    except (TypeError, ValueError):
        return False
    if match_score < GAME_PREOWNED_AUTO_MATCH_SCORE:
        return False
    match_method = str(row.get("matchMethod") or "").strip().lower()
    if match_method == "reference":
        return True
    try:
        match_margin = float(row.get("matchMargin") or 0)
    except (TypeError, ValueError):
        match_margin = 0
    return match_margin >= GAME_PREOWNED_AUTO_MATCH_MARGIN


def apply_game_preowned_auto_region_policy(
    ingest: dict[str, Any],
    catalog_by_id: dict[str, dict[str, Any]],
) -> int:
    applied = 0
    rows = ingest.get("listings") or []
    if not isinstance(rows, list):
        return 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        catalog_id = str(row.get("catalogId") or "")
        catalog_region = str((catalog_by_id.get(catalog_id) or {}).get("region") or "")
        if not is_game_preowned_auto_verified(row, catalog_region):
            continue
        row["catalogRegion"] = catalog_region
        row["listingRegion"] = "PAL España"
        row["regionVerified"] = True
        row["regionEvidence"] = ["game_es_preowned_trusted_source"]
        try:
            current_confidence = float(row.get("aiConfidence") or 0)
        except (TypeError, ValueError):
            current_confidence = 0
        row["aiConfidence"] = max(current_confidence, 0.9)
        row["regionReviewNeeded"] = False
        row["reviewReason"] = "game_es_preowned_auto_pal_es"
        notes = [str(item) for item in (row.get("regionReviewNotes") or []) if str(item).strip()]
        notes.append("Autoaceptado GAME seminuevo: match alto, sin marca de importación y catálogo PAL España.")
        row["regionReviewNotes"] = notes
        applied += 1
    return applied


def filter_verified_listings(
    platform_slug: str,
    catalog_region: str,
    rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int, int, int]:
    usable: list[dict[str, Any]] = []
    unverified = 0
    mismatch = 0
    insufficient = 0
    stale = 0

    for row in rows:
        if is_game_preowned_auto_verified(row, catalog_region):
            if not is_recent_listing(row):
                stale += 1
                continue
            usable.append(row)
            continue
        if not is_listing_region_verified(row):
            unverified += 1
            continue
        if not is_recent_listing(row):
            stale += 1
            continue
        listing_region = str(row["listingRegion"]).strip()
        if not catalog_regions_match(catalog_region, listing_region):
            mismatch += 1
            continue
        evidence = [str(e) for e in (row.get("regionEvidence") or [])]
        ai_conf = row.get("aiConfidence")
        ai_val = float(ai_conf) if ai_conf is not None else None
        ok, _ = check_listing_evidence_meets_rules(
            platform_slug, catalog_region, evidence, ai_val
        )
        if not ok:
            insufficient += 1
            continue
        usable.append(row)

    return usable, unverified, mismatch, insufficient, stale


def row_ai_used(row: dict[str, Any]) -> bool:
    evidence = [str(item) for item in (row.get("regionEvidence") or [])]
    return bool(
        row.get("aiConfidence") is not None
        or row.get("matchMethod") == "ai"
        or row.get("conditionResolvedBy") == "vision"
        or "listing_ai_region" in evidence
        or "listing_ai_region_mismatch" in evidence
        or "cover_vision" in evidence
    )


def source_key(row: dict[str, Any], fallback: str) -> str:
    return str(row.get("source") or fallback).strip().lower() or fallback


def build_ai_summary(ingest: dict[str, Any], *, condition_vision_stats: dict[str, int] | None = None) -> dict[str, Any]:
    buckets: dict[str, dict[str, int]] = {}
    source_rows = [
        ("wallapop", ingest.get("listings") or []),
        ("cex", ingest.get("cex") or []),
        ("jgo", ingest.get("jgo") or []),
        ("chollo", ingest.get("chollo") or []),
        ("kaoto", ingest.get("kaoto") or []),
        ("todoconsolas", ingest.get("tcns") or []),
        ("todocoleccion", ingest.get("tc") or []),
    ]
    for fallback, rows in source_rows:
        for row in rows:
            source = source_key(row, fallback)
            stats = buckets.setdefault(source, {"aiRows": 0, "resolved": 0, "review": 0, "rejected": 0})
            if row_ai_used(row):
                stats["aiRows"] += 1
                if row.get("regionVerified") is True:
                    stats["resolved"] += 1
                else:
                    stats["review"] += 1
            elif row.get("regionReviewNeeded") or row.get("regionVerified") is not True:
                stats["review"] += 1
    source_stats = ingest.get("sourceStats")
    if not isinstance(source_stats, dict) and isinstance(ingest.get("stats"), dict):
        source_stats = {str(ingest.get("source") or "unknown"): ingest["stats"]}
    if isinstance(source_stats, dict):
        for source, raw_stats in source_stats.items():
            if not isinstance(raw_stats, dict):
                continue
            stats = buckets.setdefault(str(source).strip().lower() or "unknown", {"aiRows": 0, "resolved": 0, "review": 0, "rejected": 0})
            stats["rejected"] += int(raw_stats.get("ai_rejected") or 0)
            stats["rejected"] += int(raw_stats.get("ai_regex_rejected") or 0)
    return {
        "openAiConfigured": price_collectors_use_ai(),
        "sources": [
            {"source": source, **stats}
            for source, stats in sorted(buckets.items())
            if stats["aiRows"] or stats["review"] or stats["rejected"]
        ],
        "conditionVision": condition_vision_stats or {},
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def median(values: list[float]) -> float:
    return statistics.median(values)


MIN_ESTIMATE_OBSERVATIONS = 2
MIN_VERIFIED_OBSERVATIONS = 3


def quartiles(values: list[float]) -> tuple[float, float]:
    sorted_v = sorted(values)
    mid = len(sorted_v) // 2
    lower = sorted_v[:mid]
    upper = sorted_v[mid:] if len(sorted_v) % 2 == 0 else sorted_v[mid + 1 :]
    return (median(lower) if lower else sorted_v[0], median(upper) if upper else sorted_v[-1])


def absolute_floor(
    previous: float | None,
    pc_ref: float | None,
    floor_eur: float = DEFAULT_FLOOR,
) -> float:
    refs = [floor_eur]
    if previous and previous > 0:
        refs.append(previous * MAX_DROP_RATIO)
    if pc_ref and pc_ref > 20:
        refs.append(pc_ref * MIN_VS_PC_REF)
    return max(refs)


def filter_prices(
    prices: list[float],
    previous: float | None,
    pc_ref: float | None,
) -> tuple[list[float], list[float]]:
    raw = [p for p in prices if isinstance(p, (int, float)) and p > 0]
    if not raw:
        return [], []

    min_allowed = absolute_floor(previous, pc_ref)
    accepted = [p for p in raw if p >= min_allowed]
    rejected = [p for p in raw if p < min_allowed]

    if len(accepted) < 4:
        return accepted, rejected

    q1, q3 = quartiles(accepted)
    iqr = q3 - q1
    low = q1 - IQR_MULTIPLIER * iqr
    high = q3 + IQR_MULTIPLIER * iqr

    kept = [p for p in accepted if low <= p <= high]
    rejected.extend(p for p in accepted if p < low or p > high)
    return kept, rejected


def estimate_price(
    prices: list[float],
    previous: float | None,
    pc_ref: float | None,
) -> tuple[float | None, float | None, float | None, str | None, int, int]:
    """Mediana + rango (min/máx) sobre anuncios aceptados tras filtrar outliers."""
    accepted, rejected = filter_prices(prices, previous, pc_ref)
    if not prices:
        return None, None, None, "no_listings", 0, 0
    if not accepted:
        return None, None, None, "all_rejected", len(rejected), 0
    if len(accepted) < MIN_ESTIMATE_OBSERVATIONS:
        return None, None, None, "insufficient_observations", len(rejected), len(accepted)

    est = round(median(accepted), 2)
    market_min = round(min(accepted), 2)
    market_max = round(max(accepted), 2)
    if previous and previous > 10 and est < previous * MAX_DROP_RATIO:
        return None, None, None, "drop_too_steep", len(rejected), len(accepted)
    return est, market_min, market_max, None, len(rejected), len(accepted)


def clear_unverified_market_ranges(catalog: list[dict[str, Any]]) -> int:
    """Elimina rangos heredados del Excel en juegos sin verificación P2P."""
    cleared = 0
    for game in catalog:
        if game.get("priceRegionVerified") is True:
            continue
        if game.get("marketMin") is not None or game.get("marketMax") is not None:
            game["marketMin"] = None
            game["marketMax"] = None
            cleared += 1
    return cleared


def delta_es_vs_pc(recommended: float | None, pc_ref: float | None) -> float | None:
    if recommended is None or pc_ref in (None, 0):
        return None
    return round(((recommended - pc_ref) / pc_ref) * 100, 1)


def price_source_label(sources: set[str]) -> str:
    labels = []
    if "wallapop" in sources:
        labels.append("Wallapop ES")
    if "ebay-es" in sources:
        labels.append("eBay ES")
    if "vinted-es" in sources:
        labels.append("Vinted ES")
    if "todocoleccion" in sources:
        labels.append("TodoColeccion")
    if not labels:
        return "Mercado ES"
    return " / ".join(labels)


def group_by_catalog_id(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        cid = str(row.get("catalogId", "")).strip()
        if not cid:
            continue
        grouped.setdefault(cid, []).append(row)
    return grouped


def apply_cex_row(
    game: dict[str, Any],
    row: dict[str, Any],
    platform_slug: str,
    synced_at: str,
) -> bool:
    catalog_region = str(game.get("region") or "")
    evidence = [str(e) for e in (row.get("regionEvidence") or [])]
    listing_region = str(row.get("listingRegion") or catalog_region).strip()
    match_method = str(row.get("matchMethod") or "").strip()
    ai_conf = float(row["aiConfidence"]) if row.get("aiConfidence") is not None else None

    if row.get("regionVerified") is not True:
        return False
    if match_method not in ("reference", "title", "ai"):
        return False
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False
    if not evidence:
        return False
    ok, _ = check_retail_evidence_meets_rules("cex", evidence, ai_conf)
    if not ok:
        return False

    sell = row.get("sellPriceEur")
    cash = row.get("cashPriceEur")
    if sell is None and cash is None:
        return False

    if sell is not None:
        game["cexSellPrice"] = round(float(sell), 2)
    if cash is not None:
        game["cexCashPrice"] = round(float(cash), 2)
    if row.get("productUrl"):
        game["cexProductUrl"] = str(row["productUrl"])
    game["cexMatchedAt"] = synced_at
    game["cexRegionVerified"] = True
    return True


def apply_jgo_row(
    game: dict[str, Any],
    row: dict[str, Any],
    synced_at: str,
) -> bool:
    catalog_region = str(game.get("region") or "")
    listing_region = str(row.get("listingRegion") or catalog_region).strip()
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False

    price = row.get("retailPriceEur")
    if price is None:
        price = row.get("priceEur")
    if price is None or float(price) <= 0:
        return False

    game["jgoRetailPrice"] = round(float(price), 2)
    if row.get("productUrl"):
        game["jgoProductUrl"] = str(row["productUrl"])
    if row.get("condition"):
        game["jgoCondition"] = str(row["condition"])
    if row.get("inStock") is not None:
        game["jgoInStock"] = bool(row["inStock"])
    game["jgoMatchedAt"] = synced_at
    return True


def apply_chollo_row(
    game: dict[str, Any],
    row: dict[str, Any],
    synced_at: str,
) -> bool:
    catalog_region = str(game.get("region") or "")
    listing_region = str(row.get("listingRegion") or catalog_region).strip()
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False

    price = row.get("retailPriceEur")
    if price is None:
        price = row.get("priceEur")
    if price is None or float(price) <= 0:
        return False

    game["cholloRetailPrice"] = round(float(price), 2)
    if row.get("productUrl"):
        game["cholloProductUrl"] = str(row["productUrl"])
    if row.get("condition"):
        game["cholloCondition"] = str(row["condition"])
    if row.get("inStock") is not None:
        game["cholloInStock"] = bool(row["inStock"])
    game["cholloMatchedAt"] = synced_at
    return True


def apply_tcns_row(
    game: dict[str, Any],
    row: dict[str, Any],
    synced_at: str,
) -> bool:
    if not tcns_row_is_auto_approved(row, game):
        return False
    catalog_region = str(game.get("region") or "")
    listing_region = str(row.get("listingRegion") or catalog_region).strip()
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False

    price = row.get("retailPriceEur")
    if price is None:
        price = row.get("priceEur")
    if price is None or float(price) <= 0:
        return False

    game["tcnsRetailPrice"] = round(float(price), 2)
    if row.get("productUrl"):
        game["tcnsProductUrl"] = str(row["productUrl"])
    if row.get("condition"):
        game["tcnsCondition"] = str(row["condition"])
    if row.get("inStock") is not None:
        game["tcnsInStock"] = bool(row["inStock"])
    game["tcnsMatchedAt"] = synced_at
    return True


def apply_kaoto_row(
    game: dict[str, Any],
    row: dict[str, Any],
    synced_at: str,
) -> bool:
    catalog_region = str(game.get("region") or "")
    listing_region = str(row.get("listingRegion") or catalog_region).strip()
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False

    price = row.get("retailPriceEur")
    if price is None:
        price = row.get("priceEur")
    if price is None or float(price) <= 0:
        return False

    game["kaotoRetailPrice"] = round(float(price), 2)
    if row.get("productUrl"):
        game["kaotoProductUrl"] = str(row["productUrl"])
    if row.get("condition"):
        game["kaotoCondition"] = str(row["condition"])
    if row.get("inStock") is not None:
        game["kaotoInStock"] = bool(row["inStock"])
    game["kaotoMatchedAt"] = synced_at
    return True


def apply_tc_row(
    game: dict[str, Any],
    row: dict[str, Any],
    synced_at: str,
) -> bool:
    """Mejor lote TodoColeccion (referencia P2P ES, no mezclada con retail import)."""
    catalog_region = str(game.get("region") or "")
    listing_region = str(row.get("listingRegion") or catalog_region).strip()
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False

    price = row.get("priceEur")
    if price is None or float(price) <= 0:
        return False

    game["tcListingPrice"] = round(float(price), 2)
    if row.get("productUrl"):
        game["tcProductUrl"] = str(row["productUrl"])
    if row.get("condition"):
        game["tcCondition"] = str(row["condition"])
    game["tcMatchedAt"] = synced_at
    return True


def _row_observation(
    row: dict[str, Any],
    *,
    catalog_region: str,
    platform_slug: str,
    require_p2p_rules: bool = False,
    use_vision: bool = True,
) -> tuple[float, str, str] | None:
    if require_p2p_rules:
        if is_game_preowned_auto_verified(row, catalog_region):
            return observation_from_row(
                row,
                platform_slug=platform_slug,
                use_vision=use_vision,
            )
        if not is_listing_region_verified(row):
            return None
        listing_region = str(row.get("listingRegion") or "").strip()
        if not listing_region or not catalog_regions_match(catalog_region, listing_region):
            return None
        evidence = [str(e) for e in (row.get("regionEvidence") or [])]
        ai_conf = float(row["aiConfidence"]) if row.get("aiConfidence") is not None else None
        ok, _ = check_listing_evidence_meets_rules(
            platform_slug, catalog_region, evidence, ai_conf
        )
        if not ok:
            return None
    else:
        listing_region = str(row.get("listingRegion") or catalog_region).strip()
        if not listing_region or not catalog_regions_match(catalog_region, listing_region):
            return None
        if row.get("source") == "cex":
            evidence = [str(e) for e in (row.get("regionEvidence") or [])]
            ai_conf = float(row["aiConfidence"]) if row.get("aiConfidence") is not None else None
            ok, _ = check_retail_evidence_meets_rules("cex", evidence, ai_conf)
            if not ok:
                return None

    obs = observation_from_row(
        row,
        platform_slug=platform_slug,
        use_vision=use_vision,
    )
    return obs


def collect_condition_observations(
    gid: str,
    catalog_region: str,
    platform_slug: str,
    *,
    grouped: dict[str, list[dict[str, Any]]],
    cex_by_id: dict[str, dict[str, Any]],
    jgo_by_id: dict[str, dict[str, Any]],
    chollo_by_id: dict[str, dict[str, Any]],
    kaoto_by_id: dict[str, dict[str, Any]],
    tcns_by_id: dict[str, dict[str, Any]],
    tc_by_id: dict[str, dict[str, Any]],
    catalog_game: dict[str, Any] | None = None,
    use_vision: bool = True,
) -> list[tuple[float, str, str]]:
    observations: list[tuple[float, str, str]] = []

    for row in grouped.get(gid, []):
        obs = _row_observation(
            row,
            catalog_region=catalog_region,
            platform_slug=platform_slug,
            require_p2p_rules=True,
            use_vision=use_vision,
        )
        if obs:
            observations.append(obs)

    cex_row = cex_by_id.get(gid)
    if cex_row:
        cex_row = {**cex_row, "source": cex_row.get("source") or "cex"}
        obs = _row_observation(cex_row, catalog_region=catalog_region, platform_slug=platform_slug, use_vision=use_vision)
        if obs:
            observations.append(obs)

    for source_map, source_name in (
        (jgo_by_id, "japangameonline"),
        (chollo_by_id, "chollogames"),
        (kaoto_by_id, "kaotostore"),
        (tcns_by_id, "todoconsolas"),
    ):
        row = source_map.get(gid)
        if not row:
            continue
        if source_name == "todoconsolas" and (
            catalog_game is None or not tcns_row_is_auto_approved(row, catalog_game)
        ):
            continue
        if source_name == "todoconsolas" and str(row.get("conditionRaw") or "").strip().casefold() == "segunda mano":
            continue
        row = {**row, "source": row.get("source") or source_name}
        obs = _row_observation(row, catalog_region=catalog_region, platform_slug=platform_slug, use_vision=use_vision)
        if obs:
            observations.append(obs)

    return observations


CONDITION_PRICE_FIELDS = {
    "loose": "estimatedPriceLoose",
    "game_manual": "estimatedPriceGameManual",
    "complete": "estimatedPriceComplete",
    "sealed": "estimatedPriceSealed",
}

SHIPPING_TO_SPAIN_FIELDS = {
    "loose": "estimatedShippingToSpainLoose",
    "game_manual": "estimatedShippingToSpainGameManual",
    "complete": "estimatedShippingToSpainComplete",
    "sealed": "estimatedShippingToSpainSealed",
}

TOTAL_TO_SPAIN_FIELDS = {
    "loose": "estimatedTotalToSpainLoose",
    "game_manual": "estimatedTotalToSpainGameManual",
    "complete": "estimatedTotalToSpainComplete",
    "sealed": "estimatedTotalToSpainSealed",
}


def _merge_price_source_labels(previous: str | None, sources: set[str]) -> str | None:
    labels: list[str] = []

    def add(label: str) -> None:
        clean = label.strip()
        if clean and clean not in labels:
            labels.append(clean)

    if previous:
        for part in str(previous).split("·"):
            add(part)
    current = format_data_sources(sources)
    if current:
        for part in current.split("·"):
            add(part)
    if not labels:
        return None
    return " · ".join(labels)


def apply_condition_price_estimates(
    game: dict[str, Any],
    observations: list[tuple[float, str, str]],
    *,
    synced_at: str,
    pc_ref: float | None,
) -> bool:
    bucket_counts = {
        bucket: sum(1 for _, observed_bucket, _ in observations if observed_bucket == bucket)
        for bucket in DISPLAY_BUCKETS
    }
    eligible_observations = [
        observation
        for observation in observations
        if bucket_counts.get(observation[1], 0) >= MIN_ESTIMATE_OBSERVATIONS
    ]
    estimates, sources = mean_by_bucket(eligible_observations)
    has_new_estimate = any(estimates.get(b) is not None for b in DISPLAY_BUCKETS)
    if not has_new_estimate:
        return False

    for bucket, field in CONDITION_PRICE_FIELDS.items():
        value = estimates.get(bucket)
        if value is not None:
            game[field] = value

    game["priceDataSources"] = _merge_price_source_labels(game.get("priceDataSources"), sources)
    game["hasEsPrice"] = True
    game["updatedAt"] = synced_at

    primary_bucket = next(
        (
            bucket
            for bucket in ("complete", "game_manual", "loose", "sealed")
            if estimates.get(bucket) is not None
        ),
        None,
    )
    primary = game.get(CONDITION_PRICE_FIELDS[primary_bucket]) if primary_bucket else None
    game["priceRegionVerified"] = bool(
        primary_bucket and bucket_counts.get(primary_bucket, 0) >= MIN_VERIFIED_OBSERVATIONS
    )
    game["recommendedPrice"] = primary
    game["deltaEsVsPc"] = delta_es_vs_pc(primary, pc_ref)

    bucket_prices = [
        game.get(field)
        for field in CONDITION_PRICE_FIELDS.values()
        if game.get(field) is not None
    ]
    if bucket_prices:
        game["marketMin"] = round(min(bucket_prices), 2)
        game["marketMax"] = round(max(bucket_prices), 2)
    return True


def apply_ebay_delivery_estimates(
    game: dict[str, Any],
    rows: list[dict[str, Any]],
    *,
    catalog_region: str,
    platform_slug: str,
) -> bool:
    """Publica transporte por separado; nunca lo mezcla en el precio principal."""
    usable, *_ = filter_verified_listings(platform_slug, catalog_region, rows)
    shipping_by_bucket: dict[str, list[float]] = {bucket: [] for bucket in DISPLAY_BUCKETS}
    total_by_bucket: dict[str, list[float]] = {bucket: [] for bucket in DISPLAY_BUCKETS}

    from collectors.condition_resolve import resolve_condition_bucket

    for row in usable:
        if str(row.get("source") or "").lower() not in {"ebay", "ebay-es"}:
            continue
        bucket, _ = resolve_condition_bucket(
            row,
            platform_slug=platform_slug,
            use_vision=False,
            fetch_images=False,
        )
        if bucket not in DISPLAY_BUCKETS:
            continue
        try:
            shipping = float(row["shippingEur"])
            total = float(row["estimatedTotalToSpainEur"])
        except (KeyError, TypeError, ValueError):
            continue
        if shipping < 0 or total <= 0:
            continue
        shipping_by_bucket[bucket].append(shipping)
        total_by_bucket[bucket].append(total)

    changed = False
    for bucket in DISPLAY_BUCKETS:
        shipping_values = shipping_by_bucket[bucket]
        total_values = total_by_bucket[bucket]
        if len(shipping_values) < MIN_ESTIMATE_OBSERVATIONS or len(total_values) < MIN_ESTIMATE_OBSERVATIONS:
            continue
        shipping_estimate = round(median(shipping_values), 2)
        game[SHIPPING_TO_SPAIN_FIELDS[bucket]] = shipping_estimate

        item_price = game.get(CONDITION_PRICE_FIELDS[bucket])
        if isinstance(item_price, (int, float)) and item_price > 0:
            # El total mostrado debe corresponder a las dos cifras visibles:
            # precio principal del articulo + transporte estimado a Espana.
            total_estimate = round(float(item_price) + shipping_estimate, 2)
        else:
            total_estimate = round(median(total_values), 2)
        game[TOTAL_TO_SPAIN_FIELDS[bucket]] = total_estimate
        changed = True
    return changed


def pick_best_tc_rows(grouped: dict[str, list[dict[str, Any]]]) -> dict[str, dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for gid, rows in grouped.items():
        tc_rows = [r for r in rows if str(r.get("source", "")).lower() == "todocoleccion"]
        if not tc_rows:
            continue
        best[gid] = min(tc_rows, key=lambda r: float(r["priceEur"]))
    return best


def advance_rotation(order: list[str], current: str) -> str | None:
    if current not in order:
        return order[0] if order else None
    idx = order.index(current)
    return order[(idx + 1) % len(order)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync precios ES por plataforma")
    parser.add_argument("--platform", help="Plataforma concreta (slug)")
    parser.add_argument("--region", help="Filtrar región de catálogo (p. ej. PAL España)")
    parser.add_argument("--input", type=Path, help="JSON de anuncios ingestados")
    parser.add_argument("--catalog-ids-file", type=Path, help="Limitar escritura a estos IDs")
    parser.add_argument(
        "--allow-cross-region-catalog-ids",
        action="store_true",
        help="Permite IDs de otras regiones solo si figuran en --catalog-ids-file",
    )
    parser.add_argument(
        "--rotation-step",
        help="Entrada en rotationOrder (p. ej. batch:mini-neo-sega); default: --platform",
    )
    parser.add_argument(
        "--no-advance-rotation",
        action="store_true",
        help="Actualiza catálogo pero no avanza nextPlatformSlug",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--no-vision",
        action="store_true",
        help="No clasificar condición con IA visión (solo texto)",
    )
    args = parser.parse_args()

    from collectors.condition_resolve import reset_vision_stats, vision_stats

    reset_vision_stats()
    use_vision = not args.no_vision

    state = load_json(STATE_FILE)
    catalog: list[dict[str, Any]] = load_json(CATALOG_FILE)
    platforms = load_json(PLATFORMS_FILE)

    rotation: list[str] = state.get("rotationOrder") or [
        p["slug"] for p in sorted(platforms, key=lambda x: x.get("sortOrder", 99))
    ]

    platform_slug = args.platform or state.get("nextPlatformSlug") or rotation[0]
    if platform_slug not in {p["slug"] for p in platforms}:
        raise SystemExit(f"Plataforma desconocida: {platform_slug}")

    if not args.input or not args.input.exists():
        raise SystemExit(f"Falta --input con anuncios para {platform_slug}.")

    ingest = load_json(args.input)
    selected_catalog_ids: set[str] | None = None
    if args.catalog_ids_file:
        selected_raw = load_json(args.catalog_ids_file)
        if isinstance(selected_raw, dict):
            selected_raw = selected_raw.get("catalogIds") or []
        if not isinstance(selected_raw, list):
            raise SystemExit("--catalog-ids-file debe contener una lista JSON o {catalogIds: [...]}.")
        selected_catalog_ids = {str(value).strip() for value in selected_raw if str(value).strip()}
    if args.allow_cross_region_catalog_ids and selected_catalog_ids is None:
        raise SystemExit(
            "--allow-cross-region-catalog-ids exige --catalog-ids-file para limitar la escritura."
        )
    synced_at = ingest.get("collectedAt") or now_iso()
    catalog_by_id = {str(game.get("id")): game for game in catalog if game.get("id")}
    game_auto_verified = apply_game_preowned_auto_region_policy(ingest, catalog_by_id)
    if game_auto_verified:
        print(f"  GAME seminuevo autoaceptado PAL España: {game_auto_verified} filas")
    listings = ingest.get("listings") or []
    cex_rows = ingest.get("cex") or []
    jgo_rows = ingest.get("jgo") or []
    chollo_rows = ingest.get("chollo") or []
    kaoto_rows = ingest.get("kaoto") or []
    tcns_rows = ingest.get("tcns") or []
    source_only_tcns = str(ingest.get("source") or "").strip().lower() == "todoconsolas" and not any(
        (listings, cex_rows, jgo_rows, chollo_rows, kaoto_rows, ingest.get("tc") or [])
    )
    grouped = group_by_catalog_id(listings)
    cex_by_id = {str(r["catalogId"]): r for r in cex_rows if r.get("catalogId")}
    jgo_by_id = {str(r["catalogId"]): r for r in jgo_rows if r.get("catalogId")}
    chollo_by_id = {str(r["catalogId"]): r for r in chollo_rows if r.get("catalogId")}
    kaoto_by_id = {str(r["catalogId"]): r for r in kaoto_rows if r.get("catalogId")}
    tcns_by_id = {str(r["catalogId"]): r for r in tcns_rows if r.get("catalogId")}

    targets = [
        g
        for g in catalog
        if catalog_game_in_write_scope(
            g,
            platform_slug=platform_slug,
            region=args.region,
            selected_catalog_ids=selected_catalog_ids,
            allow_cross_region_catalog_ids=args.allow_cross_region_catalog_ids,
        )
    ]
    ranges_cleared = 0 if source_only_tcns else clear_unverified_market_ranges(targets)
    if ranges_cleared:
        print(f"Rangos Excel eliminados en {ranges_cleared} juegos dentro del alcance.")
    target_ids = {g["id"] for g in targets}
    by_id = {g["id"]: g for g in catalog}
    coverage_before = price_coverage_snapshot(catalog, platform_slug, args.region)

    updated = 0
    wallapop_updated = 0
    ebay_updated = 0
    vinted_updated = 0
    skipped = 0
    rejected_outliers = 0
    rejected_unverified = 0
    rejected_mismatch = 0
    rejected_stale = 0
    rejected_insufficient = 0
    cex_updated = 0
    cex_skipped = 0
    jgo_updated = 0
    jgo_skipped = 0
    chollo_updated = 0
    chollo_skipped = 0
    kaoto_updated = 0
    kaoto_skipped = 0
    tcns_updated = 0
    tcns_skipped = 0
    tc_updated = 0
    tc_skipped = 0
    tc_by_id = pick_best_tc_rows(grouped)

    for game in targets:
        gid = game["id"]
        rows = grouped.get(gid, [])
        catalog_region = str(game.get("region") or "")

        usable, unv, mismatch, insufficient, stale = filter_verified_listings(
            platform_slug, catalog_region, rows
        )
        rejected_unverified += unv
        rejected_mismatch += mismatch
        rejected_insufficient += insufficient
        rejected_stale += stale

        if usable:
            prices = [float(r["priceEur"]) for r in usable if r.get("priceEur") is not None]
            sources = {str(r.get("source", "other")).lower() for r in usable}
            previous = game.get("recommendedPrice")
            pc_ref = game.get("pcRefPrice")

            est, market_min, market_max, _, rej, accepted_count = estimate_price(prices, previous, pc_ref)
            rejected_outliers += rej

            if est is not None and market_min is not None and market_max is not None:
                game["recommendedPrice"] = est
                game["marketMin"] = market_min
                game["marketMax"] = market_max
                game["priceSource"] = price_source_label(sources)
                game["deltaEsVsPc"] = delta_es_vs_pc(est, pc_ref)
                game["updatedAt"] = synced_at
                game["hasEsPrice"] = True
                game["priceRegionVerified"] = accepted_count >= MIN_VERIFIED_OBSERVATIONS
                updated += 1
                if "wallapop" in sources:
                    wallapop_updated += 1
                if "ebay-es" in sources:
                    ebay_updated += 1
                if "vinted-es" in sources:
                    vinted_updated += 1
            else:
                skipped += 1
        else:
            skipped += 1

        cex_row = cex_by_id.get(gid)
        if cex_row:
            if apply_cex_row(game, cex_row, platform_slug, synced_at):
                cex_updated += 1
            else:
                cex_skipped += 1

        by_id[gid] = game

    platform_games = [
        g
        for g in catalog
        if catalog_game_in_write_scope(
            g,
            platform_slug=platform_slug,
            region=args.region,
            selected_catalog_ids=selected_catalog_ids,
            allow_cross_region_catalog_ids=args.allow_cross_region_catalog_ids,
        )
    ]
    for game in platform_games:
        gid = game["id"]
        jgo_row = jgo_by_id.get(gid)
        if not jgo_row:
            continue
        if apply_jgo_row(game, jgo_row, synced_at):
            jgo_updated += 1
        else:
            jgo_skipped += 1
        by_id[gid] = game

    for game in platform_games:
        gid = game["id"]
        chollo_row = chollo_by_id.get(gid)
        if not chollo_row:
            continue
        if apply_chollo_row(game, chollo_row, synced_at):
            chollo_updated += 1
        else:
            chollo_skipped += 1
        by_id[gid] = game

    for game in platform_games:
        gid = game["id"]
        kaoto_row = kaoto_by_id.get(gid)
        if not kaoto_row:
            continue
        if apply_kaoto_row(game, kaoto_row, synced_at):
            kaoto_updated += 1
        else:
            kaoto_skipped += 1
        by_id[gid] = game

    for game in platform_games:
        gid = game["id"]
        tcns_row = tcns_by_id.get(gid)
        if not tcns_row:
            continue
        if apply_tcns_row(game, tcns_row, synced_at):
            tcns_updated += 1
        else:
            tcns_skipped += 1
        by_id[gid] = game

    for game in platform_games:
        gid = game["id"]
        tc_row = tc_by_id.get(gid)
        if not tc_row:
            continue
        if apply_tc_row(game, tc_row, synced_at):
            tc_updated += 1
        else:
            tc_skipped += 1
        by_id[gid] = game

    condition_updated = 0
    delivery_updated = 0
    for game in platform_games:
        gid = game["id"]
        catalog_region = str(game.get("region") or "")
        observations = collect_condition_observations(
            gid,
            catalog_region,
            platform_slug,
            grouped=grouped,
            cex_by_id=cex_by_id,
            jgo_by_id=jgo_by_id,
            chollo_by_id=chollo_by_id,
            kaoto_by_id=kaoto_by_id,
            tcns_by_id=tcns_by_id,
            tc_by_id=tc_by_id,
            catalog_game=game,
            use_vision=use_vision,
        )
        if apply_condition_price_estimates(
            game,
            observations,
            synced_at=synced_at,
            pc_ref=game.get("pcRefPrice"),
        ):
            condition_updated += 1
        if apply_ebay_delivery_estimates(
            game,
            grouped.get(gid, []),
            catalog_region=catalog_region,
            platform_slug=platform_slug,
        ):
            delivery_updated += 1
        by_id[gid] = game

    coverage = round((updated / len(targets)) * 100, 1) if targets else 0.0
    catalog_after = list(by_id.values())
    coverage_after = price_coverage_snapshot(catalog_after, platform_slug, args.region)
    priced_games_before = int(coverage_before["pricedGames"])
    priced_games_after = int(coverage_after["pricedGames"])
    total_games_in_scope = int(coverage_after["totalGames"])
    priced_games_delta = priced_games_after - priced_games_before
    price_list_coverage_before = float(coverage_before["coveragePct"])
    price_list_coverage_after = float(coverage_after["coveragePct"])
    price_list_coverage_delta = round(
        price_list_coverage_after - price_list_coverage_before,
        1,
    )

    print(f"Plataforma: {platform_slug}")
    if args.region:
        print(f"  Región catálogo: {args.region}")
    print(f"  Objetivo catálogo: {len(targets)} juegos")
    print(f"  P2P con ingest: {len(set(grouped) & target_ids)}")
    print(f"  Precio P2P actualizado: {updated}")
    print(f"  Wallapop actualizado (P2P): {wallapop_updated}")
    print(f"  eBay actualizado (P2P): {ebay_updated}")
    print(f"  Vinted actualizado (P2P): {vinted_updated}")
    print(f"  CeX actualizado (retail aparte): {cex_updated}")
    print(f"  CeX rechazado (región): {cex_skipped}")
    print(f"  JGO actualizado (retail aparte): {jgo_updated}")
    print(f"  JGO rechazado (región): {jgo_skipped}")
    print(f"  Chollo actualizado (retail aparte): {chollo_updated}")
    print(f"  Chollo rechazado (región): {chollo_skipped}")
    print(f"  Kaoto actualizado (retail aparte): {kaoto_updated}")
    print(f"  Kaoto rechazado (región): {kaoto_skipped}")
    print(f"  TodoConsolas actualizado (retail aparte): {tcns_updated}")
    print(f"  TodoConsolas rechazado (región): {tcns_skipped}")
    print(f"  TodoColeccion actualizado (referencia P2P ES): {tc_updated}")
    print(f"  TodoColeccion rechazado (región): {tc_skipped}")
    print(f"  Precios por estado (suelto/completo/precintado): {condition_updated}")
    print(f"  Transporte eBay a España separado: {delivery_updated}")
    vstats = vision_stats()
    ai_summary = build_ai_summary(ingest, condition_vision_stats=vstats)
    if use_vision:
        print(
            "  IA visión condición: "
            f"{vstats['resolved']}/{vstats['calls']} resueltas "
            f"(texto ya claro: {vstats['skipped_has_bucket']}, sin pistas: {vstats['skipped_no_hints']}, "
            f"sin imagen: {vstats['skipped_no_images']})"
        )
    elif not use_vision:
        print("  IA visión condición: desactivada (--no-vision)")
    print(f"  Sin dato P2P / rechazado: {skipped}")
    print(f"  Anuncios sin región verificada: {rejected_unverified}")
    print(f"  Anuncios antiguos (>{max_listing_age_days()} días): {rejected_stale}")
    print(f"  Región distinta al catálogo: {rejected_mismatch}")
    print(f"  Pruebas insuficientes (reglas plataforma): {rejected_insufficient}")
    print(f"  Outliers de precio: {rejected_outliers}")
    print(f"  Cobertura P2P: {coverage}%")
    print(
        "  Avance listado con precio: "
        f"{priced_games_before}/{total_games_in_scope} → "
        f"{priced_games_after}/{total_games_in_scope} "
        f"({price_list_coverage_before}% → {price_list_coverage_after}%, "
        f"{price_list_coverage_delta:+.1f} puntos)"
    )

    if args.dry_run:
        print("Dry-run: no se escriben archivos.")
        return

    try:
        review_stats = record_price_review_candidates(ingest, platform_slug)
        if review_stats.get("added") or review_stats.get("updated"):
            print(
                "  Precios a revisar: "
                f"+{review_stats.get('added', 0)} nuevos · "
                f"{review_stats.get('updated', 0)} actualizados · "
                f"{review_stats.get('pending', 0)} pendientes"
            )
    except Exception as exc:  # noqa: BLE001
        print(f"  AVISO: no se pudo actualizar la cola de precios a revisar: {exc}")

    history_recorded = record_platform_snapshots(platform_games, synced_at=synced_at)
    if history_recorded:
        print(f"  Histórico precios: {history_recorded} puntos nuevos/actualizados")

    save_json(CATALOG_FILE, catalog_after)

    platform_run_state = {
        "lastSyncAt": synced_at,
        "source": price_source_label({str(r.get("source", "other")).lower() for r in listings}),
        "gamesTargeted": len(targets),
        "gamesUpdated": updated,
        "wallapopGamesUpdated": wallapop_updated,
        "ebayGamesUpdated": ebay_updated,
        "vintedGamesUpdated": vinted_updated,
        "gamesSkippedNoData": skipped,
        "gamesRejectedOutliers": rejected_outliers,
        "gamesRejectedUnverifiedRegion": rejected_unverified,
        "gamesRejectedRegionMismatch": rejected_mismatch,
        "gamesRejectedInsufficientEvidence": rejected_insufficient,
        "cexGamesUpdated": cex_updated,
        "cexGamesSkipped": cex_skipped,
        "jgoGamesUpdated": jgo_updated,
        "jgoGamesSkipped": jgo_skipped,
        "cholloGamesUpdated": chollo_updated,
        "cholloGamesSkipped": chollo_skipped,
        "kaotoGamesUpdated": kaoto_updated,
        "kaotoGamesSkipped": kaoto_skipped,
        "tcnsGamesUpdated": tcns_updated,
        "tcnsGamesSkipped": tcns_skipped,
        "tcGamesUpdated": tc_updated,
        "tcGamesSkipped": tc_skipped,
        "coveragePct": coverage,
        "priceListTotalGames": total_games_in_scope,
        "priceListPricedBefore": priced_games_before,
        "priceListPricedAfter": priced_games_after,
        "priceListPricedDelta": priced_games_delta,
        "priceListCoverageBeforePct": price_list_coverage_before,
        "priceListCoverageAfterPct": price_list_coverage_after,
        "priceListCoverageDeltaPct": price_list_coverage_delta,
        "ebayDeliveryGamesUpdated": delivery_updated,
        "regionPolicy": "Reglas en data/region-evidence-rules.json",
        "aiSummary": ai_summary,
    }
    platforms_state = state.setdefault("platforms", {})
    if source_only_tcns:
        previous_platform_state = dict(platforms_state.get(platform_slug) or {})
        if not all(key in previous_platform_state for key in ("source", "gamesTargeted", "gamesUpdated")):
            previous_platform_state = dict(platform_run_state)
        source_runs = dict(previous_platform_state.get("sourceRuns") or {})
        source_runs["todoconsolas"] = {
            "lastSyncAt": synced_at,
            "gamesTargeted": len(targets),
            "gamesUpdated": tcns_updated,
            "gamesSkipped": tcns_skipped,
            "policy": TCNS_POLICY_VERSION,
        }
        previous_platform_state.update(
            {
                "lastSyncAt": synced_at,
                "tcnsGamesUpdated": tcns_updated,
                "tcnsGamesSkipped": tcns_skipped,
                "sourceRuns": source_runs,
            }
        )
        platforms_state[platform_slug] = previous_platform_state
    else:
        platforms_state[platform_slug] = platform_run_state
    if args.region:
        regions_state = state.setdefault("regions", {})
        platform_regions = regions_state.setdefault(platform_slug, {})
        platform_regions[args.region] = {
            "lastSyncAt": synced_at,
            "source": price_source_label({str(r.get("source", "other")).lower() for r in listings}),
            "gamesTargeted": len(targets),
            "gamesUpdated": updated,
            "wallapopGamesUpdated": wallapop_updated,
            "ebayGamesUpdated": ebay_updated,
            "vintedGamesUpdated": vinted_updated,
            "coveragePct": coverage,
            "priceListTotalGames": total_games_in_scope,
            "priceListPricedBefore": priced_games_before,
            "priceListPricedAfter": priced_games_after,
            "priceListPricedDelta": priced_games_delta,
            "priceListCoverageBeforePct": price_list_coverage_before,
            "priceListCoverageAfterPct": price_list_coverage_after,
            "priceListCoverageDeltaPct": price_list_coverage_delta,
            "aiSummary": ai_summary,
        }
    state["lastRunAt"] = now_iso()
    rotation_step = args.rotation_step or platform_slug
    if not args.no_advance_rotation:
        state["nextPlatformSlug"] = advance_rotation(rotation, rotation_step)
    state["rotationOrder"] = rotation
    save_json(STATE_FILE, state)

    if META_FILE.exists():
        meta = load_json(META_FILE)
        meta["lastEsPriceSyncAt"] = state["lastRunAt"]
        meta["lastEsPriceSyncPlatform"] = platform_slug
        save_json(META_FILE, meta)

    if args.no_advance_rotation:
        print("Rotación no avanzada (--no-advance-rotation).")
    else:
        print(f"Siguiente en rotación: {state['nextPlatformSlug']}")


if __name__ == "__main__":
    main()
