"""Cliente Shopify Storefront JSON — kaotostore.myshopify.com."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from html import unescape
from typing import Any

from collectors.common import build_search_query, normalize_query
from collectors import platform_sources as ps
from collectors.kaoto_match import KAOTO_PLATFORM_COLLECTIONS

KAOTO_BASE = "https://kaotostore.myshopify.com"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"
PRODUCT_HANDLE_RE = re.compile(r"/products/([a-z0-9-]+)")
DEFAULT_GAME_SEARCH_MAX_PAGES: int | None = None

CONDITION_RANK = {"used": 1, "no_manual": 2, "cib": 3, "sealed": 4, "unknown": 5}


def build_kaoto_search_query(game: dict[str, Any]) -> str:
    """Query del buscador: título + plataforma."""
    return build_search_query(game)


def kaoto_sources_for_platform(platform_slug: str) -> list[str]:
    return ps.kaoto_sources_for_platform(platform_slug)


def supported_platform_slugs() -> list[str]:
    return sorted(KAOTO_PLATFORM_COLLECTIONS)


def collection_handle_for_platform(platform_slug: str) -> str | None:
    return ps.kaoto_collection(platform_slug)


def fetch_json(url: str, *, retries: int = 3) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return {}
            if exc.code == 429 and attempt + 1 < retries:
                time.sleep(3.0 * (attempt + 1))
                last_exc = exc
                continue
            raise
        except urllib.error.URLError as exc:
            if attempt + 1 < retries:
                time.sleep(1.0 * (attempt + 1))
                last_exc = exc
                continue
            raise
    if last_exc:
        raise last_exc
    return {}


def fetch_html(url: str, *, retries: int = 3) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt + 1 < retries:
                time.sleep(3.0 * (attempt + 1))
                last_exc = exc
                continue
            raise
        except urllib.error.URLError as exc:
            if attempt + 1 < retries:
                time.sleep(1.0 * (attempt + 1))
                last_exc = exc
                continue
            raise
    if last_exc:
        raise last_exc
    return ""


def infer_kaoto_region(title: str, body_html: str = "") -> str:
    text = unescape(f"{title} {body_html}").lower()
    if any(k in text for k in ("importación japonesa", "importacion japonesa", "japonés", "japones", "japonesa", "ntsc j")):
        return "Japón"
    if any(k in text for k in ("ntsc u", "americano", "usa", "u.s.")):
        return "USA"
    if any(k in text for k in ("pal", "europa", "europeo", "españa", "spanish")):
        return "PAL Europa"
    return "Japón"


def infer_variant_condition(variant_title: str) -> str:
    t = unescape(variant_title).upper()
    if "NUEVO" in t or "PRECINT" in t:
        return "sealed"
    if "SIN MANUAL" in t and "SIN CAJA" not in t:
        return "no_manual"
    if "COMPLETO" in t or "CIB" in t:
        return "cib"
    if "2" in t and "MANO" in t:
        return "used"
    return "unknown"


def pick_best_variant(product: dict[str, Any]) -> dict[str, Any] | None:
    variants = product.get("variants") or []
    usable = [v for v in variants if v.get("available") is not False]
    if not usable:
        usable = list(variants)
    if not usable:
        return None

    def sort_key(variant: dict[str, Any]) -> tuple[int, float]:
        cond = infer_variant_condition(str(variant.get("title") or ""))
        rank = CONDITION_RANK.get(cond, 99)
        try:
            price = float(variant.get("price") or 0)
        except (TypeError, ValueError):
            price = 999999.0
        return (rank, price)

    return sorted(usable, key=sort_key)[0]


def shopify_product_to_row(product: dict[str, Any]) -> dict[str, Any] | None:
    variant = pick_best_variant(product)
    if not variant:
        return None
    try:
        price = round(float(variant.get("price") or 0), 2)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None

    title = str(product.get("title") or "")
    body = str(product.get("body_html") or "")
    handle = str(product.get("handle") or "")
    image_url = None
    images = product.get("images") or []
    if images and isinstance(images[0], dict):
        image_url = images[0].get("src")
    return {
        "title": title,
        "productUrl": f"{KAOTO_BASE}/products/{handle}",
        "priceEur": price,
        "listingRegion": infer_kaoto_region(title, body),
        "condition": infer_variant_condition(str(variant.get("title") or "")),
        "inStock": variant.get("available") is not False,
        "externalId": str(product.get("id") or ""),
        "variantTitle": str(variant.get("title") or ""),
        "imageUrl": image_url,
        "images": images,
    }


def search_url(query: str, *, page: int = 1) -> str:
    params = urllib.parse.urlencode({"q": query, "type": "product", "page": page})
    return f"{KAOTO_BASE}/search?{params}"


def parse_search_handles(html_text: str) -> list[str]:
    handles: list[str] = []
    seen: set[str] = set()
    for match in PRODUCT_HANDLE_RE.finditer(html_text):
        handle = match.group(1)
        if handle in seen or handle in {"all", "new", "sale"}:
            continue
        seen.add(handle)
        handles.append(handle)
    return handles


def fetch_product_by_handle(handle: str) -> dict[str, Any] | None:
    url = f"{KAOTO_BASE}/products/{handle.strip('/')}.json"
    payload = fetch_json(url)
    product = payload.get("product")
    return product if isinstance(product, dict) else None


def fetch_search_products(
    query: str,
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.3,
) -> list[dict[str, Any]]:
    """Buscador de la home (lupa). Sin resultados → []."""
    query = normalize_query(query)
    if not query:
        return []

    if max_pages is not None:
        page_limit = max(1, max_pages)
    else:
        from collectors.listing_recency import search_pages_cap

        page_limit = search_pages_cap()

    seen_handles: set[str] = set()
    products: list[dict[str, Any]] = []

    for page in range(1, page_limit + 1):
        html = fetch_html(search_url(query, page=page))
        handles = parse_search_handles(html)
        if not handles:
            break

        new_handles = [handle for handle in handles if handle not in seen_handles]
        if not new_handles:
            break
        for handle in new_handles:
            seen_handles.add(handle)

        for handle in new_handles:
            raw = fetch_product_by_handle(handle)
            if not raw:
                continue
            row = shopify_product_to_row(raw)
            if row:
                products.append(row)
            if delay_s:
                time.sleep(min(delay_s, 0.15))

        if page < page_limit:
            time.sleep(delay_s)

    return products


def fetch_game_products(
    game: dict[str, Any],
    *,
    max_pages: int | None = DEFAULT_GAME_SEARCH_MAX_PAGES,
    delay_s: float = 0.3,
) -> list[dict[str, Any]]:
    return fetch_search_products(
        build_kaoto_search_query(game),
        max_pages=max_pages,
        delay_s=delay_s,
    )


def fetch_collection_products(
    collection_handle: str,
    *,
    limit: int = 250,
    delay_s: float = 0.3,
) -> list[dict[str, Any]]:
    """Deprecated: barrido por colección. Usar fetch_game_products por título."""
    products: list[dict[str, Any]] = []
    page = 1
    while True:
        params = urllib.parse.urlencode({"limit": limit, "page": page})
        url = f"{KAOTO_BASE}/collections/{collection_handle}/products.json?{params}"
        payload = fetch_json(url)
        batch = payload.get("products") or []
        if not batch:
            break
        for product in batch:
            row = shopify_product_to_row(product)
            if row:
                products.append(row)
        if len(batch) < limit:
            break
        page += 1
        time.sleep(delay_s)
    return products


def fetch_platform_products(platform_slug: str, *, delay_s: float = 0.3) -> list[dict[str, Any]]:
    """Deprecated: barrido por colección."""
    handle = collection_handle_for_platform(platform_slug)
    if not handle:
        return []
    return fetch_collection_products(handle, delay_s=delay_s)
