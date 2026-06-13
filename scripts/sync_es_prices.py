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
from collectors.condition_buckets import (  # noqa: E402
    DISPLAY_BUCKETS,
    format_data_sources,
    mean_by_bucket,
    observation_from_row,
)
from collectors.price_history import record_platform_snapshots  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
STATE_FILE = ROOT / "data" / "price-sync-state.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
META_FILE = ROOT / "data" / "meta.json"

DEFAULT_FLOOR = 3.0
MAX_DROP_RATIO = 0.5
MIN_VS_PC_REF = 0.25
IQR_MULTIPLIER = 1.5

ES_MARKET_FOCUS = {"pal españa", "españa", "pal europa"}


def is_price_tracked_game(game: dict[str, Any]) -> bool:
    """Todas las ediciones del catálogo entran en el sync si cumplen reglas de región."""
    return game.get("listingStatus") != "excluded"


def is_es_market_game(game: dict[str, Any]) -> bool:
    """Retrocompat: ya no excluye Japón/USA del rastreo de precios."""
    return is_price_tracked_game(game)


def is_listing_region_verified(row: dict[str, Any]) -> bool:
    if row.get("regionVerified") is not True:
        return False
    if not str(row.get("listingRegion") or "").strip():
        return False
    evidence = row.get("regionEvidence") or []
    return isinstance(evidence, list) and len(evidence) > 0


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


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def median(values: list[float]) -> float:
    return statistics.median(values)


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
) -> tuple[float | None, float | None, float | None, str | None, int]:
    """Mediana + rango (min/máx) sobre anuncios aceptados tras filtrar outliers."""
    accepted, rejected = filter_prices(prices, previous, pc_ref)
    if not prices:
        return None, None, None, "no_listings", 0
    if not accepted:
        return None, None, None, "all_rejected", len(rejected)

    est = round(median(accepted), 2)
    market_min = round(min(accepted), 2)
    market_max = round(max(accepted), 2)
    if previous and previous > 10 and est < previous * MAX_DROP_RATIO:
        return None, None, None, "drop_too_steep", len(rejected)
    return est, market_min, market_max, None, len(rejected)


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
        row = {**row, "source": row.get("source") or source_name}
        obs = _row_observation(row, catalog_region=catalog_region, platform_slug=platform_slug, use_vision=use_vision)
        if obs:
            observations.append(obs)

    return observations


