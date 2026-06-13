"""Cliente HTML PrestaShop — todoconsolas.com."""

from __future__ import annotations

import html
import re
import time
import urllib.parse
import urllib.request
from typing import Any

from collectors.common import build_search_query, normalize_query
from collectors import platform_sources as ps

TCNS_BASE = "https://www.todoconsolas.com"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"

TCNS_PLATFORM_CATEGORIES = ps.legacy_tcns_categories()

ARTICLE_RE = re.compile(
    r'<article[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)</article>',
    re.I | re.S,
)
TITLE_RE = re.compile(
    r'class="h3 product-title"[^>]*>([^<]+)',
    re.I,
)
URL_RE = re.compile(
    r'href="(https://www\.todoconsolas\.com/[^"]+\.html)"',
    re.I,
)
PRICE_RE = re.compile(
    r'itemprop="price"[^>]*content="([\d\.]+,\d{2})',
    re.I,
)
CONDITION_RE = re.compile(
    r'condition-label-primary[^"]*"[^>]*>([^<]+)',
    re.I,
)
IMG_RE = re.compile(
    r'data-full-size-image-url="([^"]+)"|src="([^"]+/(\d+)-[^"]+\.(?:jpg|jpeg|png|webp))"',
    re.I,
)
PAGE_LINK_RE = re.compile(r"[?&]page=(\d+)")


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_price(raw: str) -> float | None:
    try:
        return round(float(raw.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def tcns_sources_for_platform(platform_slug: str) -> list[str]:
    return ps.tcns_sources_for_platform(platform_slug)


def supported_platform_slugs() -> list[str]:
    return sorted(TCNS_PLATFORM_CATEGORIES.keys())


def build_tcns_search_query(game: dict[str, Any]) -> str:
    """Query del buscador: título + plataforma."""
    return build_search_query(game)


def search_url(query: str, page: int = 1) -> str:
    params = urllib.parse.urlencode({"controller": "search", "s": query})
    base = f"{TCNS_BASE}/busqueda?{params}"
    return base if page <= 1 else f"{base}&page={page}"


def fetch_search_products(
    query: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    """Busca en todoconsolas.com/busqueda. Sin resultados → lista vacía."""
    query = normalize_query(query)
    if not query:
        return []

    first_html = fetch_html(search_url(query, 1))
    max_page = max_page_number(first_html)
    if max_pages is not None:
        max_page = min(max_page, max_pages)
    else:
        from collectors.listing_recency import search_pages_cap

        max_page = min(max_page, search_pages_cap())

    seen_urls: set[str] = set()
    products: list[dict[str, Any]] = []

    for page in range(1, max_page + 1):
        page_html = first_html if page == 1 else fetch_html(search_url(query, page))
        for product in parse_category_page(page_html):
            url = str(product["productUrl"])
            if url in seen_urls:
                continue
            seen_urls.add(url)
            products.append(product)
        if page < max_page:
            time.sleep(delay_s)

    return products


def fetch_game_products(
    game: dict[str, Any],
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    return fetch_search_products(
        build_tcns_search_query(game),
        max_pages=max_pages,
        delay_s=delay_s,
    )


def tcns_sources_for_platform_legacy_categories(platform_slug: str) -> list[str]:
    raw = TCNS_PLATFORM_CATEGORIES.get(platform_slug)
    if not raw:
        return []
    return raw if isinstance(raw, list) else [raw]


def parse_category_page(html_text: str) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for block in ARTICLE_RE.findall(html_text):
        title_m = TITLE_RE.search(block)
        url_m = URL_RE.search(block)
        price_m = PRICE_RE.search(block)
        if not title_m or not url_m or not price_m:
            continue
        price = parse_price(price_m.group(1))
        if price is None or price <= 0:
            continue
        title = html.unescape(title_m.group(1)).strip()
        product_url = html.unescape(url_m.group(1)).strip()
        cond_raw = CONDITION_RE.search(block)
        condition = html.unescape(cond_raw.group(1)).strip() if cond_raw else ""
        img_match = IMG_RE.search(block)
        image_url = ""
        if img_match:
            image_url = html.unescape(img_match.group(1) or img_match.group(2) or "").strip()
        external_id = ""
        id_match = re.search(r"/(\d+)-[^/]+\.html", product_url)
        if id_match:
            external_id = id_match.group(1)
        products.append(
            {
                "title": title,
                "productUrl": product_url,
                "priceEur": price,
                "conditionRaw": condition,
                "externalId": external_id,
                "imageUrl": image_url or None,
            }
        )
    return products


def max_page_number(html_text: str) -> int:
    pages = [int(p) for p in PAGE_LINK_RE.findall(html_text)]
    return max(pages) if pages else 1


def fetch_category_products(
    category_path: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    base_url = f"{TCNS_BASE}/{category_path.strip('/')}"
    first_html = fetch_html(base_url)
    max_page = max_page_number(first_html)
    if max_pages is not None:
        max_page = min(max_page, max_pages)

    seen_urls: set[str] = set()
    products: list[dict[str, Any]] = []

    for page in range(1, max_page + 1):
        page_html = first_html if page == 1 else fetch_html(f"{base_url}?page={page}")
        for product in parse_category_page(page_html):
            url = str(product["productUrl"])
            if url in seen_urls:
                continue
            seen_urls.add(url)
            products.append(product)
        if page < max_page:
            time.sleep(delay_s)

    return products


def fetch_platform_products(
    platform_slug: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    """Deprecated: usar fetch_game_products por título. Mantener solo para cachés antiguas."""
    paths = tcns_sources_for_platform_legacy_categories(platform_slug)
    if not paths:
        return []

    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    for path in paths:
        for product in fetch_category_products(path, max_pages=max_pages, delay_s=delay_s):
            url = str(product["productUrl"])
            if url in seen:
                continue
            seen.add(url)
            products.append(product)
    return products
