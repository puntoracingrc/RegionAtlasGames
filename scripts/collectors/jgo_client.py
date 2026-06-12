"""Cliente WooCommerce Store API — japangameonline.com."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

JGO_BASE = "https://japangameonline.com"
JGO_API = f"{JGO_BASE}/wp-json/wc/store/products"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"


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


def fetch_products_for_categories(
    categories: list[str],
    *,
    max_pages: int | None = None,
    delay_s: float = 0.25,
) -> list[dict[str, Any]]:
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
