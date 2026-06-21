#!/usr/bin/env python3
"""Collector piloto GAME España por API interna.

Fuente retail España. Separa:
- game-es-new: precio nuevo/current retail.
- game-es-preowned: precio seminuevo/preowned retail.

No se engancha a la rueda por defecto: las fichas quedan apagadas hasta validar.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.collector_args import add_match_flags, match_kwargs  # noqa: E402
from collectors.common import now_iso, platform_catalog_games, save_json  # noqa: E402
from collectors.match_pipeline import print_match_stats, run_match_pipeline  # noqa: E402
from collectors.match_row_kwargs import match_row_kwargs  # noqa: E402
from collectors.reference_match import build_platform_reference_index  # noqa: E402

API_URL = "https://www.game.es/api/search"
USER_AGENT = "RegionAtlasGames/1.0 (+game-es-price-source)"
HEADS_BY_PLATFORM = {
    "ps4": "juegos-ps4",
    "ps5": "software-ps5",
}
OFFER_TYPES = {
    "new": {
        "source": "game-es-new",
        "filter": {"id": "Disponible", "type": "-5", "source": "GIDS"},
        "basket": "NEW",
    },
    "preowned": {
        "source": "game-es-preowned",
        "filter": {"id": "Preowned", "type": "-6", "source": "GIDS"},
        "basket": "PREOWNED",
    },
}


class GameEsError(RuntimeError):
    pass


def fetch_search_page(platform_slug: str, offer_type: str, page: int) -> dict[str, Any]:
    head = HEADS_BY_PLATFORM.get(platform_slug)
    if not head:
        raise GameEsError(f"Plataforma no soportada por GAME piloto: {platform_slug}")
    offer_cfg = OFFER_TYPES[offer_type]
    payload = {
        "MinPrice": None,
        "MaxPrice": None,
        "Head": head,
        "SKU": None,
        "Order": 7,
        "CategoryFilter": [offer_cfg["filter"]],
        "Category": None,
        "TotalPages": None,
        "Page": page,
        "FirstSearch": page == 0,
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json; charset=utf-8",
            "Origin": "https://www.game.es",
            "Referer": f"https://www.game.es/buscar/{head}",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            if getattr(response, "status", 200) in {403, 429}:
                raise GameEsError(f"GAME bloqueó la API con HTTP {response.status}")
            return json.loads(response.read().decode("utf-8", errors="ignore"))
    except urllib.error.HTTPError as exc:
        if exc.code in {403, 429}:
            raise GameEsError(f"GAME bloqueó la API con HTTP {exc.code}") from exc
        raise GameEsError(f"HTTP {exc.code} en GAME API") from exc
    except urllib.error.URLError as exc:
        raise GameEsError(f"No se pudo consultar GAME API: {exc.reason}") from exc


def best_offer(product: dict[str, Any], offer_type: str) -> dict[str, Any] | None:
    expected_basket = OFFER_TYPES[offer_type]["basket"]
    for offer in product.get("Offers") or []:
        if str(offer.get("BasketCode") or "").upper() != expected_basket:
            continue
        if offer_type == "new" and offer.get("IsNew") is not True:
            continue
        if offer_type == "preowned" and offer.get("IsPreowned") is not True:
            continue
        if offer.get("SellPrice") is None:
            continue
        return offer
    return None


def product_to_candidate(product: dict[str, Any], offer_type: str) -> dict[str, Any] | None:
    offer = best_offer(product, offer_type)
    if not offer:
        return None
    title = str(product.get("Name") or "").strip()
    if not title:
        return None
    navigation = str(product.get("Navigation") or "").strip()
    return {
        "title": title,
        "priceEur": round(float(offer["SellPrice"]), 2),
        "productUrl": f"https://www.game.es/{navigation.lstrip('/')}" if navigation else "https://www.game.es/",
        "imageUrl": product.get("ImageUrl"),
        "conditionRaw": "new" if offer_type == "new" else "preowned",
        "sourceSku": str(product.get("SKU") or offer.get("SKU") or "").strip(),
        "familyName": product.get("FamilyName"),
        "offerType": offer_type,
        "olderPrice": offer.get("OlderPrice"),
        "buttonText": offer.get("ButtonText"),
        "paintButton": offer.get("PaintButton"),
    }


def collect_products(platform_slug: str, offer_type: str, *, max_pages: int, limit: int, delay: float) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    products: list[dict[str, Any]] = []
    seen: set[str] = set()
    stats: dict[str, Any] = {"pages": 0, "totalResults": None, "totalPages": None, "rawProducts": 0, "products": 0}
    for page in range(max_pages):
        data = fetch_search_page(platform_slug, offer_type, page)
        stats["pages"] += 1
        stats["totalResults"] = data.get("TotalResults")
        stats["totalPages"] = data.get("TotalPages")
        raw_products = data.get("Products") or []
        stats["rawProducts"] += len(raw_products)
        new_count = 0
        for raw_product in raw_products:
            product = product_to_candidate(raw_product, offer_type)
            if not product:
                continue
            key = product["productUrl"]
            if key in seen:
                continue
            seen.add(key)
            products.append(product)
            new_count += 1
            if len(products) >= limit:
                stats["products"] = len(products)
                stats["stopReason"] = "max_products"
                return products, stats
        print(f"  GAME {offer_type} página {page + 1}: raw {len(raw_products)} · nuevos {new_count} · total {len(products)}")
        if not raw_products or new_count == 0:
            stats["stopReason"] = "no_new_products"
            break
        if stats["totalPages"] is not None and page + 1 >= int(stats["totalPages"]):
            stats["stopReason"] = "last_page"
            break
        if page + 1 < max_pages:
            time.sleep(delay)
    stats["products"] = len(products)
    stats.setdefault("stopReason", "safety_limit_reached")
    return products, stats


def row_from_product(product: dict[str, Any], matched_game: dict[str, Any], result, *, source: str, offer_type: str) -> dict[str, Any] | None:
    match_meta = match_row_kwargs(result)
    price = round(float(product["priceEur"]), 2)
    row = {
        "catalogId": str(matched_game["id"]),
        "source": source,
        "sourceType": "retail_es_current" if offer_type == "new" else "retail_es_preowned",
        "offerType": offer_type,
        "title": product["title"],
        "priceEur": price,
        "retailPriceEur": price,
        "currency": "EUR",
        "productUrl": product["productUrl"],
        "listingUrl": product["productUrl"],
        "imageUrl": product.get("imageUrl"),
        "condition": "sealed" if offer_type == "new" else "complete",
        "conditionRaw": str(product.get("conditionRaw") or ""),
        "inStock": True,
        "collectedAt": now_iso(),
        "matchMethod": match_meta.get("match_method") or "title",
        "sourceSku": product.get("sourceSku"),
        "regionReviewNeeded": True,
        "reviewReason": "retail_source_region_not_proven",
    }
    if match_meta.get("matched_reference"):
        row["matchedReference"] = match_meta["matched_reference"]
    if match_meta.get("match_score") is not None:
        row["matchScore"] = round(float(match_meta["match_score"]), 3)
    if match_meta.get("match_margin") is not None:
        row["matchMargin"] = round(float(match_meta["match_margin"]), 3)
    if match_meta.get("match_alternatives"):
        row["matchAlternatives"] = match_meta["match_alternatives"]
    if match_meta.get("ai_confidence") is not None:
        row["aiConfidence"] = round(float(match_meta["ai_confidence"]), 3)
    return row


def run_platform(args: argparse.Namespace) -> int:
    source = OFFER_TYPES[args.offer_type]["source"]
    print(f"=== GAME España · {args.platform} · {args.offer_type} ===")
    products, source_stats = collect_products(
        args.platform,
        args.offer_type,
        max_pages=max(1, args.max_pages),
        limit=max(1, args.limit),
        delay=max(0.0, args.delay),
    )
    print(f"  Productos detectados: {len(products)} · total API: {source_stats.get('totalResults')} · páginas API: {source_stats.get('totalPages')}")

    games = platform_catalog_games(args.platform, args.region)
    _, ref_to_ids = build_platform_reference_index(args.platform)
    match_opts = match_kwargs(args)
    previous_region_vision_disabled = os.environ.get("REGION_VISION_DISABLED")
    if not match_opts["use_ai"]:
        os.environ["REGION_VISION_DISABLED"] = "1"
    try:
        stats = run_match_pipeline(
            products,
            games,
            args.platform,
            source=source,
            ref_to_ids=ref_to_ids,
            row_builder=lambda product, matched_game, result: row_from_product(product, matched_game, result, source=source, offer_type=args.offer_type),
            infer_listing_region=None,
            is_valid_product=lambda product: bool(product.get("title") and product.get("priceEur")),
            use_ai=match_opts["use_ai"],
            use_match_cache=match_opts["use_match_cache"],
        )
    finally:
        if previous_region_vision_disabled is None:
            os.environ.pop("REGION_VISION_DISABLED", None)
        else:
            os.environ["REGION_VISION_DISABLED"] = previous_region_vision_disabled
    print_match_stats(stats, label=source, use_ai=match_opts["use_ai"])
    print(f"  Filas verificables/revisión: {len(stats.rows)}")
    for row in stats.rows[:8]:
        print(f"  {row['catalogId']}: {row['priceEur']} € · {row.get('conditionRaw')} — {row.get('title', '')[:55]}")

    payload = {
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "source": source,
        "searchMode": "api",
        "offerType": args.offer_type,
        "listings": stats.rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
        "stats": {
            **source_stats,
            "products_matched": len(stats.rows),
            "matched_by_ai": stats.matched_by_ai,
            "ambiguous_skipped": stats.ambiguous_skipped,
            "region_rejected": stats.region_rejected,
        },
    }
    if not args.dry_run:
        save_json(args.output, payload)
        print(f"  Guardado: {args.output}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect GAME España API retail/preowned pilot")
    parser.add_argument("--platform", required=True, choices=sorted(HEADS_BY_PLATFORM))
    parser.add_argument("--offer-type", required=True, choices=sorted(OFFER_TYPES))
    parser.add_argument("--region", help="Región exacta del catálogo")
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "price-ingest" / "game-es.json")
    parser.add_argument("--dry-run", action="store_true")
    add_match_flags(parser)
    args = parser.parse_args()
    try:
        raise SystemExit(run_platform(args))
    except GameEsError as exc:
        print(f"  ERROR: {exc}")
        raise SystemExit(0 if args.dry_run else 1) from exc


if __name__ == "__main__":
    main()
