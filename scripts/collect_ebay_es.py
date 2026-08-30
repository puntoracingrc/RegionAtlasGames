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
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_ingest_template import validate_ingest  # noqa: E402
from collectors.cache_policy import attach_policy_version  # noqa: E402
from collectors.common import (  # noqa: E402
    INGEST_DIR,
    build_ebay_search_queries,
    es_market_games,
    load_json,
    load_platforms,
    now_iso,
    platform_catalog_games,
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
from collectors.reference_match import build_platform_reference_index  # noqa: E402
from collectors.physical_edition import (  # noqa: E402
    catalog_physical_edition,
    listing_physical_edition,
    physical_edition_label,
    physical_editions_match,
)
from collectors.regional_variant_routing import (  # noqa: E402
    RegionalRouteDecision,
    regional_variants_for,
    resolve_regional_route,
    same_regional_edition_family,
    strict_regions_match,
)
from region_evidence_rules import check_listing_evidence_meets_rules  # noqa: E402

REQUEST_DELAY = 1.0


@dataclass
class ProcessedEbayItem:
    row: dict[str, Any]
    target_matched: bool
    review_only: bool
    rerouted: bool


def _result_from_cached_row(row: dict[str, Any], target_catalog_id: str) -> ProcessedEbayItem:
    status = str(row.get("regionalRoutingStatus") or "target")
    catalog_id = str(row.get("catalogId") or "")
    return ProcessedEbayItem(
        row=row,
        target_matched=status == "target" and catalog_id == target_catalog_id,
        review_only=status == "review",
        rerouted=status == "rerouted",
    )


def _alternative_rows(
    catalog_ids: tuple[str, ...] | list[str],
    catalog_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for catalog_id in dict.fromkeys(catalog_ids):
        game = catalog_by_id.get(str(catalog_id))
        if not game:
            continue
        rows.append({
            "catalogId": str(game.get("id")),
            "title": str(game.get("title") or ""),
            "region": str(game.get("region") or ""),
            "score": 1.0,
        })
    return rows


def _review_row(
    item: dict[str, Any],
    *,
    game: dict[str, Any],
    decision: RegionalRouteDecision,
    catalog_by_id: dict[str, dict[str, Any]],
    base_row: dict[str, Any] | None = None,
    candidate_catalog_id: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    row = dict(base_row or {})
    row.pop("catalogId", None)
    row.update({
        "source": "ebay-es",
        "listingType": "sold" if item.get("_listingType") == "sold" else "active",
        "priceEur": round(float(item.get("priceEur") or 0), 2),
        "title": str(item.get("title") or ""),
        "regionVerified": False,
        "regionReviewNeeded": True,
        "regionReviewReason": reason or decision.reason or "regional_confirmation_missing",
        "regionalRoutingStatus": "review",
        "searchedCatalogId": str(game.get("id") or ""),
        "searchedCatalogRegion": str(game.get("region") or ""),
    })
    detected_region = decision.detected_region or row.get("listingRegion")
    if detected_region:
        row["listingRegion"] = detected_region
    else:
        row.pop("listingRegion", None)
    if candidate_catalog_id:
        row["candidateCatalogId"] = candidate_catalog_id
    alternatives = list(decision.alternatives)
    if candidate_catalog_id and candidate_catalog_id not in alternatives:
        alternatives.insert(0, candidate_catalog_id)
    if alternatives:
        row["matchAlternatives"] = _alternative_rows(alternatives, catalog_by_id)
    if decision.matched_reference:
        row["matchedReference"] = decision.matched_reference
    if decision.origin_region_hint:
        row["originRegionHint"] = decision.origin_region_hint

    evidence = [str(value) for value in row.get("regionEvidence") or []]
    if decision.proof == "reference" and "sku_regional" not in evidence:
        evidence.extend(["sku_regional", "listing_title_region"])
    elif decision.proof == "title" and "listing_title_region" not in evidence:
        evidence.append("listing_title_region")
    row["regionEvidence"] = list(dict.fromkeys(evidence))

    notes = [str(value) for value in row.get("regionReviewNotes") or []]
    notes.append(row["regionReviewReason"])
    if decision.origin_region_hint:
        notes.append(
            f"Vendedor ubicado en {decision.origin_region_hint}: es una pista, no confirma la edición."
        )
    if detected_region:
        notes.append(f"Región detectada: {detected_region}; no se aplica a la ficha buscada.")
    row["regionReviewNotes"] = list(dict.fromkeys(notes))

    optional_fields = {
        "externalId": item.get("itemId"),
        "productUrl": item.get("url"),
        "imageUrl": item.get("imageUrl"),
        "imageUrls": item.get("imageUrls"),
        "searchQuery": item.get("searchQuery"),
        "shippingEur": item.get("shippingEur"),
        "estimatedTotalToSpainEur": item.get("estimatedTotalToSpainEur"),
        "originalPrice": item.get("originalPrice"),
        "originalCurrency": item.get("originalCurrency"),
        "originCountry": item.get("originCountry"),
        "originLabel": item.get("originLabel"),
        "destinationCountry": item.get("destinationCountry"),
        "destinationPostalCode": item.get("destinationPostalCode"),
        "marketplaceId": item.get("marketplaceId"),
        "importCostsMayApply": item.get("importCostsMayApply"),
    }
    for key, value in optional_fields.items():
        if value not in (None, "") and key not in row:
            row[key] = value
    return row


def _evidence_passes_rules(
    platform_slug: str,
    catalog_region: str,
    row: dict[str, Any],
) -> bool:
    evidence = [str(e) for e in row.get("regionEvidence") or []]
    ai = row.get("aiConfidence")
    ai_val = float(ai) if ai is not None else None
    ok, _ = check_listing_evidence_meets_rules(
        platform_slug, catalog_region, evidence, ai_val
    )
    return ok


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
    regional_family_games: list[dict[str, Any]],
    catalog_by_id: dict[str, dict[str, Any]],
    ref_to_ids: dict[str, list[str]],
    use_listing_cache: bool,
    report: dict[str, Any],
) -> ProcessedEbayItem | None:
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
            if cached.get("accepted") and cached.get("row"):
                if cached["row"].get("regionalRoutingStatus") == "review":
                    report["listingCacheReviewRetries"] += 1
                else:
                    report["listingCacheHits"] += 1
                    return _result_from_cached_row(cached["row"], catalog_id)
            else:
                report["listingCacheHits"] += 1
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
    if not physical_editions_match(item, game):
        report["skippedPhysicalEdition"] += 1
        edition_decision = RegionalRouteDecision(
            kind="review",
            reason="physical_edition_mismatch",
        )
        row = _review_row(
            item,
            game=game,
            decision=edition_decision,
            catalog_by_id=catalog_by_id,
            reason="physical_edition_mismatch",
        )
        row["detectedPhysicalEdition"] = physical_edition_label(
            listing_physical_edition(item)
        )
        row["targetPhysicalEdition"] = physical_edition_label(
            catalog_physical_edition(game)
        )
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=True,
                row=row,
            )
        return ProcessedEbayItem(
            row=row,
            target_matched=False,
            review_only=True,
            rerouted=False,
        )

    decision = resolve_regional_route(
        target=game,
        listing_title=item_title,
        origin_country=item.get("originCountry"),
        platform_games=regional_family_games,
        ref_to_ids=ref_to_ids,
    )

    if decision.kind == "reject":
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

    if decision.kind == "review" and decision.reason != "seller_origin_hint_only":
        row = _review_row(
            item,
            game=game,
            decision=decision,
            catalog_by_id=catalog_by_id,
        )
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=True,
                row=row,
            )
        return ProcessedEbayItem(
            row=row,
            target_matched=False,
            review_only=True,
            rerouted=False,
        )

    destination = game
    force_cover_vision = False
    if decision.kind == "route":
        destination = catalog_by_id.get(str(decision.destination_catalog_id)) or game
        force_cover_vision = decision.proof != "reference"
    elif decision.kind == "target" and decision.proof == "title":
        force_cover_vision = True
    elif decision.reason == "seller_origin_hint_only":
        # Se usa la ubicación solo para pedir una comprobación visual. Nunca confirma región.
        force_cover_vision = True

    destination_catalog_id = str(destination.get("id") or catalog_id)
    destination_region = str(destination.get("region") or catalog_region)

    row = to_ingest_listing(
        catalog_id=destination_catalog_id,
        source="ebay-es",
        listing_type=listing_type,
        price_eur=float(item["priceEur"]),
        title=item_title,
        catalog_region=destination_region,
        external_id=item.get("itemId"),
        ref_to_ids=ref_to_ids,
        platform_slug=platform_slug,
        product_url=str(item.get("url") or ""),
        image_url=str(item.get("imageUrl") or "") or None,
        image_urls=[str(url) for url in (item.get("imageUrls") or []) if url],
        game_title=str(destination.get("title") or game.get("title") or ""),
        catalog_game=destination,
        search_query=str(item.get("searchQuery") or "") or None,
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
        force_cover_vision=force_cover_vision,
        keep_unverified=True,
    )
    if not row:
        if decision.kind == "route" or decision.reason == "seller_origin_hint_only":
            review = _review_row(
                item,
                game=game,
                decision=decision,
                catalog_by_id=catalog_by_id,
                candidate_catalog_id=(
                    decision.destination_catalog_id
                    or (decision.alternatives[0] if len(decision.alternatives) == 1 else None)
                ),
                reason="regional_confirmation_missing",
            )
            if use_listing_cache:
                write_listing_cache(
                    item,
                    platform_slug=platform_slug,
                    catalog_id=catalog_id,
                    accepted=True,
                    row=review,
                )
            return ProcessedEbayItem(
                row=review,
                target_matched=False,
                review_only=True,
                rerouted=False,
            )
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

    if decision.kind == "route":
        confirmed = decision.proof == "reference" or "cover_vision" in {
            str(value) for value in row.get("regionEvidence") or []
        }
        if (
            confirmed
            and row.get("regionVerified") is True
            and strict_regions_match(destination_region, str(row.get("listingRegion") or ""))
            and _evidence_passes_rules(platform_slug, destination_region, row)
        ):
            row.update({
                "catalogRegion": destination_region,
                "regionalRoutingStatus": "rerouted",
                "regionalReroutedFromCatalogId": catalog_id,
                "regionalRoutingReason": decision.reason,
            })
            if decision.matched_reference and not row.get("matchedReference"):
                row["matchedReference"] = decision.matched_reference
            if use_listing_cache:
                write_listing_cache(
                    item,
                    platform_slug=platform_slug,
                    catalog_id=catalog_id,
                    accepted=True,
                    row=row,
                )
            return ProcessedEbayItem(
                row=row,
                target_matched=False,
                review_only=False,
                rerouted=True,
            )

        review_decision = RegionalRouteDecision(
            kind="review",
            detected_region=str(row.get("listingRegion") or decision.detected_region or "") or None,
            alternatives=(destination_catalog_id,),
            matched_reference=decision.matched_reference,
            proof=decision.proof,
            reason=(
                "regional_signal_conflict"
                if row.get("listingRegion")
                and not strict_regions_match(destination_region, str(row.get("listingRegion")))
                else "regional_confirmation_missing"
            ),
        )
        review = _review_row(
            item,
            game=game,
            decision=review_decision,
            catalog_by_id=catalog_by_id,
            base_row=row,
            candidate_catalog_id=destination_catalog_id,
        )
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=True,
                row=review,
            )
        return ProcessedEbayItem(
            row=review,
            target_matched=False,
            review_only=True,
            rerouted=False,
        )

    listing_region = str(row.get("listingRegion") or "")
    if (
        listing_region
        and not strict_regions_match(catalog_region, listing_region)
        and "cover_vision" in {str(value) for value in row.get("regionEvidence") or []}
    ):
        variants = regional_variants_for(game, regional_family_games, listing_region)
        if len(variants) == 1:
            routed = variants[0]
            routed_region = str(routed.get("region") or listing_region)
            routed_row = {
                **row,
                "catalogId": str(routed.get("id")),
                "catalogRegion": routed_region,
                "regionVerified": True,
                "regionalRoutingStatus": "rerouted",
                "regionalReroutedFromCatalogId": catalog_id,
                "regionalRoutingReason": "regional_cover_vision",
            }
            if _evidence_passes_rules(platform_slug, routed_region, routed_row):
                if use_listing_cache:
                    write_listing_cache(
                        item,
                        platform_slug=platform_slug,
                        catalog_id=catalog_id,
                        accepted=True,
                        row=routed_row,
                    )
                return ProcessedEbayItem(
                    row=routed_row,
                    target_matched=False,
                    review_only=False,
                    rerouted=True,
                )
        review_decision = RegionalRouteDecision(
            kind="review",
            detected_region=listing_region,
            alternatives=tuple(str(game.get("id")) for game in variants),
            proof="cover",
            reason="regional_variant_missing" if not variants else "regional_variant_ambiguous",
        )
        review = _review_row(
            item,
            game=game,
            decision=review_decision,
            catalog_by_id=catalog_by_id,
            base_row=row,
            candidate_catalog_id=str(variants[0].get("id")) if len(variants) == 1 else None,
        )
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=True,
                row=review,
            )
        return ProcessedEbayItem(
            row=review,
            target_matched=False,
            review_only=True,
            rerouted=False,
        )

    if decision.reason == "seller_origin_hint_only" and not passes_rules(
        platform_slug, catalog_region, row
    ):
        review = _review_row(
            item,
            game=game,
            decision=decision,
            catalog_by_id=catalog_by_id,
            base_row=row,
            candidate_catalog_id=(decision.alternatives[0] if len(decision.alternatives) == 1 else None),
        )
        if use_listing_cache:
            write_listing_cache(
                item,
                platform_slug=platform_slug,
                catalog_id=catalog_id,
                accepted=True,
                row=review,
            )
        return ProcessedEbayItem(
            row=review,
            target_matched=False,
            review_only=True,
            rerouted=False,
        )

    if not passes_rules(platform_slug, catalog_region, row) or not strict_regions_match(
        catalog_region, listing_region
    ):
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

    row["catalogRegion"] = catalog_region
    row["regionalRoutingStatus"] = "target"

    if use_listing_cache:
        write_listing_cache(
            item,
            platform_slug=platform_slug,
            catalog_id=catalog_id,
            accepted=True,
            row=row,
        )
    return ProcessedEbayItem(
        row=row,
        target_matched=True,
        review_only=False,
        rerouted=False,
    )


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
    platform_games = platform_catalog_games(args.platform)
    catalog_by_id = {
        str(catalog_game.get("id")): catalog_game
        for catalog_game in platform_games
        if catalog_game.get("id")
    }
    use_listing_cache = not args.no_listing_cache and not args.dry_run

    payload = (
        load_json(out, {"listings": [], "regionalCandidates": [], "cex": []})
        if args.merge
        else {"listings": [], "regionalCandidates": [], "cex": []}
    )
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
        payload["regionalCandidates"] = []
    else:
        payload.setdefault("regionalCandidates", [])

    report: dict[str, Any] = {
        "platform": args.platform,
        "gamesRequested": len(games),
        "gamesWithListings": 0,
        "listingsAdded": 0,
        "listingCacheHits": 0,
        "listingCacheReviewRetries": 0,
        "gameCacheHits": 0,
        "skippedRules": 0,
        "skippedTitle": 0,
        "skippedReference": 0,
        "skippedPhysicalEdition": 0,
        "skippedAuctions": 0,
        "skippedDuplicates": 0,
        "matchedReference": 0,
        "regionalReroutes": 0,
        "regionalReviewCandidates": 0,
        "sellerOriginHints": 0,
        "errors": [],
        "backend": None,
        "catalogIdsRequested": [str(game["id"]) for game in games],
        "catalogIdsProcessed": [],
        "catalogIdsWithListings": [],
        "catalogIdsNoListings": [],
        "catalogIdsFailed": [],
        "regionalRoutedCatalogIds": [],
        "regionalRerouteDetails": [],
        "catalogSearchAttempts": [],
    }
    seen_listing_ids: set[str] = set()

    print(
        f"Juegos: {len(games)} · sold={sold} active={active} · "
        f"listing-cache={'on' if use_listing_cache else 'off'} · "
        f"game-cache={'on' if args.use_cache else 'off'}"
    )

    for idx, game in enumerate(games, start=1):
        catalog_id = game["id"]
        catalog_region = game.get("region") or ""
        queries = build_ebay_search_queries(game)
        query = queries[0]
        regional_family_games = [
            candidate
            for candidate in platform_games
            if same_regional_edition_family(game, candidate)
        ]
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
                    query = str(cached.get("query") or query)
                    for item in raw_items:
                        item.setdefault("searchQuery", query)
                    report["backend"] = cached.get("backend")
                    report["gameCacheHits"] += 1
                    used_game_cache = True

            if not raw_items:
                for query_idx, candidate_query in enumerate(queries):
                    candidate_items: list[dict[str, Any]] = []
                    for mode_idx, (is_sold, label) in enumerate(modes):
                        try:
                            items, backend = search_ebay_es(
                                candidate_query,
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
                                    "query": candidate_query,
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
                            item["searchQuery"] = candidate_query
                        candidate_items.extend(items)
                        if mode_idx < len(modes) - 1:
                            time.sleep(args.delay)
                    report["catalogSearchAttempts"].append(
                        {
                            "catalogId": catalog_id,
                            "query": candidate_query,
                            "results": len(candidate_items),
                        }
                    )
                    if candidate_items:
                        query = candidate_query
                        raw_items = candidate_items
                        break
                    if query_idx < len(queries) - 1:
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
            target_added_for_game = 0
            reviews_for_game = 0
            max_items = args.per_game * (1 + int(sold) + int(active))
            for item in raw_items[:max_items]:
                listing_identity = str(item.get("itemId") or item.get("url") or "").strip()
                if not listing_identity:
                    listing_identity = "|".join(
                        [str(item.get("title") or ""), str(item.get("priceEur") or "")]
                    )
                if listing_identity in seen_listing_ids:
                    report["skippedDuplicates"] += 1
                    continue

                result = process_ebay_item(
                    item,
                    game=game,
                    platform_slug=args.platform,
                    catalog_id=catalog_id,
                    catalog_region=catalog_region,
                    regional_family_games=regional_family_games,
                    catalog_by_id=catalog_by_id,
                    ref_to_ids=ref_to_ids,
                    use_listing_cache=use_listing_cache,
                    report=report,
                )
                if not result:
                    continue
                seen_listing_ids.add(listing_identity)
                row = result.row
                if result.review_only:
                    payload["regionalCandidates"].append(row)
                    report["regionalReviewCandidates"] += 1
                    reviews_for_game += 1
                    if row.get("originRegionHint"):
                        report["sellerOriginHints"] += 1
                    continue

                game_listings.append(row)
                added_for_game += 1
                if result.target_matched:
                    target_added_for_game += 1
                if result.rerouted:
                    routed_catalog_id = str(row.get("catalogId") or "")
                    report["regionalReroutes"] += 1
                    if routed_catalog_id and routed_catalog_id not in report["regionalRoutedCatalogIds"]:
                        report["regionalRoutedCatalogIds"].append(routed_catalog_id)
                    if len(report["regionalRerouteDetails"]) < 200:
                        report["regionalRerouteDetails"].append({
                            "listingId": row.get("externalId"),
                            "fromCatalogId": catalog_id,
                            "toCatalogId": routed_catalog_id,
                            "detectedRegion": row.get("listingRegion"),
                            "reason": row.get("regionalRoutingReason"),
                        })

            if game_listings:
                report["listingsAdded"] += added_for_game
                payload["listings"].extend(game_listings)
            if target_added_for_game:
                report["gamesWithListings"] += 1
                report["catalogIdsWithListings"].append(catalog_id)
                print(
                    f"  [{idx}/{len(games)}] {game['title'][:40]} → "
                    f"+{target_added_for_game} objetivo, "
                    f"+{added_for_game - target_added_for_game} regional, "
                    f"{reviews_for_game} revisión ({query})"
                )
            else:
                report["catalogIdsNoListings"].append(catalog_id)
                print(
                    f"  [{idx}/{len(games)}] {game['title'][:40]} → 0 objetivo, "
                    f"+{added_for_game} regional, {reviews_for_game} revisión ({query})"
                )
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
        f"revisiones reprocesadas: {report['listingCacheReviewRetries']} · "
        f"game-cache hits: {report['gameCacheHits']} · "
        f"ref. SKU: {report['matchedReference']} · "
        f"rechazados ref.: {report['skippedReference']} · "
        f"edición física a revisión: {report['skippedPhysicalEdition']} · "
        f"subastas activas descartadas: {report['skippedAuctions']} · "
        f"redirigidos: {report['regionalReroutes']} · "
        f"revisión regional: {report['regionalReviewCandidates']} · "
        f"duplicados: {report['skippedDuplicates']} · "
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
