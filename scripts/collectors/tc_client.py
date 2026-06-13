"""Cliente HTML — todocoleccion.net (JSON-LD ItemList en categorías y buscador)."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from typing import Any

TC_BASE = "https://www.todocoleccion.net"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"

# Slugs verificados en /s/{slug} (jun 2026).
TC_PLATFORM_CATEGORIES: dict[str, str | list[str]] = {
    "nes": "nintendo-nes",
    "snes": "super-nintendo",
    "n64": "nintendo-64",
    "gameboy": "game-boy",
    "gamecube": "nintendo-gamecube",
    "wii": "nintendo-wii",
    "ds": "nintendo-ds",
    "3ds": "nintendo-3ds",
    "mastersystem": "sega-master-system",
    "megadrive": "sega-megadrive",
    "megacd": "sega-mega-cd",
    "saturn": "sega-saturn",
    "dreamcast": "sega-dreamcast",
    "gamegear": "sega-game-gear",
    "ps1": "ps1",
    "ps2": "ps2",
    "ps3": "ps3",
    "ps4": "playstation-ps4",
}

# Sin categoría propia en TodoColeccion → buscador acotado por palabras clave.
TC_PLATFORM_SEARCH: dict[str, str] = {
    "sega32x": "sega 32x juego",
    "neogeo": "neo geo aes juego",
    "neogeocd": "neo geo cd juego",
    "neogeopocket": "neo geo pocket juego",
}

from collectors.listing_recency import (  # noqa: E402
    enrich_tc_product,
    is_recent_listing,
    parse_listed_at_from_tc_image,
    tc_early_stop_stale_ratio,
    tc_max_pages,
)

DEFAULT_SEARCH_MAX_PAGES = 40


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


def tc_sources_for_platform(platform_slug: str) -> list[tuple[str, str]]:
    """Devuelve [(modo, slug|query), …] con modo category|search."""
    raw = TC_PLATFORM_CATEGORIES.get(platform_slug)
    if raw:
        slugs = raw if isinstance(raw, list) else [raw]
        return [("category", slug) for slug in slugs]
    query = TC_PLATFORM_SEARCH.get(platform_slug)
    if query:
        return [("search", query)]
    return []


def supported_platform_slugs() -> list[str]:
    slugs = set(TC_PLATFORM_CATEGORIES) | set(TC_PLATFORM_SEARCH)
    return sorted(slugs)


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

    kept, stale = ingest_batch(first_batch)

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
    sources = tc_sources_for_platform(platform_slug)
    if not sources:
        return []

    seen: set[str] = set()
    products: list[dict[str, Any]] = []

    for mode, value in sources:
        page_limit = max_pages if max_pages is not None else tc_max_pages()
        if mode == "category":
            batch = fetch_category_products(value, max_pages=page_limit, delay_s=delay_s)
        else:
            search_limit = search_max_pages if max_pages is None else min(
                max_pages,
                search_max_pages or max_pages,
            )
            batch = fetch_search_products(
                value,
                max_pages=search_limit,
                delay_s=delay_s,
            )
        for product in batch:
            key = str(product.get("externalId") or product.get("productUrl"))
            if not key or key in seen:
                continue
            seen.add(key)
            products.append(product)

    return products
