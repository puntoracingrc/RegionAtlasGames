"""Cliente japangameonline.com — búsqueda WP REST + WooCommerce Store API."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from collectors.common import build_search_query, normalize_query

JGO_BASE = "https://japangameonline.com"
JGO_API = f"{JGO_BASE}/wp-json/wc/store/products"
JGO_WP_API = f"{JGO_BASE}/wp-json/wp/v2/product"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"
DEFAULT_SEARCH_PER_PAGE = 100
DEFAULT_GAME_SEARCH_MAX_PAGES: int | None = None


def build_jgo_search_query(game: dict[str, Any]) -> str:
    """Query del buscador: título + plataforma."""
    return build_search_query(game)


def jgo_sources_for_platform(platform_slug: str) -> list[str]:
    from collectors.jgo_match import JGO_PLATFORM_CATEGORIES

    if platform_slug in JGO_PLATFORM_CATEGORIES:
        return [platform_slug]
    return []


def supported_platform_slugs() -> list[str]:
    from collectors.jgo_match import JGO_PLATFORM_CATEGORIES

    return sorted(JGO_PLATFORM_CATEGORIES)


def fetch_products_page(
    *,
    page: int = 1,
    per_page: int = 100,
    category: str | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int | None]:
    params: dict[str, str | int] = {"page": page, "per_page": per_page}
    if category:
        params["category"] = category
    if search:
        params["search"] = search
    url = f"{JGO_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        total_pages = resp.headers.get("X-WP-TotalPages")
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, list):
        return [], None
    pages = int(total_pages) if total_pages and total_pages.isdigit() else None
    return data, pages


def fetch_wp_search_page(
    query: str,
    *,
    page: int = 1,
    per_page: int = DEFAULT_SEARCH_PER_PAGE,
) -> tuple[list[dict[str, Any]], int | None]:
    """Buscador del sitio (WP REST). Soporta frases «título plataforma»."""
    params = {"search": query, "page": page, "per_page": per_page}
    url = f"{JGO_WP_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        total_pages = resp.headers.get("X-WP-TotalPages")
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, list):
        return [], None
    pages = int(total_pages) if total_pages and total_pages.isdigit() else None
    return data, pages


def fetch_store_product_by_slug(slug: str) -> dict[str, Any] | None:
    url = f"{JGO_API}?{urllib.parse.urlencode({'slug': slug})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError:
        return None
    if isinstance(data, list) and data:
        return data[0]
    return None


def fetch_search_products(
    query: str,
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.25,
) -> list[dict[str, Any]]:
    """Busca como el buscador de la home. Sin hits → []."""
    query = normalize_query(query)
    if not query:
        return []

    from collectors.listing_recency import search_pages_cap

    page_cap = max_pages if max_pages is not None else search_pages_cap()
    seen: set[int] = set()
    products: list[dict[str, Any]] = []
    page = 1
    total_pages: int | None = None

    while True:
        hits, total_pages = fetch_wp_search_page(query, page=page)
        if not hits:
            break
        for hit in hits:
            slug = str(hit.get("slug") or "").strip()
            if not slug:
                continue
            store_product = fetch_store_product_by_slug(slug)
            if not store_product:
                continue
            pid = int(store_product.get("id") or 0)
            if pid and pid not in seen:
                seen.add(pid)
                products.append(store_product)
        if total_pages is None or page >= total_pages:
            break
        if page >= page_cap:
            break
        page += 1
        time.sleep(delay_s)

    return products


def fetch_game_products(
    game: dict[str, Any],
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.25,
) -> list[dict[str, Any]]:
    return fetch_search_products(
        build_jgo_search_query(game),
        max_pages=max_pages,
        delay_s=delay_s,
    )


def fetch_products_for_categories(
    categories: list[str],
    *,
    max_pages: int | None = None,
    delay_s: float = 0.25,
) -> list[dict[str, Any]]:
    """Deprecated: barrido por categoría. Usar fetch_game_products por título."""
    seen: set[int] = set()
    products: list[dict[str, Any]] = []

    for category in categories:
        page = 1
        total_pages: int | None = None
        while True:
            batch, total_pages = fetch_products_page(page=page, per_page=100, category=category)
            if not batch:
                break
            for product in batch:
                pid = int(product.get("id") or 0)
                if pid and pid not in seen:
                    seen.add(pid)
                    products.append(product)
            if total_pages is None or page >= total_pages:
                break
            if max_pages is not None and page >= max_pages:
                break
            page += 1
            time.sleep(delay_s)

    return products


def product_price_eur(product: dict[str, Any]) -> float | None:
    prices = product.get("prices") or {}
    raw = prices.get("price") or prices.get("regular_price")
    if raw is None:
        return None
    try:
        cents = int(str(raw))
    except (TypeError, ValueError):
        return None
    if cents <= 0:
        return None
    return round(cents / 100, 2)


def product_in_stock(product: dict[str, Any]) -> bool:
    if product.get("is_in_stock") is True:
        return True
    if product.get("is_purchasable") is True and product.get("is_on_backorder") is not True:
        return product.get("is_in_stock") is not False
    return False
