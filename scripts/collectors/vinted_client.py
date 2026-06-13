"""Cliente Vinted ES — API interna /api/v2/catalog/items (sesión web)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from typing import Any

from collectors.common import build_search_query, load_platforms, normalize_query

VINTED_BASE = "https://www.vinted.es"
VINTED_API = f"{VINTED_BASE}/api/v2/catalog/items"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
DEFAULT_ORDER = "newest_first"
DEFAULT_PER_PAGE = 96
DEFAULT_GAME_SEARCH_MAX_PAGES: int | None = None


def build_vinted_search_query(game: dict[str, Any]) -> str:
    """Query del buscador: título + plataforma."""
    return build_search_query(game)


def vinted_sources_for_platform(platform_slug: str) -> bool:
    return bool(platform_slug)


def supported_platform_slugs() -> list[str]:
    return sorted(load_platforms().keys())


class VintedSession:
    """Sesión anónima (homepage → access_token_web → Bearer)."""

    def __init__(self) -> None:
        self._jar = CookieJar()
        self._opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self._jar))
        self._token: str | None = None

    def warm(self) -> None:
        req = urllib.request.Request(
            VINTED_BASE + "/",
            headers={
                "User-Agent": USER_AGENT,
                "Accept-Language": "es-ES,es;q=0.9",
            },
        )
        with self._opener.open(req, timeout=60):
            pass
        self._token = None
        for cookie in self._jar:
            if cookie.name == "access_token_web" and cookie.value:
                self._token = cookie.value
                break
        if not self._token:
            raise RuntimeError("Vinted: no se obtuvo access_token_web tras cargar la home")

    def get_json(self, url: str, *, referer: str | None = None) -> dict[str, Any]:
        if not self._token:
            self.warm()

        def _request() -> str:
            headers = {
                "User-Agent": USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "es-ES,es;q=0.9",
                "Referer": referer or f"{VINTED_BASE}/catalog",
                "Authorization": f"Bearer {self._token}",
            }
            req = urllib.request.Request(url, headers=headers)
            with self._opener.open(req, timeout=60) as resp:
                return resp.read().decode("utf-8")

        try:
            body = _request()
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                self.warm()
                body = _request()
            else:
                err_body = exc.read().decode("utf-8", errors="ignore")[:400]
                raise RuntimeError(f"Vinted API ({exc.code}): {err_body}") from exc

        data = json.loads(body)
        if not isinstance(data, dict):
            raise RuntimeError("Vinted API: respuesta inesperada")
        return data


def _listed_at_iso(item: dict[str, Any]) -> str | None:
    for key in ("created_at_ts", "updated_at_ts"):
        raw = item.get(key)
        if raw is not None:
            try:
                ts = int(raw)
                dt = datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0)
                return dt.isoformat().replace("+00:00", "Z")
            except (TypeError, ValueError, OSError):
                pass
    photo = item.get("photo") or {}
    hres = photo.get("high_resolution") or {}
    raw_ts = hres.get("timestamp")
    if raw_ts is not None:
        try:
            ts = int(raw_ts)
            dt = datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0)
            return dt.isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError, OSError):
            pass
    return None


def _item_image_url(item: dict[str, Any]) -> str | None:
    photo = item.get("photo") or {}
    for key in ("url", "full_size_url"):
        url = photo.get(key)
        if url:
            return str(url)
    photos = item.get("photos") or []
    if photos and isinstance(photos[0], dict):
        url = photos[0].get("url") or photos[0].get("full_size_url")
        if url:
            return str(url)
    return None


def _product_url(item: dict[str, Any]) -> str:
    url = str(item.get("url") or "").strip()
    if url.startswith("http"):
        return url
    path = str(item.get("path") or "").strip()
    if path:
        return f"{VINTED_BASE}{path if path.startswith('/') else '/' + path}"
    item_id = str(item.get("id") or "").strip()
    return f"{VINTED_BASE}/items/{item_id}" if item_id else VINTED_BASE


def parse_catalog_item(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    if item.get("is_visible") is False:
        return None
    if item.get("is_reserved") is True or item.get("is_closed") is True:
        return None

    title = str(item.get("title") or "").strip()
    price_block = item.get("price") or {}
    try:
        price = round(float(price_block.get("amount")), 2)
    except (TypeError, ValueError):
        return None
    if price <= 0 or not title:
        return None

    item_id = str(item.get("id") or "").strip()
    if not item_id:
        return None

    product: dict[str, Any] = {
        "title": title,
        "productUrl": _product_url(item),
        "priceEur": price,
        "externalId": item_id,
        "listingType": "active",
        "source": "vinted-es",
    }
    listed_at = _listed_at_iso(item)
    if listed_at:
        product["listedAt"] = listed_at
    image_url = _item_image_url(item)
    if image_url:
        product["imageUrl"] = image_url
    status = str(item.get("status") or "").strip()
    if status:
        product["vintedStatus"] = status
    return product


def search_url(
    query: str,
    *,
    page: int = 1,
    per_page: int = DEFAULT_PER_PAGE,
    order: str = DEFAULT_ORDER,
) -> str:
    params = {
        "search_text": query,
        "order": order,
        "page": page,
        "per_page": per_page,
    }
    return f"{VINTED_API}?{urllib.parse.urlencode(params)}"


def fetch_search_products(
    query: str,
    session: VintedSession,
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.35,
    order: str = DEFAULT_ORDER,
    per_page: int = DEFAULT_PER_PAGE,
) -> list[dict[str, Any]]:
    """Buscador Vinted ES, orden «más recientes» y paginación numérica al final."""
    query = normalize_query(query)
    if not query:
        return []

    from collectors.listing_recency import search_pages_cap

    page_cap = max_pages if max_pages is not None else search_pages_cap()
    seen: set[str] = set()
    products: list[dict[str, Any]] = []
    referer = f"{VINTED_BASE}/catalog?search_text={urllib.parse.quote(query)}"

    for page in range(1, page_cap + 1):
        payload = session.get_json(search_url(query, page=page, per_page=per_page, order=order), referer=referer)
        items = payload.get("items") or []
        if not items:
            break

        for raw in items:
            product = parse_catalog_item(raw)
            if not product:
                continue
            key = str(product.get("externalId") or product.get("productUrl"))
            if key in seen:
                continue
            seen.add(key)
            product["searchQuery"] = query
            products.append(product)

        pagination = payload.get("pagination") or {}
        total_pages = pagination.get("total_pages")
        if total_pages is not None and page >= int(total_pages):
            break
        if page >= page_cap:
            break
        if page < page_cap and delay_s:
            time.sleep(delay_s)

    return products


def fetch_game_products(
    game: dict[str, Any],
    session: VintedSession,
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.35,
) -> list[dict[str, Any]]:
    return fetch_search_products(
        build_vinted_search_query(game),
        session,
        max_pages=max_pages,
        delay_s=delay_s,
        order=DEFAULT_ORDER,
    )


__all__ = [
    "DEFAULT_ORDER",
    "DEFAULT_PER_PAGE",
    "VintedSession",
    "build_vinted_search_query",
    "fetch_game_products",
    "fetch_search_products",
    "parse_catalog_item",
    "supported_platform_slugs",
    "vinted_sources_for_platform",
]
