"""Cliente Wallapop ES — API pública v3/search (anuncios activos)."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from collectors.common import load_platforms, normalize_query
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

DEFAULT_LATITUDE = 40.4168
DEFAULT_LONGITUDE = -3.7038

# Como la web: «Más recientes» + «Últimos 30 días» (API: lastMonth)
DEFAULT_ORDER_BY = "newest"
VALID_ORDER_BY = frozenset({"newest", "closest", "score", "most_relevance"})


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


# Una palabra por plataforma en la query (slug del catálogo).
WALLAPOP_PLATFORM_QUERY: dict[str, str] = {
    "megadrive": "megadrive",
    "mastersystem": "mastersystem",
    "gamegear": "gamegear",
    "megacd": "megacd",
    "sega32x": "32x",
    "saturn": "saturn",
    "dreamcast": "dreamcast",
    "neogeo": "neogeo",
    "neogeocd": "neogeocd",
    "neogeopocket": "ngpc",
    "gameboy": "gameboy",
    "gamecube": "gamecube",
    "nes": "nes",
    "snes": "snes",
    "n64": "n64",
    "wii": "wii",
    "ds": "ds",
    "3ds": "3ds",
    "ps1": "ps1",
    "ps2": "ps2",
    "ps3": "ps3",
    "ps4": "ps4",
}


def _wallapop_platform_query(platform_slug: str) -> str:
    slug = platform_slug.strip().lower()
    return WALLAPOP_PLATFORM_QUERY.get(slug, slug)


def build_wallapop_query(game: dict[str, Any]) -> str:
    """Título + una palabra de plataforma. Ej.: «Sonic the Hedgehog megadrive»."""
    parts = [str(game.get("title") or "").strip()]
    platform_slug = str(game.get("platformSlug") or "").strip()
    platform_kw = _wallapop_platform_query(platform_slug)
    if platform_kw:
        parts.append(platform_kw)
    return normalize_query(" ".join(p for p in parts if p))


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


def _primary_image(item: dict[str, Any]) -> str | None:
    images = item.get("images") or []
    if not images or not isinstance(images[0], dict):
        return None
    urls = images[0].get("urls") or {}
    for key in ("medium", "big", "small"):
        url = urls.get(key)
        if url:
            return str(url)
    return None


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
    image_url = _primary_image(item)
    if image_url:
        product["imageUrl"] = image_url
    return product


def search_page(
    *,
    keywords: str,
    next_page: str | None = None,
    category_id: str = DEFAULT_CATEGORY_ID,
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
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")[:400]
        raise RuntimeError(f"Wallapop API ({exc.code}): {body}") from exc


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
) -> list[dict[str, Any]]:
    query = build_wallapop_query(game)
    return fetch_query_products(query, max_pages=max_pages, delay_s=delay_s)


__all__ = [
    "DEFAULT_CATEGORY_ID",
    "DEFAULT_GAME_LIMIT",
    "DEFAULT_ORDER_BY",
    "build_wallapop_query",
    "fetch_game_products",
    "fetch_query_products",
    "parse_search_item",
    "search_page",
    "supported_platform_slugs",
    "wallapop_game_limit",
    "wallapop_order_by",
    "wallapop_sources_for_platform",
]
