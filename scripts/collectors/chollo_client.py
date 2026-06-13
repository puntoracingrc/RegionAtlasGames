"""Cliente HTML PrestaShop — chollogames.es."""

from __future__ import annotations

import html
import re
import time
import urllib.request
from typing import Any

CHOLLO_BASE = "https://www.chollogames.es"
USER_AGENT = "RegionAtlasGames/1.0 (+price-reference-ingest)"

PRODUCT_BLOCK_RE = re.compile(
    r'product_img_link[^>]*href="([^"]+)"[^>]*title="([^"]+)"(.*?)Desde:\s*€\s*([\d\.]+)',
    re.I | re.S,
)
REGION_RE = re.compile(r"Region:\s*</strong>\s*([^<\n]+)", re.I)
SYSTEM_RE = re.compile(r"Sistema:\s*</strong>\s*([^<\n]+)", re.I)
CONDITION_RE = re.compile(
    r"Sin Caja Ni Manual|Sin Manual|Sin Caja|Completo|Nuevo",
    re.I,
)
IMG_RE = re.compile(r'\bsrc="([^"]+/(\d+)(?:-[a-z]|/)[^"]+\.(?:jpg|jpeg|png|webp))"', re.I)
PAGE_LINK_RE = re.compile(r"[?&]p=(\d+)")


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_chollo_region(raw: str) -> str | None:
    text = html.unescape(raw).strip().lower()
    if "japon" in text or "japanese" in text:
        return "Japón"
    if "americ" in text or "usa" in text:
        return "USA"
    if "europ" in text or "pal" in text or "espa" in text:
        return "PAL Europa"
    return None


def infer_chollo_condition(meta_html: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", meta_html))
    if re.search(r"\bnuevo\b", text, re.I):
        return "sealed"
    if "Sin Caja Ni Manual" in text:
        return "used"
    if "Sin Manual" in text:
        return "no_manual"
    if "Sin Caja" in text:
        return "used"
    if "Completo" in text:
        return "cib"
    return "unknown"


def parse_category_page(html_text: str) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for url, title, meta, price_raw in PRODUCT_BLOCK_RE.findall(html_text):
        region_raw = REGION_RE.search(meta)
        system_raw = SYSTEM_RE.search(meta)
        listing_region = parse_chollo_region(region_raw.group(1)) if region_raw else None
        if not listing_region and "importaci" in html.unescape(meta).lower():
            listing_region = "Japón"
        try:
            price = round(float(price_raw), 2)
        except ValueError:
            continue
        if price <= 0:
            continue
        external_id = ""
        id_match = re.search(r"/(\d+)-[^/]+\.html", url)
        if id_match:
            external_id = id_match.group(1)
        img_match = IMG_RE.search(meta)
        image_url = html.unescape(img_match.group(1)).strip() if img_match else ""
        products.append(
            {
                "title": html.unescape(title).strip(),
                "productUrl": url if url.startswith("http") else f"{CHOLLO_BASE}{url}",
                "priceEur": price,
                "listingRegion": listing_region or "Japón",
                "condition": infer_chollo_condition(meta),
                "system": html.unescape(system_raw.group(1)).strip() if system_raw else None,
                "externalId": external_id,
                "imageUrl": image_url or None,
            }
        )
    return products


def max_page_number(html_text: str) -> int:
    pages = [int(p) for p in PAGE_LINK_RE.findall(html_text)]
    return max(pages) if pages else 1


def fetch_category_products(category_path: str, *, delay_s: float = 0.4) -> list[dict[str, Any]]:
    """category_path ej. 45-nintendo-64-importacion"""
    base_url = f"{CHOLLO_BASE}/{category_path.strip('/')}"
    first_html = fetch_html(base_url)
    max_page = max_page_number(first_html)
    seen_urls: set[str] = set()
    products: list[dict[str, Any]] = []

    for page in range(1, max_page + 1):
        page_url = base_url if page == 1 else f"{base_url}?p={page}"
        page_html = first_html if page == 1 else fetch_html(page_url)
        for product in parse_category_page(page_html):
            url = str(product["productUrl"])
            if url in seen_urls:
                continue
            seen_urls.add(url)
            products.append(product)
        if page < max_page:
            time.sleep(delay_s)

    return products
