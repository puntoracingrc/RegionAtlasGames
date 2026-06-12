"""Cliente Shopify Storefront JSON — kaotostore.myshopify.com."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from html import unescape
from typing import Any

KAOTO_BASE = "https://kaotostore.myshopify.com"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"

CONDITION_RANK = {"used": 1, "no_manual": 2, "cib": 3, "sealed": 4, "unknown": 5}


def fetch_json(url: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


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
    return {
        "title": title,
        "productUrl": f"{KAOTO_BASE}/products/{handle}",
        "priceEur": price,
        "listingRegion": infer_kaoto_region(title, body),
        "condition": infer_variant_condition(str(variant.get("title") or "")),
        "inStock": variant.get("available") is not False,
        "externalId": str(product.get("id") or ""),
        "variantTitle": str(variant.get("title") or ""),
    }


def fetch_collection_products(
    collection_handle: str,
    *,
    limit: int = 250,
    delay_s: float = 0.3,
) -> list[dict[str, Any]]:
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
