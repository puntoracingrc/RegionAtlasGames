#!/usr/bin/env python3
"""Collector piloto XtraLife.

Retail/importación España. Primera fase segura:
- solo lee listado/parrilla SSR con JSON-LD,
- no entra a fichas de producto,
- acepta únicamente productos con precio y disponibilidad InStock,
- ignora reservas, agotados y productos sin precio.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
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

SOURCE = "xtralife-es-new"
USER_AGENT = "RegionAtlasGames/1.0 (+xtralife-price-source)"
URLS_BY_PLATFORM = {
    "ps4": "https://www.xtralife.com/seleccion/novedades-en-stock-ps4/8159",
    "ps5": "https://www.xtralife.com/seleccion/ps5-todos-los-juegos/1625",
}
PRICE_RE = re.compile(r"\d{1,5}(?:[.,]\d{1,2})?")
SCRIPT_RE = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
REGION_PATTERNS = [
    (re.compile(r"\b(?:imp(?:ort)?\.?\s*)?(?:usa|ee\.?\s*uu\.?|u\.s\.a\.)\b", re.I), "USA", "xtralife_title_import_usa"),
    (re.compile(r"\b(?:imp(?:ort)?\.?\s*)?(?:jap[oó]n|japan|jp)\b", re.I), "Japón", "xtralife_title_import_japan"),
    (re.compile(r"\b(?:imp(?:ort)?\.?\s*)?asia\b", re.I), "Asia", "xtralife_title_import_asia"),
    (re.compile(r"\b(?:imp(?:ort)?\.?\s*)?(?:eur|europa|europe|uk)\b", re.I), "PAL España", "xtralife_title_import_eur"),
]
EDITION_PATTERNS = [
    (re.compile(r"coleccionista|collector", re.I), "collector"),
    (re.compile(r"deluxe", re.I), "deluxe"),
    (re.compile(r"complete|completa|definitive", re.I), "complete"),
    (re.compile(r"gold", re.I), "gold"),
    (re.compile(r"day one", re.I), "day_one"),
    (re.compile(r"limitada|limited", re.I), "limited"),
    (re.compile(r"estándar|standard", re.I), "standard"),
]


class XtraLifeError(RuntimeError):
    pass


def clean_text(value: Any) -> str:
    text = html.unescape(TAG_RE.sub(" ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()


def parse_price(value: Any) -> float | None:
    match = PRICE_RE.search(str(value or ""))
    if not match:
        return None
    raw = match.group(0).replace(",", ".")
    try:
        price = round(float(raw), 2)
    except ValueError:
        return None
    return price if price > 0 else None


def iter_json_ld_nodes(value: Any):
    if isinstance(value, list):
        for item in value:
            yield from iter_json_ld_nodes(item)
        return
    if not isinstance(value, dict):
        return
    yield value
    for item in value.values():
        if isinstance(item, (dict, list)):
            yield from iter_json_ld_nodes(item)


def is_product_node(node: dict[str, Any]) -> bool:
    node_type = node.get("@type")
    if isinstance(node_type, list):
        return any(str(item).lower() == "product" for item in node_type)
    return str(node_type).lower() == "product"


def first_offer(node: dict[str, Any]) -> dict[str, Any]:
    offers = node.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    return offers if isinstance(offers, dict) else {}


def infer_region(title: str) -> tuple[str, list[str], float, bool]:
    for pattern, region, evidence in REGION_PATTERNS:
        if pattern.search(title):
            return region, [evidence], 0.9, region == "PAL España"
    return "PAL España", ["xtralife_no_import_marker"], 0.72, True


def infer_edition(title: str, category: Any) -> str:
    text = f"{title} {' '.join(category) if isinstance(category, list) else category or ''}"
    for pattern, edition in EDITION_PATTERNS:
        if pattern.search(text):
            return edition
    return "standard"


def product_from_json_ld(node: dict[str, Any], *, page_url: str, platform_slug: str) -> dict[str, Any] | None:
    if not is_product_node(node):
        return None
    offer = first_offer(node)
    title = clean_text(node.get("name"))
    price = parse_price(offer.get("price"))
    availability = str(offer.get("availability") or "")
    if not title or price is None:
        return None
    if not availability.lower().endswith("/instock"):
        return None
    image = node.get("image")
    image_url = str(image[0] if isinstance(image, list) and image else image or "").strip() or None
    listing_region, region_evidence, ai_confidence, region_verified = infer_region(title)
    edition = infer_edition(title, node.get("category"))
    product_url = str(node.get("url") or offer.get("url") or page_url).strip() or page_url
    return {
        "title": title,
        "priceEur": price,
        "productUrl": product_url,
        "listingUrl": page_url,
        "imageUrl": image_url,
        "conditionRaw": "new",
        "condition": "sealed",
        "sourceSku": clean_text(node.get("sku") or node.get("gtin13")),
        "platformSlug": platform_slug,
        "listingRegion": listing_region,
        "regionEvidence": region_evidence,
        "aiConfidence": ai_confidence,
        "regionVerified": region_verified,
        "edition": edition,
        "categoryRaw": node.get("category"),
        "availability": availability,
    }


def parse_products(html_text: str, *, page_url: str, platform_slug: str) -> tuple[list[dict[str, Any]], dict[str, int]]:
    products: list[dict[str, Any]] = []
    seen: set[str] = set()
    stats = {"jsonLdScripts": 0, "jsonLdProducts": 0, "usableInStock": 0, "skippedUnavailable": 0}
    for match in SCRIPT_RE.finditer(html_text):
        raw = html.unescape(match.group(1)).strip()
        if not raw:
            continue
        stats["jsonLdScripts"] += 1
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for node in iter_json_ld_nodes(payload):
            if not isinstance(node, dict) or not is_product_node(node):
                continue
            stats["jsonLdProducts"] += 1
            product = product_from_json_ld(node, page_url=page_url, platform_slug=platform_slug)
            if not product:
                stats["skippedUnavailable"] += 1
                continue
            key = str(product.get("sourceSku") or product.get("title")).lower()
            if key in seen:
                continue
            seen.add(key)
            products.append(product)
    stats["usableInStock"] = len(products)
    return products, stats


def fetch_listing(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.6",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = getattr(response, "status", 200)
            if status in {403, 429}:
                raise XtraLifeError(f"XtraLife bloqueó la petición con HTTP {status}")
            return response.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        if exc.code in {403, 429}:
            raise XtraLifeError(f"XtraLife bloqueó la petición con HTTP {exc.code}") from exc
        raise XtraLifeError(f"HTTP {exc.code} al consultar XtraLife") from exc
    except urllib.error.URLError as exc:
        raise XtraLifeError(f"No se pudo consultar XtraLife: {exc.reason}") from exc


def row_from_product(product: dict[str, Any], matched_game: dict[str, Any], result) -> dict[str, Any] | None:
    match_meta = match_row_kwargs(result)
    price = parse_price(product.get("priceEur"))
    if price is None:
        return None
    row = {
        "catalogId": str(matched_game["id"]),
        "source": SOURCE,
        "sourceType": "retail_es_current",
        "offerType": "new",
        "title": product["title"],
        "priceEur": price,
        "retailPriceEur": price,
        "currency": "EUR",
        "productUrl": product["productUrl"],
        "listingUrl": product["listingUrl"],
        "imageUrl": product.get("imageUrl"),
        "condition": "sealed",
        "conditionRaw": product.get("conditionRaw"),
        "inStock": True,
        "collectedAt": now_iso(),
        "matchMethod": match_meta.get("match_method") or "title",
        "sourceSku": product.get("sourceSku"),
        "listingRegion": product.get("listingRegion"),
        "regionEvidence": product.get("regionEvidence") or [],
        "regionVerified": product.get("regionVerified") is True,
        "edition": product.get("edition"),
        "reviewReason": "retail_import_region_or_edition_review",
    }
    if not row["regionVerified"]:
        row["regionReviewNeeded"] = True
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
    url = URLS_BY_PLATFORM.get(args.platform)
    if not url:
        known = ", ".join(sorted(URLS_BY_PLATFORM))
        raise SystemExit(f"Plataforma no soportada por XtraLife piloto: {args.platform}. Opciones: {known}")

    print(f"=== XtraLife · {args.platform} · nuevo retail/importación ===")
    print(f"  URL listado: {url}")
    html_text = fetch_listing(url)
    products, source_stats = parse_products(html_text, page_url=url, platform_slug=args.platform)
    products = products[: max(1, args.limit)]
    print(
        "  JSON-LD: "
        f"{source_stats['jsonLdProducts']} productos · "
        f"{source_stats['usableInStock']} válidos InStock · "
        f"{source_stats['skippedUnavailable']} ignorados sin precio/InStock"
    )

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
            source=SOURCE,
            ref_to_ids=ref_to_ids,
            row_builder=lambda product, matched_game, result: row_from_product(product, matched_game, result),
            infer_listing_region=lambda product: str(product.get("listingRegion") or ""),
            is_valid_product=lambda product: bool(product.get("title") and product.get("priceEur")),
            use_ai=match_opts["use_ai"],
            use_match_cache=match_opts["use_match_cache"],
        )
    finally:
        if previous_region_vision_disabled is None:
            os.environ.pop("REGION_VISION_DISABLED", None)
        else:
            os.environ["REGION_VISION_DISABLED"] = previous_region_vision_disabled
    print_match_stats(stats, label=SOURCE, use_ai=match_opts["use_ai"])

    payload = {
        "platformSlug": args.platform,
        "collectedAt": now_iso(),
        "source": SOURCE,
        "searchMode": "json_ld_listing",
        "sourceType": "retail_es_current",
        "listings": stats.rows,
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
        "stats": {
            **source_stats,
            "products_considered": len(products),
            "products_matched": len(stats.rows),
            "matched_by_ai": stats.matched_by_ai,
            "ambiguous_skipped": stats.ambiguous_skipped,
            "region_rejected": stats.region_rejected,
        },
    }
    for row in stats.rows[:8]:
        print(f"  {row['catalogId']}: {row['priceEur']} € · {row.get('listingRegion')} · {row.get('title', '')[:55]}")
    if len(stats.rows) > 8:
        print(f"  … y {len(stats.rows) - 8} más")
    if not args.dry_run:
        save_json(args.output, payload)
        print(f"  Guardado: {args.output}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect XtraLife retail/import new pilot")
    parser.add_argument("--platform", required=True, choices=sorted(URLS_BY_PLATFORM))
    parser.add_argument("--region", help="Región exacta del catálogo")
    parser.add_argument("--limit", type=int, default=24)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "price-ingest" / "xtralife-es-new.json")
    parser.add_argument("--dry-run", action="store_true")
    add_match_flags(parser)
    args = parser.parse_args()
    try:
        raise SystemExit(run_platform(args))
    except XtraLifeError as exc:
        print(f"  ERROR: {exc}")
        raise SystemExit(0 if args.dry_run else 1) from exc


if __name__ == "__main__":
    main()