def apply_condition_price_estimates(
    game: dict[str, Any],
    observations: list[tuple[float, str, str]],
    *,
    synced_at: str,
    pc_ref: float | None,
) -> bool:
    estimates, sources = mean_by_bucket(observations)
    if not any(estimates.get(b) is not None for b in DISPLAY_BUCKETS):
        game["estimatedPriceLoose"] = None
        game["estimatedPriceComplete"] = None
        game["estimatedPriceSealed"] = None
        game["priceDataSources"] = None
        return False

    game["estimatedPriceLoose"] = estimates.get("loose")
    game["estimatedPriceComplete"] = estimates.get("complete")
    game["estimatedPriceSealed"] = estimates.get("sealed")
    game["priceDataSources"] = format_data_sources(sources)
    game["hasEsPrice"] = True
    game["priceRegionVerified"] = True
    game["updatedAt"] = synced_at

    primary = (
        estimates.get("complete")
        or estimates.get("loose")
        or estimates.get("sealed")
    )
    game["recommendedPrice"] = primary
    game["deltaEsVsPc"] = delta_es_vs_pc(primary, pc_ref)

    bucket_prices = [p for p in estimates.values() if p is not None]
    if bucket_prices:
        game["marketMin"] = round(min(bucket_prices), 2)
        game["marketMax"] = round(max(bucket_prices), 2)
    return True


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
    parser.add_argument("--input", type=Path, help="JSON de anuncios ingestados")
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
    ranges_cleared = clear_unverified_market_ranges(catalog)
    if ranges_cleared:
        print(f"Rangos Excel eliminados en {ranges_cleared} juegos sin verificar región.")

    rotation: list[str] = state.get("rotationOrder") or [
        p["slug"] for p in sorted(platforms, key=lambda x: x.get("sortOrder", 99))
    ]

    platform_slug = args.platform or state.get("nextPlatformSlug") or rotation[0]
    if platform_slug not in {p["slug"] for p in platforms}:
        raise SystemExit(f"Plataforma desconocida: {platform_slug}")

    if not args.input or not args.input.exists():
        raise SystemExit(f"Falta --input con anuncios para {platform_slug}.")

    ingest = load_json(args.input)
    synced_at = ingest.get("collectedAt") or now_iso()
    listings = ingest.get("listings") or []
    cex_rows = ingest.get("cex") or []
    jgo_rows = ingest.get("jgo") or []
    chollo_rows = ingest.get("chollo") or []
    kaoto_rows = ingest.get("kaoto") or []
    tcns_rows = ingest.get("tcns") or []
    grouped = group_by_catalog_id(listings)
    cex_by_id = {str(r["catalogId"]): r for r in cex_rows if r.get("catalogId")}
    jgo_by_id = {str(r["catalogId"]): r for r in jgo_rows if r.get("catalogId")}
    chollo_by_id = {str(r["catalogId"]): r for r in chollo_rows if r.get("catalogId")}
    kaoto_by_id = {str(r["catalogId"]): r for r in kaoto_rows if r.get("catalogId")}
    tcns_by_id = {str(r["catalogId"]): r for r in tcns_rows if r.get("catalogId")}

    targets = [
        g
        for g in catalog
        if g.get("platformSlug") == platform_slug
        and is_price_tracked_game(g)
    ]
    target_ids = {g["id"] for g in targets}
    by_id = {g["id"]: g for g in catalog}

    updated = 0
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

            est, market_min, market_max, _, rej = estimate_price(prices, previous, pc_ref)
            rejected_outliers += rej

            if est is not None and market_min is not None and market_max is not None:
                game["recommendedPrice"] = est
                game["marketMin"] = market_min
                game["marketMax"] = market_max
                game["priceSource"] = price_source_label(sources)
                game["deltaEsVsPc"] = delta_es_vs_pc(est, pc_ref)
                game["updatedAt"] = synced_at
                game["hasEsPrice"] = True
                game["priceRegionVerified"] = True
                updated += 1
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
        if g.get("platformSlug") == platform_slug and g.get("listingStatus") != "excluded"
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
            use_vision=use_vision,
        )
        if apply_condition_price_estimates(
            game,
            observations,
            synced_at=synced_at,
            pc_ref=game.get("pcRefPrice"),
        ):
            condition_updated += 1
        by_id[gid] = game

    coverage = round((updated / len(targets)) * 100, 1) if targets else 0.0

    print(f"Plataforma: {platform_slug}")
    print(f"  Objetivo catálogo (todas las regiones): {len(targets)} juegos")
    print(f"  P2P con ingest: {len(set(grouped) & target_ids)}")
    print(f"  Precio P2P actualizado: {updated}")
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
    vstats = vision_stats()
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

    if args.dry_run:
        print("Dry-run: no se escriben archivos.")
        return

    history_recorded = record_platform_snapshots(platform_games, synced_at=synced_at)
    if history_recorded:
        print(f"  Histórico precios: {history_recorded} puntos nuevos/actualizados")

    save_json(CATALOG_FILE, list(by_id.values()))

    state.setdefault("platforms", {})[platform_slug] = {
        "lastSyncAt": synced_at,
        "source": price_source_label({str(r.get("source", "other")).lower() for r in listings}),
        "gamesTargeted": len(targets),
        "gamesUpdated": updated,
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
        "regionPolicy": "Reglas en data/region-evidence-rules.json",
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
