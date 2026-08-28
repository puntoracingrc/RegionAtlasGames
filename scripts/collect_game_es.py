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
from datetime import datetime, timedelta, timezone
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
    "switch2": "nintendo-switch-2-nsw2",
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


def fetch_search_page(
    platform_slug: str,
    offer_type: str,
    page: int,
    *,
    order: int = 7,
) -> dict[str, Any]:
    head = HEADS_BY_PLATFORM.get(platform_slug)
    if not head:
        raise GameEsError(f"Plataforma no soportada por GAME piloto: {platform_slug}")
    offer_cfg = OFFER_TYPES[offer_type]
    payload = {
        "MinPrice": None,
        "MaxPrice": None,
        "Head": head,
        "SKU": None,
        "Order": order,
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


def product_seen_key(product: dict[str, Any]) -> str:
    sku = str(product.get("sourceSku") or "").strip().lower()
    if sku:
        return f"sku:{sku}"
    url = str(product.get("productUrl") or "").strip().lower()
    if url:
        return f"url:{url}"
    return f"title:{str(product.get('title') or '').strip().lower()}|{product.get('priceEur')}"


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_recent_seen_products(
    *,
    recent_dir: Path,
    platform_slug: str,
    source: str,
    skip_recent_days: int,
) -> set[str]:
    if skip_recent_days <= 0 or not recent_dir.exists():
        return set()
    cutoff = datetime.now(timezone.utc) - timedelta(days=skip_recent_days)
    seen: set[str] = set()
    for path in sorted(recent_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(payload.get("platformSlug") or "") != platform_slug:
            continue
        if str(payload.get("source") or "") != source:
            continue
        collected_at = parse_iso(str(payload.get("collectedAt") or ""))
        if collected_at and collected_at < cutoff:
            continue
        for key in ("products", "rawProducts"):
            rows = payload.get(key) or []
            if isinstance(rows, list):
                for product in rows:
                    if isinstance(product, dict):
                        seen.add(product_seen_key(product))
        for row in payload.get("listings") or []:
            if isinstance(row, dict):
                seen.add(product_seen_key(row))
    return seen


def collect_products(
    platform_slug: str,
    offer_type: str,
    *,
    start_page: int,
    max_pages: int,
    limit: int,
    delay: float,
    skip_seen: set[str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    products: list[dict[str, Any]] = []
    seen: set[str] = set()
    skip_seen = skip_seen or set()
    stats: dict[str, Any] = {
        "startPage": start_page,
        "pages": 0,
        "totalResults": None,
        "totalPages": None,
        "rawProducts": 0,
        "products": 0,
        "skippedRecent": 0,
    }
    for page in range(start_page, start_page + max_pages):
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
            key = product_seen_key(product)
            if key in seen:
                continue
            seen.add(key)
            if key in skip_seen:
                stats["skippedRecent"] += 1
                continue
            products.append(product)
            new_count += 1
            if len(products) >= limit:
                stats["products"] = len(products)
                stats["stopReason"] = "max_products"
                return products, stats
        print(
            f"  GAME {offer_type} página {page + 1}: raw {len(raw_products)} · "
            f"nuevos {new_count} · recientes saltados {stats['skippedRecent']} · total {len(products)}"
        )
        if not raw_products:
            stats["stopReason"] = "no_products"
            break
        if new_count == 0 and not skip_seen:
            stats["stopReason"] = "no_new_products"
            break
        # GAME devuelve el índice de la última página (0..TotalPages), no el
        # número de páginas. El comparador anterior omitía siempre la última.
        if stats["totalPages"] is not None and page >= int(stats["totalPages"]):
            stats["stopReason"] = "last_page"
            break
        if page + 1 < start_page + max_pages:
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
    skip_seen = load_recent_seen_products(
        recent_dir=args.recent_dir,
        platform_slug=args.platform,
        source=source,
        skip_recent_days=max(0, args.skip_recent_days),
    )
    if skip_seen:
        print(f"  Productos GAME vistos recientemente que se saltarán: {len(skip_seen)}")
    products, source_stats = collect_products(
        args.platform,
        args.offer_type,
        start_page=max(0, args.start_page),
        max_pages=max(1, args.max_pages),
        limit=max(1, args.limit),
        delay=max(0.0, args.delay),
        skip_seen=skip_seen,
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
        "products": products,
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
    parser.add_argument("--start-page", type=int, default=0)
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--skip-recent-days", type=int, default=0)
    parser.add_argument("--recent-dir", type=Path, default=ROOT / "data" / "price-ingest" / "local-game")
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
