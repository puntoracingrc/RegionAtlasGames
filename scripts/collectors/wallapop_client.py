"""Cliente Wallapop ES — API pública v3/search (anuncios activos)."""

from __future__ import annotations

import json
import html as html_lib
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from collectors.common import (
    build_search_query,
    load_platforms,
    normalize_query,
    platform_search_aliases,
    platform_search_keyword,
)
from collectors.physical_edition import catalog_physical_edition, physical_edition_base_title
from collectors.listing_recency import (
    is_recent_listing,
    wallapop_listing_age_days,
    wallapop_per_game_pages,
    wallapop_time_filter,
)

WALLAPOP_API = "https://api.wallapop.com/api/v3/search"
WALLAPOP_WEB = "https://es.wallapop.com"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Tecnología > Gaming: consolas y videojuegos > Videojuegos y más > Videojuegos
DEFAULT_CATEGORY_ID = "10093"
DEFAULT_GAME_LIMIT = 50
DEFAULT_DETAIL_LIMIT = 12
MAX_DETAIL_IMAGES = 12
DEFAULT_MIN_QUERY_RESULTS = 6

DEFAULT_LATITUDE = 40.4168
DEFAULT_LONGITUDE = -3.7038

# Como la web: «Más recientes» + «Últimos 30 días» (API: lastMonth)
DEFAULT_ORDER_BY = "newest"
VALID_ORDER_BY = frozenset({"newest", "closest", "score", "most_relevance"})
RETRYABLE_URL_ERRORS = (
    TimeoutError,
    ConnectionError,
    urllib.error.URLError,
    ssl.SSLError,
)

NEXT_DATA_RE = re.compile(
    r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(?P<payload>.*?)</script>',
    re.I | re.S,
)
_DETAIL_CACHE: dict[str, dict[str, Any]] = {}


