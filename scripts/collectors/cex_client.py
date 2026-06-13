"""Cliente CeX ES — appsettings + Algolia (search.webuy.io) + detalle WSS."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Any

from collectors.common import build_search_query, normalize_query

CEX_BASE = "https://es.webuy.com"
WSS_BASE = "https://wss2.cex.es.webuy.io"
ALGOLIA_PROXY = "https://search.webuy.io"
PLATFORM_ID = 18
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
ALGOLIA_AGENT = "Algolia for JavaScript (4.24.1); Browser; RegionAtlasGames/1.0"

# Plataformas soportadas (búsqueda global por título, como el buscador de la home).
CEX_PLATFORM_CATEGORIES: dict[str, str | list[str]] = {
    "nes": "1155",
    "snes": "1027",
    "n64": "1019",
    "gameboy": ["1141", "1139", "1093"],
    "gamecube": "837",
    "wii": "831",
    "ds": "834",
    "3ds": "977",
    "megadrive": "1151",
    "sega32x": "1148",
    "megacd": "1152",
    "mastersystem": "1147",
    "saturn": "1158",
    "dreamcast": "1136",
    "gamegear": "1144",
    "neogeo": "212",
    "neogeocd": "212",
    "neogeopocket": "212",
    "ps1": "1088",
    "ps2": "824",
    "ps3": "821",
    "ps4": "1001",
}

DEFAULT_HITS_PER_PAGE = 24


def cex_sources_for_platform(platform_slug: str) -> list[str]:
    """Plataforma admitida si está en el mapa (la búsqueda es global por título)."""
    if platform_slug in CEX_PLATFORM_CATEGORIES:
        return [platform_slug]
    return []


def cex_category_ids_for_platform(platform_slug: str) -> list[str]:
    raw = CEX_PLATFORM_CATEGORIES.get(platform_slug)
    if not raw:
        return []
    return raw if isinstance(raw, list) else [raw]


def supported_platform_slugs() -> list[str]:
    return sorted(CEX_PLATFORM_CATEGORIES.keys())


def build_cex_search_query(game: dict[str, Any]) -> str:
    """Query del buscador: título + plataforma."""
    return build_search_query(game)


def _browser_headers(*, accept: str = "application/json") -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Origin": CEX_BASE,
        "Referer": f"{CEX_BASE}/",
    }


def fetch_prelogin_settings() -> dict[str, Any]:
    url = f"{WSS_BASE}/v3/appsettings/prelogin?platformId={PLATFORM_ID}"
    req = urllib.request.Request(url, headers=_browser_headers())
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    settings = payload.get("response", {}).get("data", {}).get("preLoginSettings") or {}
    if not settings.get("algoliaAppId") or not settings.get("algoliaSearchAppKey"):
        raise RuntimeError("CeX appsettings sin credenciales Algolia")
    return settings


def _algolia_headers(settings: dict[str, Any]) -> dict[str, str]:
    return {
        **_browser_headers(),
        "X-Algolia-Application-Id": str(settings["algoliaAppId"]),
        "X-Algolia-API-Key": str(settings["algoliaSearchAppKey"]),
        "X-Algolia-Agent": ALGOLIA_AGENT,
    }


def search_query_page(
    settings: dict[str, Any],
    query: str,
    *,
    page: int,
    hits_per_page: int = DEFAULT_HITS_PER_PAGE,
) -> dict[str, Any]:
    index = str(settings["algoliaIndexName"])
    params = urllib.parse.urlencode(
        {
            "query": query,
            "hitsPerPage": hits_per_page,
            "page": page,
        }
    )
    url = f"{ALGOLIA_PROXY}/1/indexes/{index}?{params}"
    req = urllib.request.Request(url, headers=_algolia_headers(settings))
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _consume_algolia_hits(page_payload: dict[str, Any], seen: set[str]) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for hit in page_payload.get("hits") or []:
        if hit.get("inStockOnline") is False:
            continue
        if hit.get("showOnWeb") == 0:
            continue
        product = algolia_hit_to_product(hit)
        box_id = product["boxId"]
        if not box_id or box_id in seen:
            continue
        if product["sellPriceEur"] is None and product["cashPriceEur"] is None:
            continue
        seen.add(box_id)
        products.append(product)
    return products


def fetch_search_products(
    query: str,
    *,
    settings: dict[str, Any] | None = None,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    """Busca en Algolia (mismo motor que el buscador de es.webuy.com). Sin hits → []."""
    query = normalize_query(query)
    if not query:
        return []

    cfg = settings or fetch_prelogin_settings()
    first = search_query_page(cfg, query, page=0)
    nb_pages = int(first.get("nbPages") or 1)
    if max_pages is not None:
        nb_pages = min(nb_pages, max_pages)
    else:
        from collectors.listing_recency import search_pages_cap

        nb_pages = min(nb_pages, search_pages_cap())

    seen: set[str] = set()
    products = _consume_algolia_hits(first, seen)
    for page in range(1, nb_pages):
        time.sleep(delay_s)
        payload = search_query_page(cfg, query, page=page)
        products.extend(_consume_algolia_hits(payload, seen))
    return products


def fetch_game_products(
    game: dict[str, Any],
    *,
    settings: dict[str, Any] | None = None,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    return fetch_search_products(
        build_cex_search_query(game),
        settings=settings,
        max_pages=max_pages,
        delay_s=delay_s,
    )


def search_category_page(
    settings: dict[str, Any],
    category_id: str,
    *,
    page: int,
    hits_per_page: int = DEFAULT_HITS_PER_PAGE,
) -> dict[str, Any]:
    index = str(settings["algoliaIndexName"])
    params = urllib.parse.urlencode(
        {
            "query": "",
            "hitsPerPage": hits_per_page,
            "page": page,
            "facetFilters": json.dumps([f"categoryId:{category_id}"]),
        }
    )
    url = f"{ALGOLIA_PROXY}/1/indexes/{index}?{params}"
    req = urllib.request.Request(url, headers=_algolia_headers(settings))
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def algolia_hit_to_product(hit: dict[str, Any]) -> dict[str, Any]:
    box_id = str(hit.get("boxId") or "").strip()
    sell = hit.get("sellPrice")
    cash = hit.get("cashPriceCalculated")
    if cash is None:
        cash = hit.get("cashBuyPrice")
    return {
        "title": str(hit.get("boxName") or ""),
        "boxId": box_id,
        "productUrl": f"{CEX_BASE}/product-detail/?id={urllib.parse.quote(box_id)}",
        "sellPriceEur": float(sell) if sell is not None else None,
        "cashPriceEur": float(cash) if cash is not None else None,
        "origin": str(hit.get("origin") or ""),
        "categoryId": str(hit.get("categoryId") or ""),
        "inStockOnline": hit.get("inStockOnline"),
        "gradeId": hit.get("gradeId"),
        "conditionRaw": str(hit.get("gradeText") or hit.get("gradeId") or ""),
        "imageUrls": hit.get("imageUrls") if isinstance(hit.get("imageUrls"), dict) else {},
    }


def fetch_category_products(
    category_id: str,
    *,
    settings: dict[str, Any] | None = None,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    cfg = settings or fetch_prelogin_settings()
    first = search_category_page(cfg, category_id, page=0)
    nb_pages = int(first.get("nbPages") or 1)
    if max_pages is not None:
        nb_pages = min(nb_pages, max_pages)

    seen: set[str] = set()
    products: list[dict[str, Any]] = []

    products.extend(_consume_algolia_hits(first, seen))
    for page in range(1, nb_pages):
        time.sleep(delay_s)
        payload = search_category_page(cfg, category_id, page=page)
        products.extend(_consume_algolia_hits(payload, seen))

    return products


def fetch_platform_products(
    platform_slug: str,
    *,
    settings: dict[str, Any] | None = None,
    max_pages: int | None = None,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    """Deprecated: barrido por categoría. Usar fetch_game_products por título."""
    category_ids = cex_category_ids_for_platform(platform_slug)
    if not category_ids:
        return []

    cfg = settings or fetch_prelogin_settings()
    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    for category_id in category_ids:
        for product in fetch_category_products(
            category_id,
            settings=cfg,
            max_pages=max_pages,
            delay_s=delay_s,
        ):
            box_id = str(product["boxId"])
            if box_id in seen:
                continue
            seen.add(box_id)
            product["platformSlug"] = platform_slug
            product["categoryId"] = category_id
            products.append(product)
    return products
