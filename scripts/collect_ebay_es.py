#!/usr/bin/env python3
"""Collector eBay ES → data/price-ingest/{platform}.json (Fase 2).

Requiere credenciales (una de):
  EBAY_APP_ID          — Finding API (activos + vendidos, recomendado)
  EBAY_CLIENT_ID + EBAY_CLIENT_SECRET — Browse API (solo activos)

Ejemplos:
  python3 scripts/collect_ebay_es.py --platform ps2 --limit 5 --sold --dry-run
  python3 scripts/collect_ebay_es.py --platform ps2 --limit 20 --output data/price-ingest/ps2-ebay.json
  python3 scripts/collect_ebay_es.py --platform ps2 --merge --output data/price-ingest/pilot-ps2.json
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402
from collectors.common import (  # noqa: E402
    INGEST_DIR,
    build_search_query,
    es_market_games,
    load_json,
    load_platforms,
    now_iso,
    save_json,
    to_ingest_listing,
)
from collectors.ebay_client import search_ebay_es  # noqa: E402
from collectors.reference_match import build_platform_reference_index, listing_reference_valid_for_catalog  # noqa: E402
from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402

REQUEST_DELAY = 1.0
CACHE_DIR = INGEST_DIR / "cache" / "ebay"


def passes_rules(platform_slug: str, catalog_region: str, row: dict) -> bool:
    if not row.get("regionVerified"):
        return False
    evidence = [str(e) for e in row.get("regionEvidence") or []]
    ai = row.get("aiConfidence")
    ai_val = float(ai) if ai is not None else None
    ok, _ = check_listing_evidence_meets_rules(platform_slug, catalog_region, evidence, ai_val)
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Collector eBay ES → ingest JSON")
    parser.add_argument("--platform", required=True, help="Slug plataforma (ps2, ps4, dreamcast…)")
    parser.add_argument("--region", help="Filtrar región catálogo (p. ej. PAL España)")
    parser.add_argument("--limit", type=int, default=10, help="Máximo juegos a procesar")
    parser.add_argument("--per-game", type=int, default=8, help="Anuncios eBay por juego")
    parser.add_argument("--sold", action="store_true", help="Solo vendidos (Finding API)")
    parser.add_argument("--active", action="store_true", help="Solo activos")
    parser.add_argument("--output", type=Path, help="JSON destino (default: data/price-ingest/{platform}-ebay.json)")
    parser.add_argument("--merge", action="store_true", help="Fusionar con JSON existente")
    parser.add_argument("--use-cache", action="store_true", help="Leer caché por juego si existe")
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, help="Segundos entre búsquedas")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sold = args.sold or not args.active
    active = args.active or not args.sold
    if args.sold and args.active:
        sold = active = True

    platforms = load_platforms()
    if args.platform not in platforms:
        raise SystemExit(f"Plataforma desconocida: {args.platform}")

    games = es_market_games(args.platform, args.region)[: args.limit]
    out = args.output or INGEST_DIR / f"{args.platform}-ebay.json"
    _, ref_to_ids = build_platform_reference_index(args.platform)

    payload = load_json(out, {"listings": [], "cex": []}) if args.merge else {"listings": [], "cex": []}
    payload["platformSlug"] = args.platform
    payload["collectedAt"] = now_iso()
    payload["notes"] = (
        f"eBay ES collector — sold={sold} active={active}. "
        "Región inferida del título; revisar con IA en Fase 2b."
    )

    if not args.merge:
        payload["listings"] = []

    report = {
        "platform": args.platform,
        "gamesRequested": len(games),
        "gamesWithListings": 0,
        "listingsAdded": 0,
        "skippedRules": 0,
        "skippedTitle": 0,
        "skippedReference": 0,
        "matchedReference": 0,
        "errors": [],
        "backend": None,
    }

    print(f"Juegos: {len(games)} · sold={sold} active={active}")

    for idx, game in enumerate(games, start=1):
        catalog_id = game["id"]
        catalog_region = game.get("region") or ""
        query = build_search_query(game, platforms.get(args.platform))
        cache_file = CACHE_DIR / args.platform / f"{catalog_id}.json"
        game_listings: list[dict] = []

        try:
            modes: list[tuple[bool, str]] = []
            if sold:
                modes.append((True, "sold"))
            if active:
                modes.append((False, "active"))

            cached = load_json(cache_file) if args.use_cache and cache_file.exists() else None
            if cached:
                raw_items = cached.get("items", [])
                report["backend"] = cached.get("backend")
            else:
                raw_items = []
                for is_sold, label in modes:
                    items, backend = search_ebay_es(query, sold=is_sold, max_results=args.per_game)
                    report["backend"] = backend
                    for item in items:
                        item["_listingType"] = label
                    raw_items.extend(items)
                    if idx < len(games) or label != modes[-1][1]:
                        time.sleep(args.delay)
                if not args.dry_run:
                    save_json(
                        cache_file,
                        {"query": query, "backend": report["backend"], "items": raw_items},
                    )

            added_for_game = 0
            for item in raw_items[: args.per_game * (1 + int(sold) + int(active))]:
                listing_type = "sold" if item.get("_listingType") == "sold" else "active"
                item_title = item.get("title", "")
                ok_ref, _ = listing_reference_valid_for_catalog(
                    item_title,
                    catalog_id,
                    catalog_region,
                    ref_to_ids=ref_to_ids,
                )
                if not ok_ref:
                    report["skippedReference"] += 1
                    continue
                row = to_ingest_listing(
                    catalog_id=catalog_id,
                    source="ebay-es",
                    listing_type=listing_type,
                    price_eur=float(item["priceEur"]),
                    title=item_title,
                    catalog_region=catalog_region,
                    external_id=item.get("itemId"),
                    ref_to_ids=ref_to_ids,
                )
                if not row:
                    report["skippedTitle"] += 1
                    continue
                if row.get("matchedReference"):
                    report["matchedReference"] += 1
                if not passes_rules(args.platform, catalog_region, row):
                    report["skippedRules"] += 1
                    continue
                game_listings.append(row)
                added_for_game += 1

            if game_listings:
                report["gamesWithListings"] += 1
                report["listingsAdded"] += added_for_game
                payload["listings"].extend(game_listings)
                print(f"  [{idx}/{len(games)}] {game['title'][:40]} → +{added_for_game} ({query})")
            else:
                print(f"  [{idx}/{len(games)}] {game['title'][:40]} → 0 ({query})")

        except Exception as exc:  # noqa: BLE001
            report["errors"].append({"catalogId": catalog_id, "error": str(exc)})
            print(f"  [{idx}/{len(games)}] ERROR {catalog_id}: {exc}")

        if not cached and idx < len(games):
            time.sleep(args.delay)

    print(
        f"\nTotal anuncios: {len(payload['listings'])} · "
        f"juegos con datos: {report['gamesWithListings']} · "
        f"ref. SKU: {report['matchedReference']} · "
        f"rechazados ref.: {report['skippedReference']} · "
        f"backend: {report['backend']}"
    )

    if args.dry_run:
        print("Dry-run: no escrito.")
        return

    save_json(out, payload)
    report_path = INGEST_DIR / "reports" / f"ebay-{args.platform}-{now_iso()[:10]}.json"
    save_json(report_path, report)
    print(f"Escrito: {out}")
    print(f"Informe: {report_path}")

    code = validate_ingest(out)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
