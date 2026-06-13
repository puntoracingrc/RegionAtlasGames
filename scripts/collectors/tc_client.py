"""Cliente HTML — todocoleccion.net (JSON-LD ItemList en categorías; HTML en buscador avanzado)."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from html import unescape
from typing import Any

from collectors.common import build_search_query, normalize_query
from collectors import platform_sources as ps

TC_BASE = "https://www.todocoleccion.net"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"

# Búsqueda avanzada (home → Avanzada): Juguetes y Juegos → Videojuegos y Consolas.
TC_SECTION_JUGUETES = "187"
TC_SUBSECTION_VIDEOJUEGOS = "1826"
DEFAULT_GAME_SEARCH_MAX_PAGES: int | None = None

TC_PLATFORM_CATEGORIES = ps.legacy_tc_categories()
TC_PLATFORM_SEARCH = ps.legacy_tc_search_queries()

from collectors.listing_recency import (  # noqa: E402
    enrich_tc_product,
    is_recent_listing,
    parse_listed_at_from_tc_image,
    tc_early_stop_stale_ratio,
    tc_max_pages,
)

DEFAULT_SEARCH_MAX_PAGES = 40
CARD_LOT_MARKER = 'class="card-lote card-lote-as-gallery"'
PRICE_RE = re.compile(r"class=\"card-price[^\"]*\"[^>]*>\s*([\d.,]+)\s*€")


def build_tc_search_query(game: dict[str, Any]) -> str:
    """Campo «con la frase exacta»: título + plataforma."""
    return build_search_query(game)


def tc_sources_for_platform(platform_slug: str) -> list[str]:
    return ps.tc_sources_for_platform(platform_slug)


def tc_category_slugs_for_platform(platform_slug: str) -> list[str]:
    return ps.tc_category_slugs(platform_slug)


def tc_legacy_search_query(platform_slug: str) -> str | None:
    return ps.tc_legacy_search_query(platform_slug)


def supported_platform_slugs() -> list[str]:
    return sorted(set(TC_PLATFORM_CATEGORIES) | set(TC_PLATFORM_SEARCH))


def _product_image(product: dict[str, Any]) -> str | None:
    image = product.get("image")
    if isinstance(image, list):
        return str(image[0]) if image else None
    if image:
        return str(image)
    return None


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_item_list(html_text: str) -> tuple[list[dict[str, Any]], int | None]:
    products: list[dict[str, Any]] = []
    total: int | None = None

    for match in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html_text, re.S):
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict) or data.get("@type") != "ItemList":
            continue

        total_raw = data.get("numberOfItems")
        if isinstance(total_raw, int):
            total = total_raw
        elif isinstance(total_raw, str) and total_raw.isdigit():
            total = int(total_raw)

        for element in data.get("itemListElement") or []:
            if not isinstance(element, dict):
                continue
            product = element

            title = str(product.get("name") or "").strip()
            url = str(product.get("url") or "").strip()
            sku = product.get("sku")
            offers = product.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            price_raw = offers.get("price")
            if not title or not url or price_raw is None:
                continue
            try:
                price = round(float(price_raw), 2)
            except (TypeError, ValueError):
                continue
            if price <= 0:
                continue

            image_url = _product_image(product)
            listed_at = parse_listed_at_from_tc_image(image_url)
            row: dict[str, Any] = {
                "title": title,
                "productUrl": url,
                "priceEur": price,
                "externalId": str(sku) if sku is not None else "",
                "listingType": "active",
            }
            if image_url:
                row["imageUrl"] = image_url
            if listed_at:
                row["listedAt"] = listed_at
            products.append(row)
        break

    return products, total


def advanced_search_url(query: str, *, page: int = 1) -> str:
    params = {
        "tit_busqueda": "Búsqueda avanzada",
        "Turbo": "s",
        "seccion": TC_SECTION_JUGUETES,
        "hija": TC_SUBSECTION_VIDEOJUEGOS,
        "frase_exacta": query,
        "Donde": "t",
        "Mostrar": "t",
        "Navegacion": "g",
    }
    base = f"{TC_BASE}/buscador?{urllib.parse.urlencode(params)}"
    return base if page <= 1 else f"{base}&P={page}"


def parse_search_total_lots(html_text: str) -> int | None:
    match = re.search(r">\s*(\d+)\s+lotes\s*<", html_text)
    if not match:
        return None
    return int(match.group(1))


def parse_search_results(html_text: str) -> list[dict[str, Any]]:
    """Parsea tarjetas HTML del buscador avanzado (no usa JSON-LD ItemList)."""
    products: list[dict[str, Any]] = []
    for chunk in html_text.split(CARD_LOT_MARKER)[1:]:
        lot_match = re.search(r'data-testid="(\d+)"', chunk)
        if not lot_match:
            continue
        lot_id = lot_match.group(1)
        title_match = re.search(rf'id="lot-title-{lot_id}"[^>]*>([^<]+)', chunk)
        href_match = re.search(rf'href="(/[^"]+~x{lot_id})"', chunk)
        price_match = PRICE_RE.search(chunk)
        if not title_match or not href_match or not price_match:
            continue
        try:
            price = round(float(price_match.group(1).replace(".", "").replace(",", ".")), 2)
        except ValueError:
            continue
        if price <= 0:
            continue

        image_match = re.search(rf'data-id-lote="{lot_id}" data-image-url="([^"]+)"', chunk)
        row: dict[str, Any] = {
            "title": unescape(title_match.group(1).strip()),
            "productUrl": f"{TC_BASE}{href_match.group(1)}",
            "priceEur": price,
            "externalId": lot_id,
            "listingType": "active",
        }
        if image_match:
            row["imageUrl"] = image_match.group(1)
            listed_at = parse_listed_at_from_tc_image(row["imageUrl"])
            if listed_at:
                row["listedAt"] = listed_at
        products.append(row)
    return products


def fetch_advanced_search_products(
    query: str,
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.45,
) -> list[dict[str, Any]]:
    """Buscador avanzado TC. Sin lotes → []."""
    query = normalize_query(query)
    if not query:
        return []

    first_html = fetch_html(advanced_search_url(query, page=1))
    total_lots = parse_search_total_lots(first_html)
    if total_lots == 0:
        return []

    page_size = len(parse_search_results(first_html)) or 30
    expected_pages = 1
    if total_lots and page_size:
        expected_pages = max(1, (total_lots + page_size - 1) // page_size)
    if max_pages is not None:
        expected_pages = min(expected_pages, max_pages)
    else:
        from collectors.listing_recency import search_pages_cap

        expected_pages = min(expected_pages, search_pages_cap())

    seen: set[str] = set()
    products: list[dict[str, Any]] = []

    def ingest_batch(batch: list[dict[str, Any]]) -> None:
        for product in batch:
            key = str(product.get("externalId") or product.get("productUrl"))
            if not key or key in seen:
                continue
            seen.add(key)
            enrich_tc_product(product)
            products.append(product)

    ingest_batch(parse_search_results(first_html))
    for page in range(2, expected_pages + 1):
        time.sleep(delay_s)
        page_html = fetch_html(advanced_search_url(query, page=page))
        batch = parse_search_results(page_html)
        if not batch:
            break
        ingest_batch(batch)

    return products


def fetch_game_products(
    game: dict[str, Any],
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.45,
) -> list[dict[str, Any]]:
    return fetch_advanced_search_products(
        build_tc_search_query(game),
        max_pages=max_pages,
        delay_s=delay_s,
    )


def category_url(category_slug: str, page: int = 1) -> str:
    base = f"{TC_BASE}/s/{category_slug.strip('/')}"
    return base if page <= 1 else f"{base}?P={page}"


def search_url(query: str, page: int = 1) -> str:
    params = urllib.parse.urlencode({"O": "videojuegos", "q": query})
    base = f"{TC_BASE}/buscador?{params}"
    return base if page <= 1 else f"{base}&P={page}"


def _fetch_paginated_products(
    page_url_fn,
    *,
    max_pages: int | None,
    delay_s: float,
    use_total: bool,
) -> list[dict[str, Any]]:
    first_html = fetch_html(page_url_fn(1))
    first_batch, total_items = parse_item_list(first_html)
    page_size = len(first_batch) or 30
    expected_pages = 1
    if use_total and total_items and page_size:
        expected_pages = max(1, (total_items + page_size - 1) // page_size)
    if max_pages is not None:
        expected_pages = min(expected_pages, max_pages)

    seen_ids: set[str] = set()
    products: list[dict[str, Any]] = []
    stale_ratio_limit = tc_early_stop_stale_ratio()

    def ingest_batch(batch: list[dict[str, Any]]) -> tuple[int, int]:
        kept = 0
        stale = 0
        for product in batch:
            key = str(product.get("externalId") or product.get("productUrl"))
            if not key or key in seen_ids:
                continue
            seen_ids.add(key)
            enrich_tc_product(product)
            if not is_recent_listing(product, source="todocoleccion"):
                stale += 1
                continue
            products.append(product)
            kept += 1
        return kept, stale

    ingest_batch(first_batch)

    for page in range(2, expected_pages + 1):
        time.sleep(delay_s)
        page_html = fetch_html(page_url_fn(page))
        batch, _ = parse_item_list(page_html)
        if not batch:
            break
        kept, stale = ingest_batch(batch)
        if len(batch) > 0 and kept == 0 and stale / len(batch) >= stale_ratio_limit:
            break

    return products


def fetch_category_products(
    category_slug: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.45,
) -> list[dict[str, Any]]:
    return _fetch_paginated_products(
        lambda page: category_url(category_slug, page),
        max_pages=max_pages,
        delay_s=delay_s,
        use_total=True,
    )


def fetch_search_products(
    query: str,
    *,
    max_pages: int | None = DEFAULT_SEARCH_MAX_PAGES,
    delay_s: float = 0.45,
) -> list[dict[str, Any]]:
    return _fetch_paginated_products(
        lambda page: search_url(query, page),
        max_pages=max_pages,
        delay_s=delay_s,
        use_total=False,
    )


def fetch_platform_products(
    platform_slug: str,
    *,
    max_pages: int | None = None,
    search_max_pages: int | None = DEFAULT_SEARCH_MAX_PAGES,
    delay_s: float = 0.45,
) -> list[dict[str, Any]]:
    """Deprecated: barrido por categoría. Usar fetch_game_products por título."""
    category_slugs = tc_category_slugs_for_platform(platform_slug)
    legacy_query = tc_legacy_search_query(platform_slug)
    if not category_slugs and not legacy_query:
        return []

    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    page_limit = max_pages if max_pages is not None else tc_max_pages()

    for category_slug in category_slugs:
        for product in fetch_category_products(category_slug, max_pages=page_limit, delay_s=delay_s):
            key = str(product.get("externalId") or product.get("productUrl"))
            if not key or key in seen:
                continue
            seen.add(key)
            products.append(product)

    if legacy_query:
        search_limit = search_max_pages if max_pages is None else min(
            max_pages,
            search_max_pages or max_pages,
        )
        for product in fetch_search_products(legacy_query, max_pages=search_limit, delay_s=delay_s):
            key = str(product.get("externalId") or product.get("productUrl"))
            if not key or key in seen:
                continue
            seen.add(key)
            products.append(product)

    return products
