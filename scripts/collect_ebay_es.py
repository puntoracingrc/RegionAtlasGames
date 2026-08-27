#!/usr/bin/env python3
"""Collector eBay ES → data/price-ingest/{platform}.json (Fase 2).

Requiere credenciales (una de):
  EBAY_CLIENT_ID + EBAY_CLIENT_SECRET — Browse API (activos/precio fijo, recomendado)
  EBAY_APP_ID          — Finding API legacy (vendidos solo con EBAY_ALLOW_LEGACY_SOLD=1)

Ejemplos:
  python3 scripts/collect_ebay_es.py --platform ps2 --limit 5 --active --dry-run
  python3 scripts/collect_ebay_es.py --platform ps2 --limit 20 --output data/price-ingest/ps2-ebay.json
  python3 scripts/collect_ebay_es.py --platform ps2 --merge --output data/price-ingest/pilot-ps2.json
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402
from collectors.cache_policy import attach_policy_version  # noqa: E402
from collectors.common import (  # noqa: E402
    INGEST_DIR,
    build_ebay_search_query,
    es_market_games,
    load_json,
    load_platforms,
    now_iso,
    save_json,
    to_ingest_listing,
)
from collectors.ebay_client import is_active_auction, search_ebay_es  # noqa: E402
from collectors.ebay_game_cache import (  # noqa: E402
    GAME_CACHE_DIR,
    game_cache_is_fresh,
    load_game_cache,
)
from collectors.ebay_listing_cache import read_listing_cache, write_listing_cache  # noqa: E402
from collectors.reference_match import build_platform_reference_index, listing_reference_valid_for_catalog  # noqa: E402
from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402

REQUEST_DELAY = 1.0


def requested_catalog_ids(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8")
    try:
        payload = load_json(path, [])
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        payload = payload.get("catalogIds") or []
    if isinstance(payload, list):
        return [str(value).strip() for value in payload if str(value).strip()]
    return [line.strip() for line in raw.splitlines() if line.strip() and not line.startswith("#")]


def select_games(platform_slug: str, region: str | None, limit: int, ids_file: Path | None) -> list[dict[str, Any]]:
    games = es_market_games(platform_slug, region)
    if not ids_file:
        return games[:limit]
    requested = requested_catalog_ids(ids_file)
    by_id = {str(game.get("id")): game for game in games}
    missing = [catalog_id for catalog_id in requested if catalog_id not in by_id]
    if missing:
        raise SystemExit(f"IDs fuera de la plataforma/región: {', '.join(missing[:10])}")
    return [by_id[catalog_id] for catalog_id in requested[:limit]]


def passes_rules(platform_slug: str, catalog_region: str, row: dict) -> bool:
    if not row.get("regionVerified"):
        return False
    evidence = [str(e) for e in row.get("regionEvidence") or []]
    ai = row.get("aiConfidence")
    ai_val = float(ai) if ai is not None else None
    ok, _ = check_listing_evidence_meets_rules(platform_slug, catalog_region, evidence, ai_val)
    return ok


def process_ebay_item(
    item: dict[str, Any],
    *,
    game: dict[str, Any],
    platform_slug: str,
    catalog_id: str,
    catalog_region: str,
    ref_to_ids: dict[str, list[str]],
    use_listing_cache: bool,
    report: dict[str, Any],
) -> dict[str, Any] | None:
    if is_active_auction(item):
        report["skippedAuctions"] += 1
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=False,
                skip_reason="auction",
            )
        return None

    if use_listing_cache:
        cached = read_listing_cache(
            item,
            platform_slug=platform_slug,
            catalog_id=catalog_id,
        )
        if cached is not None:
            report["listingCacheHits"] += 1
            if cached.get("accepted") and cached.get("row"):
                return cached["row"]
            reason = str(cached.get("skipReason") or "cached_skip")
            if reason == "reference":
                report["skippedReference"] += 1
            elif reason == "rules":
                report["skippedRules"] += 1
            elif reason == "auction":
                report["skippedAuctions"] += 1
            else:
                report["skippedTitle"] += 1
            return None

    listing_type = "sold" if item.get("_listingType") == "sold" else "active"
    item_title = str(item.get("title") or "")

    ok_ref, _ = listing_reference_valid_for_catalog(
        item_title,
        catalog_id,
        catalog_region,
        ref_to_ids=ref_to_ids,
    )
    if not ok_ref:
        report["skippedReference"] += 1
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=False,
                skip_reason="reference",
            )
        return None

    row = to_ingest_listing(
        catalog_id=catalog_id,
        source="ebay-es",
        listing_type=listing_type,
        price_eur=float(item["priceEur"]),
        title=item_title,
        catalog_region=catalog_region,
        external_id=item.get("itemId"),
        ref_to_ids=ref_to_ids,
        platform_slug=platform_slug,
        product_url=str(item.get("url") or ""),
        image_url=str(item.get("imageUrl") or "") or None,
        game_title=str(game.get("title") or ""),
        shipping_eur=item.get("shippingEur"),
        total_to_spain_eur=item.get("estimatedTotalToSpainEur"),
        original_price=item.get("originalPrice"),
        original_currency=item.get("originalCurrency"),
        origin_country=item.get("originCountry"),
        origin_label=item.get("originLabel"),
        destination_country=item.get("destinationCountry"),
        destination_postal_code=item.get("destinationPostalCode"),
        marketplace_id=item.get("marketplaceId"),
        import_costs_may_apply=item.get("importCostsMayApply"),
    )
    if not row:
        report["skippedTitle"] += 1
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=False,
                skip_reason="title",
            )
        return None

    if row.get("matchedReference"):
        report["matchedReference"] += 1

    if not passes_rules(platform_slug, catalog_region, row):
        report["skippedRules"] += 1
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=False,
                row=row,
                skip_reason="rules",
            )
        return None

    if use_listing_cache:
        write_listing_cache(
            item,
            platform_slug=platform_slug,
            catalog_id=catalog_id,
            accepted=True,
            row=row,
        )
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description="Collector eBay ES → ingest JSON")
    parser.add_argument("--platform", required=True, help="Slug plataforma (ps2, ps4, dreamcast…)")
    parser.add_argument("--region", help="Filtrar región catálogo (p. ej. PAL España)")
    parser.add_argument("--limit", type=int, default=10, help="Máximo juegos a procesar")
    parser.add_argument("--catalog-ids-file", type=Path, help="JSON o TXT con IDs exactos, en orden")
    parser.add_argument("--per-game", type=int, default=8, help="Anuncios eBay por juego")
    parser.add_argument(
        "--sold",
        action="store_true",
        help="Legacy: intentar vendidos con Finding API solo si EBAY_ALLOW_LEGACY_SOLD=1",
    )
    parser.add_argument("--active", action="store_true", help="Solo activos/precio fijo (Browse API)")
    parser.add_argument("--output", type=Path, help="JSON destino (default: data/price-ingest/{platform}-ebay.json)")
    parser.add_argument("--report-output", type=Path, help="Informe JSON destino")
    parser.add_argument("--destination-postal-code", default="", help="Código postal español para estimar envío")
    parser.add_argument("--merge", action="store_true", help="Fusionar con JSON existente")
    parser.add_argument(
        "--use-cache",
        action="store_true",
        help="Reutilizar respuesta API por juego si la caché no ha caducado (EBAY_GAME_CACHE_MAX_AGE_HOURS)",
    )
    parser.add_argument(
        "--no-listing-cache",
        action="store_true",
        help="No reutilizar filas ingest por itemId (reprocesa reglas/visión)",
    )
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, help="Segundos entre búsquedas")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sold = args.sold
    active = args.active or not args.sold
    if args.sold and args.active:
        sold = active = True

    platforms = load_platforms()
    if args.platform not in platforms:
        raise SystemExit(f"Plataforma desconocida: {args.platform}")

    games = select_games(args.platform, args.region, args.limit, args.catalog_ids_file)
    out = args.output or INGEST_DIR / f"{args.platform}-ebay.json"
    _, ref_to_ids = build_platform_reference_index(args.platform)
    use_listing_cache = not args.no_listing_cache and not args.dry_run

    payload = load_json(out, {"listings": [], "cex": []}) if args.merge else {"listings": [], "cex": []}
    payload["platformSlug"] = args.platform
    payload["collectedAt"] = now_iso()
    payload["notes"] = (
        f"eBay ES collector — sold={sold} active={active}. "
        "Activos: Browse API oficial, solo precio fijo (sin subastas en curso). "
        "Vendidos: Finding API legacy; requiere EBAY_ALLOW_LEGACY_SOLD=1 y puede no estar disponible. "
        "Búsqueda por título del juego; región y consola filtradas post-fetch. "
        "Marketplace EBAY_ES, entrega a España y ubicación del artículo limitada por región. "
        "priceEur es solo artículo; shippingEur y estimatedTotalToSpainEur van separados. "
        "Caché listing por itemId (invalida si cambia título/precio)."
    )

    if not args.merge:
        payload["listings"] = []

    report: dict[str, Any] = {
        "platform": args.platform,
        "gamesRequested": len(games),
        "gamesWithListings": 0,
        "listingsAdded": 0,
        "listingCacheHits": 0,
        "gameCacheHits": 0,
        "skippedRules": 0,
        "skippedTitle": 0,
        "skippedReference": 0,
        "skippedAuctions": 0,
        "matchedReference": 0,
        "errors": [],
        "backend": None,
        "catalogIdsRequested": [str(game["id"]) for game in games],
        "catalogIdsProcessed": [],
        "catalogIdsWithListings": [],
        "catalogIdsNoListings": [],
        "catalogIdsFailed": [],
    }

    print(
        f"Juegos: {len(games)} · sold={sold} active={active} · "
        f"listing-cache={'on' if use_listing_cache else 'off'} · "
        f"game-cache={'on' if args.use_cache else 'off'}"
    )

    for idx, game in enumerate(games, start=1):
        catalog_id = game["id"]
        catalog_region = game.get("region") or ""
        query = build_ebay_search_query(game)
        cache_file = GAME_CACHE_DIR / args.platform / f"{catalog_id}.json"
        game_listings: list[dict] = []
        used_game_cache = False

        try:
            modes: list[tuple[bool, str]] = []
            if sold:
                modes.append((True, "sold"))
            if active:
                modes.append((False, "active"))

            raw_items: list[dict] = []
            if args.use_cache and game_cache_is_fresh(cache_file):
                cached = load_game_cache(cache_file)
                if cached:
                    raw_items = list(cached.get("items") or [])
                    report["backend"] = cached.get("backend")
                    report["gameCacheHits"] += 1
                    used_game_cache = True

            if not raw_items:
                for mode_idx, (is_sold, label) in enumerate(modes):
                    try:
                        items, backend = search_ebay_es(
                            query,
                            catalog_region=catalog_region,
                            destination_postal_code=args.destination_postal_code,
                            sold=is_sold,
                            max_results=args.per_game,
                        )
                    except RuntimeError as exc:
                        report["errors"].append(
                            {
                                "catalogId": catalog_id,
                                "mode": label,
                                "error": str(exc),
                            }
                        )
                        print(f"  [{idx}/{len(games)}] AVISO {catalog_id} ({label}): {exc}")
                        if len(modes) == 1:
                            raise
                        continue
                    report["backend"] = backend
                    for item in items:
                        item["_listingType"] = label
                    raw_items.extend(items)
                    if idx < len(games) or mode_idx < len(modes) - 1:
                        time.sleep(args.delay)
                if not args.dry_run:
                    save_json(
                        cache_file,
                        attach_policy_version({
                            "query": query,
                            "backend": report["backend"],
                            "items": raw_items,
                            "collectedAt": now_iso(),
                        }),
                    )

            added_for_game = 0
            max_items = args.per_game * (1 + int(sold) + int(active))
            for item in raw_items[:max_items]:
                row = process_ebay_item(
                    item,
                    game=game,
                    platform_slug=args.platform,
                    catalog_id=catalog_id,
                    catalog_region=catalog_region,
                    ref_to_ids=ref_to_ids,
                    use_listing_cache=use_listing_cache,
                    report=report,
                )
                if row:
                    game_listings.append(row)
                    added_for_game += 1

            if game_listings:
                report["gamesWithListings"] += 1
                report["listingsAdded"] += added_for_game
                payload["listings"].extend(game_listings)
                report["catalogIdsWithListings"].append(catalog_id)
                print(f"  [{idx}/{len(games)}] {game['title'][:40]} → +{added_for_game} ({query})")
            else:
                report["catalogIdsNoListings"].append(catalog_id)
                print(f"  [{idx}/{len(games)}] {game['title'][:40]} → 0 ({query})")
            report["catalogIdsProcessed"].append(catalog_id)

        except Exception as exc:  # noqa: BLE001
            report["errors"].append({"catalogId": catalog_id, "error": str(exc)})
            report["catalogIdsFailed"].append(catalog_id)
            print(f"  [{idx}/{len(games)}] ERROR {catalog_id}: {exc}")

        if not used_game_cache and idx < len(games):
            time.sleep(args.delay)

    print(
        f"\nTotal anuncios: {len(payload['listings'])} · "
        f"juegos con datos: {report['gamesWithListings']} · "
        f"listing-cache hits: {report['listingCacheHits']} · "
        f"game-cache hits: {report['gameCacheHits']} · "
        f"ref. SKU: {report['matchedReference']} · "
        f"rechazados ref.: {report['skippedReference']} · "
        f"subastas activas descartadas: {report['skippedAuctions']} · "
        f"backend: {report['backend']}"
    )

    if args.dry_run:
        print("Dry-run: no escrito.")
        return

    save_json(out, payload)
    report_path = args.report_output or INGEST_DIR / "reports" / f"ebay-{args.platform}-{now_iso()[:10]}.json"
    save_json(report_path, report)
    print(f"Escrito: {out}")
    print(f"Informe: {report_path}")

    code = validate_ingest(out)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