class WallapopBlockedError(RuntimeError):
    """La fuente ha pedido detener la recoleccion, sin reintentos evasivos."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def wallapop_order_by() -> str:
    raw = os.environ.get("WALLAPOP_ORDER_BY", "").strip().lower()
    if raw in VALID_ORDER_BY:
        return raw
    cfg_raw = os.environ.get("INGEST_WALLAPOP_ORDER_BY", "").strip().lower()
    if cfg_raw in VALID_ORDER_BY:
        return cfg_raw
    return DEFAULT_ORDER_BY


def wallapop_game_limit() -> int:
    raw = os.environ.get("WALLAPOP_GAME_LIMIT", "").strip() or os.environ.get(
        "DAILY_WALLAPOP_GAME_LIMIT",
        "",
    ).strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return DEFAULT_GAME_LIMIT


def wallapop_sources_for_platform(platform_slug: str) -> bool:
    """Todas las plataformas del catálogo pueden usar búsqueda por juego."""
    return bool(platform_slug)


def supported_platform_slugs() -> list[str]:
    return sorted(load_platforms().keys())


def _wallapop_base_title(game: dict[str, Any]) -> str:
    title = build_search_query(game)
    if catalog_physical_edition(game):
        raw_title = str(game.get("title") or "")
        for _ in range(5):
            decoded = html_lib.unescape(raw_title)
            if decoded == raw_title:
                break
            raw_title = decoded
        bracketless = re.sub(r"\s*[\[(][^)\]]+[)\]]\s*$", "", raw_title).strip()
        title = (
            normalize_query(bracketless)
            if bracketless and bracketless != raw_title
            else physical_edition_base_title(title)
        )
    return normalize_query(title)


def _wallapop_title_variants(game: dict[str, Any]) -> list[str]:
    """Grafias minimas del titulo; Wallapop trata los terminos con rigidez."""
    title = _wallapop_base_title(game)
    variants = [title]
    spaced = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", title)
    if spaced != title:
        variants.append(normalize_query(spaced))
    return list(dict.fromkeys(value for value in variants if value))


def build_wallapop_query(game: dict[str, Any]) -> str:
    """Query principal: título base + plataforma, sin etiquetas de edición."""
    title = _wallapop_base_title(game)
    platform = platform_search_keyword(str(game.get("platformSlug") or ""))
    return normalize_query(f"{title} {platform}" if platform else title)


def wallapop_primary_search_queries(game: dict[str, Any]) -> list[str]:
    """Consultas que siempre se prueban: titulo base (y grafias) + plataforma."""
    platform = platform_search_keyword(str(game.get("platformSlug") or ""))
    return list(
        dict.fromkeys(
            normalize_query(f"{title} {platform}" if platform else title)
            for title in _wallapop_title_variants(game)
        )
    )


def wallapop_search_queries(game: dict[str, Any]) -> list[str]:
    """Principal, alias de plataforma y título solo para fallback progresivo."""
    titles = _wallapop_title_variants(game)
    platform_slug = str(game.get("platformSlug") or "")
    aliases = platform_search_aliases(platform_slug)
    primary = platform_search_keyword(platform_slug)
    queries = wallapop_primary_search_queries(game)
    queries.extend(
        normalize_query(f"{title} {alias}")
        for alias in aliases
        if alias != primary
        for title in titles
    )
    queries.extend(titles)
    return list(dict.fromkeys(query for query in queries if query))


def wallapop_min_query_results() -> int:
    raw = os.environ.get("WALLAPOP_MIN_QUERY_RESULTS", "").strip()
    try:
        return max(1, int(raw)) if raw else DEFAULT_MIN_QUERY_RESULTS
    except ValueError:
        return DEFAULT_MIN_QUERY_RESULTS


def _headers() -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "es-ES,es;q=0.9",
        "Origin": WALLAPOP_WEB,
        "Referer": f"{WALLAPOP_WEB}/",
        "X-DeviceOS": "0",
    }


def _coords() -> tuple[float, float]:
    try:
        lat = float(os.environ.get("WALLAPOP_LATITUDE", DEFAULT_LATITUDE))
        lon = float(os.environ.get("WALLAPOP_LONGITUDE", DEFAULT_LONGITUDE))
    except ValueError:
        lat, lon = DEFAULT_LATITUDE, DEFAULT_LONGITUDE
    return lat, lon


def _listed_at_iso(created_at_ms: Any) -> str | None:
    try:
        ts = int(created_at_ms) / 1000.0
    except (TypeError, ValueError):
        return None
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0)
    return dt.isoformat().replace("+00:00", "Z")


def _product_url(web_slug: str) -> str:
    slug = str(web_slug or "").strip().lstrip("/")
    return f"{WALLAPOP_WEB}/item/{slug}" if slug else WALLAPOP_WEB


def _image_urls(item: dict[str, Any], *, limit: int = MAX_DETAIL_IMAGES) -> list[str]:
    images = item.get("images") or []
    result: list[str] = []
    for image in images:
        if not isinstance(image, dict):
            continue
        urls = image.get("urls") or {}
        for key in ("medium", "big", "small"):
            url = urls.get(key)
            if url:
                result.append(str(url))
                break
        if len(result) >= limit:
            break
    return list(dict.fromkeys(result))


def _localized_text(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("original") or value.get("translated") or "").strip()
    return str(value or "").strip()


def wallapop_detail_limit() -> int:
    raw = os.environ.get("WALLAPOP_DETAIL_LIMIT_PER_GAME", "").strip()
    if not raw:
        return DEFAULT_DETAIL_LIMIT
    try:
        return max(0, min(30, int(raw)))
    except ValueError:
        return DEFAULT_DETAIL_LIMIT


def parse_item_detail_html(html_text: str, product: dict[str, Any]) -> dict[str, Any]:
    """Completa un resultado de búsqueda con descripción y galería de la ficha pública."""
    match = NEXT_DATA_RE.search(html_text)
    if not match:
        return dict(product)
    raw_payload = match.group("payload")
    try:
        payload = json.loads(raw_payload)
    except (json.JSONDecodeError, TypeError):
        try:
            payload = json.loads(html_lib.unescape(raw_payload))
        except (json.JSONDecodeError, TypeError):
            return dict(product)
    item = (((payload.get("props") or {}).get("pageProps") or {}).get("item") or {})
    if not isinstance(item, dict):
        return dict(product)

    enriched = dict(product)
    title = _localized_text(item.get("title"))
    description = _localized_text(item.get("description"))
    images = _image_urls(item)
    if title:
        enriched["title"] = title
    if description:
        enriched["description"] = description
    if images:
        enriched["imageUrls"] = images
        enriched["imageUrl"] = images[0]
    characteristics = str(item.get("characteristics") or "").strip()
    if characteristics:
        enriched["characteristics"] = characteristics
    enriched["detailFetched"] = True
    return enriched


def fetch_product_detail(product: dict[str, Any], *, retries: int = 2) -> dict[str, Any]:
    page_url = str(product.get("productUrl") or "").strip()
    if not page_url:
        return dict(product)
    cached = _DETAIL_CACHE.get(page_url)
    if cached is not None:
        return dict(cached)

    headers = _headers()
    headers["Accept"] = "text/html,application/xhtml+xml"
    req = urllib.request.Request(page_url, headers=headers)
    last_error: BaseException | None = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                html_text = resp.read().decode("utf-8", errors="ignore")
            enriched = parse_item_detail_html(html_text, product)
            _DETAIL_CACHE[page_url] = dict(enriched)
            return enriched
        except urllib.error.HTTPError as exc:
            if exc.code in {403, 429}:
                raise WallapopBlockedError(
                    f"Wallapop detalle ({exc.code}): parada segura",
                    status_code=exc.code,
                ) from exc
            if exc.code in {500, 502, 503, 504} and attempt < retries:
                last_error = exc
            else:
                raise RuntimeError(f"Wallapop detalle ({exc.code})") from exc
        except RETRYABLE_URL_ERRORS as exc:
            if attempt >= retries:
                raise RuntimeError("Wallapop detalle: error de conexión") from exc
            last_error = exc
        time.sleep(min(1.5 * attempt, 4.0))
    raise RuntimeError(f"Wallapop detalle: error de conexión ({last_error})")


def enrich_product_details(
    products: list[dict[str, Any]],
    *,
    max_items: int | None = None,
    delay_s: float = 0.35,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    limit = wallapop_detail_limit() if max_items is None else max(0, max_items)
    stats = {"details_requested": 0, "details_loaded": 0, "details_failed": 0}
    if limit == 0 or os.environ.get("WALLAPOP_DETAIL_FETCH_DISABLED", "").strip():
        return [dict(product) for product in products], stats

    enriched: list[dict[str, Any]] = []
    for index, product in enumerate(products):
        if index >= limit:
            enriched.append(dict(product))
            continue
        stats["details_requested"] += 1
        try:
            detailed = fetch_product_detail(product)
            enriched.append(detailed)
            if detailed.get("detailFetched"):
                stats["details_loaded"] += 1
            else:
                stats["details_failed"] += 1
        except WallapopBlockedError:
            raise
        except RuntimeError:
            stats["details_failed"] += 1
            enriched.append(dict(product))
        if index + 1 < min(len(products), limit) and delay_s > 0:
            time.sleep(delay_s)
    return enriched, stats


def parse_search_item(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    if item.get("reserved", {}).get("flag"):
        return None

    location = item.get("location") or {}
    country = str(location.get("country_code") or "").upper()
    if country and country != "ES":
        return None

    title = str(item.get("title") or "").strip()
    price_block = item.get("price") or {}
    try:
        price = round(float(price_block.get("amount")), 2)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None

    item_id = str(item.get("id") or "").strip()
    if not item_id or not title:
        return None

    listed_at = _listed_at_iso(item.get("created_at"))
    product: dict[str, Any] = {
        "title": title,
        "description": str(item.get("description") or ""),
        "productUrl": _product_url(str(item.get("web_slug") or "")),
        "priceEur": price,
        "externalId": item_id,
        "listingType": "active",
        "source": "wallapop",
    }
    if listed_at:
        product["listedAt"] = listed_at
    image_urls = _image_urls(item)
    if image_urls:
        product["imageUrls"] = image_urls
        product["imageUrl"] = image_urls[0]
    return product


def search_page(
    *,
    keywords: str,
    next_page: str | None = None,
    category_id: str = DEFAULT_CATEGORY_ID,
    retries: int = 3,
) -> dict[str, Any]:
    lat, lon = _coords()
    params: dict[str, str] = {
        "source": "search_box",
        "filters_source": "search_box",
        "longitude": str(lon),
        "latitude": str(lat),
        "order_by": wallapop_order_by(),
        "category_ids": category_id,
        "time_filter": wallapop_time_filter(),
    }
    if next_page:
        params["next_page"] = next_page
    else:
        params["keywords"] = keywords

    url = f"{WALLAPOP_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=_headers())
    last_error: BaseException | None = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")[:400]
            if exc.code in {403, 429}:
                raise WallapopBlockedError(
                    f"Wallapop API ({exc.code}): parada segura",
                    status_code=exc.code,
                ) from exc
            if exc.code in {500, 502, 503, 504} and attempt < retries:
                last_error = exc
            else:
                raise RuntimeError(f"Wallapop API ({exc.code}): {body}") from exc
        except RETRYABLE_URL_ERRORS as exc:
            if attempt >= retries:
                raise RuntimeError(f"Wallapop API: error de conexión tras {attempt} intentos ({exc})") from exc
            last_error = exc
        time.sleep(min(1.5 * attempt, 5.0))
    raise RuntimeError(f"Wallapop API: error de conexión ({last_error})")


def fetch_query_products(
    keywords: str,
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    """Pagina hasta que la API no devuelve next_page (= sin «Cargar más» en la web)."""
    page_limit = max_pages if max_pages is not None else wallapop_per_game_pages()
    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    next_token: str | None = None
    pages = 0

    while True:
        payload = search_page(keywords=keywords, next_page=next_token)
        section = (payload.get("data") or {}).get("section") or {}
        items = (section.get("payload") or {}).get("items") or []
        pages += 1

        for raw in items:
            product = parse_search_item(raw)
            if not product:
                continue
            if not is_recent_listing(product, source="wallapop"):
                continue
            key = str(product.get("externalId") or product.get("productUrl"))
            if not key or key in seen:
                continue
            seen.add(key)
            product["searchQuery"] = keywords
            products.append(product)

        next_token = (payload.get("meta") or {}).get("next_page")
        if not next_token:
            break
        if page_limit is not None and pages >= page_limit:
            break
        time.sleep(delay_s)

    return products


def fetch_game_products(
    game: dict[str, Any],
    *,
    max_pages: int | None = None,
    delay_s: float = 0.35,
    diagnostics: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    attempts: list[dict[str, Any]] = []
    minimum_results = wallapop_min_query_results()
    primary_queries = wallapop_primary_search_queries(game)
    for index, query in enumerate(wallapop_search_queries(game)):
        fetched = fetch_query_products(query, max_pages=max_pages, delay_s=delay_s)
        added = 0
        for product in fetched:
            key = str(product.get("externalId") or product.get("productUrl") or "")
            if not key or key in seen:
                continue
            seen.add(key)
            product["searchQuery"] = query
            products.append(product)
            added += 1
        attempts.append(
            {
                "query": query,
                "results": len(fetched),
                "newResults": added,
                "cumulativeResults": len(products),
            }
        )
        tried_all_primary_spellings = index + 1 >= len(primary_queries)
        if tried_all_primary_spellings and len(products) >= minimum_results:
            break
    if diagnostics is not None:
        diagnostics.update(
            {
                "attempts": attempts,
                "candidateCount": len(products),
                "minimumResultsBeforeFallback": minimum_results,
            }
        )
    return products


__all__ = [
    "DEFAULT_CATEGORY_ID",
    "DEFAULT_GAME_LIMIT",
    "DEFAULT_ORDER_BY",
    "WallapopBlockedError",
    "build_wallapop_query",
    "enrich_product_details",
    "fetch_product_detail",
    "fetch_game_products",
    "fetch_query_products",
    "parse_search_item",
    "parse_item_detail_html",
    "search_page",
    "supported_platform_slugs",
    "wallapop_game_limit",
    "wallapop_detail_limit",
    "wallapop_min_query_results",
    "wallapop_order_by",
    "wallapop_primary_search_queries",
    "wallapop_search_queries",
    "wallapop_sources_for_platform",
]
