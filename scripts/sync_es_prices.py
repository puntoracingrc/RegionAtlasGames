#!/usr/bin/env python3
"""Sincronización semanal de precios ES por plataforma (rotación).

- P2P (Wallapop / eBay / Vinted): mediana con región verificada + reglas por plataforma.
- CeX: cexSellPrice / cexCashPrice aparte (no entra en la mediana P2P).

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

from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
STATE_FILE = ROOT / "data" / "price-sync-state.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
META_FILE = ROOT / "data" / "meta.json"

DEFAULT_FLOOR = 3.0
MAX_DROP_RATIO = 0.5
MIN_VS_PC_REF = 0.25
IQR_MULTIPLIER = 1.5

ES_MARKET_EXCLUDE = {"usa", "japón", "japan", "australia", "pal uk/eng", "pal alemania"}

REGION_ALIASES: dict[str, set[str]] = {
    "pal españa": {"pal españa", "españa"},
    "españa": {"pal españa", "españa"},
    "japón": {"japón", "japan"},
    "japan": {"japón", "japan"},
}


def normalize_region(region: str) -> str:
    return region.strip().lower()


def catalog_regions_match(catalog_region: str, listing_region: str) -> bool:
    c = normalize_region(catalog_region)
    l = normalize_region(listing_region)
    if c == l:
        return True
    if l in REGION_ALIASES.get(c, set()):
        return True
    if c in REGION_ALIASES.get(l, set()):
        return True
    return False


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
) -> tuple[list[dict[str, Any]], int, int, int]:
    usable: list[dict[str, Any]] = []
    unverified = 0
    mismatch = 0
    insufficient = 0

    for row in rows:
        if not is_listing_region_verified(row):
            unverified += 1
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

    return usable, unverified, mismatch, insufficient


def is_es_market_game(game: dict[str, Any]) -> bool:
    region = (game.get("region") or "").strip().lower()
    return region not in ES_MARKET_EXCLUDE


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

    if row.get("regionVerified") is not True:
        return False
    if not listing_region or not catalog_regions_match(catalog_region, listing_region):
        return False
    if not evidence:
        return False
    ok, _ = check_listing_evidence_meets_rules(
        platform_slug,
        catalog_region,
        evidence,
        float(row["aiConfidence"]) if row.get("aiConfidence") is not None else None,
    )
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


def advance_rotation(order: list[str], current: str) -> str | None:
    if current not in order:
        return order[0] if order else None
    idx = order.index(current)
    return order[(idx + 1) % len(order)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync precios ES por plataforma")
    parser.add_argument("--platform", help="Plataforma concreta (slug)")
    parser.add_argument("--input", type=Path, help="JSON de anuncios ingestados")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

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
    grouped = group_by_catalog_id(listings)
    cex_by_id = {str(r["catalogId"]): r for r in cex_rows if r.get("catalogId")}

    targets = [
        g
        for g in catalog
        if g.get("platformSlug") == platform_slug
        and g.get("listingStatus") != "excluded"
        and is_es_market_game(g)
    ]
    target_ids = {g["id"] for g in targets}
    by_id = {g["id"]: g for g in catalog}

    updated = 0
    skipped = 0
    rejected_outliers = 0
    rejected_unverified = 0
    rejected_mismatch = 0
    rejected_insufficient = 0
    cex_updated = 0
    cex_skipped = 0

    for game in targets:
        gid = game["id"]
        rows = grouped.get(gid, [])
        catalog_region = str(game.get("region") or "")

        usable, unv, mismatch, insufficient = filter_verified_listings(
            platform_slug, catalog_region, rows
        )
        rejected_unverified += unv
        rejected_mismatch += mismatch
        rejected_insufficient += insufficient

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

    coverage = round((updated / len(targets)) * 100, 1) if targets else 0.0

    print(f"Plataforma: {platform_slug}")
    print(f"  Objetivo mercado ES: {len(targets)} juegos")
    print(f"  P2P con ingest: {len(set(grouped) & target_ids)}")
    print(f"  Precio P2P actualizado: {updated}")
    print(f"  CeX actualizado (retail aparte): {cex_updated}")
    print(f"  CeX rechazado (región): {cex_skipped}")
    print(f"  Sin dato P2P / rechazado: {skipped}")
    print(f"  Anuncios sin región verificada: {rejected_unverified}")
    print(f"  Región distinta al catálogo: {rejected_mismatch}")
    print(f"  Pruebas insuficientes (reglas plataforma): {rejected_insufficient}")
    print(f"  Outliers de precio: {rejected_outliers}")
    print(f"  Cobertura P2P: {coverage}%")

    if args.dry_run:
        print("Dry-run: no se escriben archivos.")
        return

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
        "coveragePct": coverage,
        "regionPolicy": "Reglas en data/region-evidence-rules.json",
    }
    state["lastRunAt"] = now_iso()
    state["nextPlatformSlug"] = advance_rotation(rotation, platform_slug)
    state["rotationOrder"] = rotation
    save_json(STATE_FILE, state)

    if META_FILE.exists():
        meta = load_json(META_FILE)
        meta["lastEsPriceSyncAt"] = state["lastRunAt"]
        meta["lastEsPriceSyncPlatform"] = platform_slug
        save_json(META_FILE, meta)

    print(f"Siguiente en rotación: {state['nextPlatformSlug']}")


if __name__ == "__main__":
    main()
