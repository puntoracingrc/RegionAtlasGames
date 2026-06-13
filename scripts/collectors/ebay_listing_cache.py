"""Caché por anuncio eBay (itemId): reutiliza filas ingest si título/precio no cambian."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from collectors.catalog_ai_match import product_cache_key
from collectors.common import load_json, now_iso, save_json

LISTING_CACHE_ROOT = Path(__file__).resolve().parents[2] / "data" / "price-ingest" / "cache" / "ebay-listings"


def item_snapshot(item: dict[str, Any]) -> tuple[str, float, str]:
    title = str(item.get("title") or "").strip()
    price = round(float(item.get("priceEur") or 0), 2)
    listing_type = "sold" if item.get("_listingType") == "sold" else str(item.get("listingType") or "active")
    return title, price, listing_type


def cache_is_fresh(cached: dict[str, Any], item: dict[str, Any]) -> bool:
    title, price, listing_type = item_snapshot(item)
    return (
        str(cached.get("title") or "") == title
        and round(float(cached.get("priceEur") or 0), 2) == price
        and str(cached.get("listingType") or "active") == listing_type
    )


def _cache_path(platform_slug: str, catalog_id: str, cache_key: str) -> Path:
    safe_key = re.sub(r"[^\w.-]+", "_", cache_key.strip()) or "unknown"
    return LISTING_CACHE_ROOT / platform_slug / catalog_id / f"{safe_key}.json"


def read_listing_cache(
    item: dict[str, Any],
    *,
    platform_slug: str,
    catalog_id: str,
) -> dict[str, Any] | None:
    cache_key = product_cache_key(item, "ebay-es")
    if not cache_key:
        return None
    path = _cache_path(platform_slug, catalog_id, cache_key)
    if not path.exists():
        return None
    cached = load_json(path, {})
    if not cache_is_fresh(cached, item):
        return None
    return cached


def write_listing_cache(
    item: dict[str, Any],
    *,
    platform_slug: str,
    catalog_id: str,
    accepted: bool,
    row: dict[str, Any] | None = None,
    skip_reason: str | None = None,
) -> None:
    cache_key = product_cache_key(item, "ebay-es")
    if not cache_key:
        return
    title, price, listing_type = item_snapshot(item)
    payload: dict[str, Any] = {
        "itemId": str(item.get("itemId") or ""),
        "title": title,
        "priceEur": price,
        "listingType": listing_type,
        "accepted": accepted,
        "skipReason": skip_reason,
        "resolvedAt": now_iso(),
    }
    if row:
        payload["row"] = row
    save_json(_cache_path(platform_slug, catalog_id, cache_key), payload)


__all__ = [
    "cache_is_fresh",
    "item_snapshot",
    "read_listing_cache",
    "write_listing_cache",
]
