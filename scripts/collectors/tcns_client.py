"""Cliente HTML PrestaShop — todoconsolas.com."""

from __future__ import annotations

import html
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from collectors.common import build_search_queries, build_search_query
from collectors import platform_sources as ps

TCNS_BASE = "https://www.todoconsolas.com"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"
CATEGORY_PATH_RE = re.compile(r"\d+-[a-z0-9-]+")

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
IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.I | re.S)
IMG_ATTR_RE = re.compile(
    r"\b(src|data-src|data-lazy-src|data-full-size-image-url|srcset)\s*=\s*[\"']([^\"']+)[\"']",
    re.I,
)
PAGE_LINK_RE = re.compile(r"[?&]page=(\d+)")
EAN_URL_RE = re.compile(r"-(\d{8,14})\.html(?:$|[?#])")


class TodoConsolasRequestError(RuntimeError):
    """Error de acceso que el recolector debe tratar sin insistir."""

    def __init__(self, message: str, *, status_code: int | None = None, retry_after: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        retry_after = exc.headers.get("Retry-After") if exc.headers else None
        if exc.code in {403, 429}:
            detail = f"; Retry-After={retry_after}" if retry_after else ""
            raise TodoConsolasRequestError(
                f"TodoConsolas bloqueó la petición con HTTP {exc.code}{detail}",
                status_code=exc.code,
                retry_after=retry_after,
            ) from exc
        raise TodoConsolasRequestError(
            f"HTTP {exc.code} al consultar TodoConsolas",
            status_code=exc.code,
            retry_after=retry_after,
        ) from exc
    except urllib.error.URLError as exc:
        raise TodoConsolasRequestError(f"No se pudo consultar TodoConsolas: {exc.reason}") from exc


def parse_price(raw: str) -> float | None:
    try:
        return round(float(raw.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def _category_image_url(block: str) -> str | None:
    """Extrae la miniatura del producto tolerando el HTML espaciado de PrestaShop."""
    for tag in IMG_TAG_RE.findall(block):
        attrs = {name.lower(): value for name, value in IMG_ATTR_RE.findall(tag)}
        for name in ("data-full-size-image-url", "data-src", "data-lazy-src", "src", "srcset"):
            raw = html.unescape(attrs.get(name, "")).strip()
            if not raw or raw.startswith("data:"):
                continue
            first = raw.split(",")[0].strip().split()[0]
            if first:
                return urllib.parse.urljoin(TCNS_BASE, first)
    return None


def tcns_sources_for_platform(platform_slug: str) -> list[str]:
    return ps.tcns_sources_for_platform(platform_slug)


def tcns_category_paths_for_platform(platform_slug: str) -> list[str]:
    return ps.tcns_category_slugs(platform_slug)


def supported_platform_slugs() -> list[str]:
    return sorted(TCNS_PLATFORM_CATEGORIES.keys())


def build_tcns_search_query(game: dict[str, Any]) -> str:
    """Query del buscador: solo título."""
    return build_search_query(game)


def fetch_search_products(
    query: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    """El buscador interno queda desactivado; robots.txt excluye esa ruta."""
    del query, max_pages, delay_s
    raise TodoConsolasRequestError(
        "El buscador interno de TodoConsolas está desactivado. "
        "Usa collect_todoconsolas_category_pilot.py sobre categorías públicas."
    )


def fetch_game_products(
    game: dict[str, Any],
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    for query in build_search_queries(game):
        for product in fetch_search_products(query, max_pages=max_pages, delay_s=delay_s):
            key = str(product.get("externalId") or product.get("productUrl") or product.get("title") or "")
            if not key or key in seen:
                continue
            seen.add(key)
            product["searchQuery"] = query
            products.append(product)
        if products:
            break
    return products


def tcns_sources_for_platform_legacy_categories(platform_slug: str) -> list[str]:
    return tcns_category_paths_for_platform(platform_slug)


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
        image_url = _category_image_url(block)
        external_id = ""
        id_match = re.search(r"/(\d+)-[^/]+\.html", product_url)
        if id_match:
            external_id = id_match.group(1)
        ean_match = EAN_URL_RE.search(product_url)
        source_reference = ean_match.group(1) if ean_match else ""
        products.append(
            {
                "title": title,
                "productUrl": product_url,
                "priceEur": price,
                "conditionRaw": condition,
                "externalId": external_id,
                "sourceReference": source_reference or None,
                "_referenceText": source_reference,
                "imageUrl": image_url,
            }
        )
    return products


def max_page_number(html_text: str) -> int:
    pages = [int(p) for p in PAGE_LINK_RE.findall(html_text)]
    return max(pages) if pages else 1


def category_page_url(category_path: str, page: int = 1) -> str:
    """Construye solo URLs de categorías públicas, nunca el buscador interno."""
    path = category_path.strip("/").lower()
    if not CATEGORY_PATH_RE.fullmatch(path):
        raise ValueError(f"Ruta de categoría TodoConsolas no válida: {category_path}")
    if page < 1:
        raise ValueError("La página debe ser mayor o igual que 1")
    base_url = f"{TCNS_BASE}/{path}"
    return base_url if page == 1 else f"{base_url}?page={page}"


def fetch_category_page(category_path: str, page: int = 1) -> tuple[list[dict[str, Any]], int]:
    page_html = fetch_html(category_page_url(category_path, page))
    return parse_category_page(page_html), max_page_number(page_html)


def fetch_category_products(
    category_path: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    first_products, max_page = fetch_category_page(category_path, 1)
    if max_pages is not None:
        max_page = min(max_page, max_pages)

    seen_urls: set[str] = set()
    products: list[dict[str, Any]] = []

    for page in range(1, max_page + 1):
        page_products = first_products if page == 1 else fetch_category_page(category_path, page)[0]
        for product in page_products:
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
