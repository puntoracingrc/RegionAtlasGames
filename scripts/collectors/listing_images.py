"""URLs de imagen por fuente (listados y retail)."""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
IMAGE_CACHE_DIR = ROOT / "data" / "price-ingest" / "cache" / "listing-images"

OG_IMAGE_RE = re.compile(
    r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
    re.I,
)
OG_IMAGE_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    re.I,
)
IMG_SRC_RE = re.compile(r'\bsrc=["\']([^"\']+)["\']', re.I)


def _cache_path(url: str) -> Path:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return IMAGE_CACHE_DIR / f"{digest}.json"


def fetch_page_image_urls(page_url: str, *, use_cache: bool = True) -> list[str]:
    if not page_url:
        return []
    cache_file = _cache_path(page_url)
    if use_cache and cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        return [str(u) for u in cached.get("urls") or [] if u]

    urls: list[str] = []
    try:
        req = urllib.request.Request(page_url, headers={"User-Agent": "RegionAtlasGames/1.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        for pattern in (OG_IMAGE_RE, OG_IMAGE_RE_ALT):
            match = pattern.search(html)
            if match:
                urls.append(match.group(1).strip())
                break
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass

    IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps({"url": page_url, "urls": urls}, ensure_ascii=False), encoding="utf-8")
    return urls


def _cex_image_urls(product: dict[str, Any]) -> list[str]:
    raw = product.get("imageUrls")
    if isinstance(raw, dict):
        for key in ("large", "medium", "small"):
            url = raw.get(key)
            if url:
                return [str(url)]
    if isinstance(raw, list):
        return [str(u) for u in raw if u][:3]
    return []


def _jgo_image_urls(product: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for image in product.get("images") or []:
        src = image.get("src") if isinstance(image, dict) else None
        if src:
            urls.append(str(src))
    return urls[:3]


def _shopify_image_urls(product: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for image in product.get("images") or []:
        src = image.get("src") if isinstance(image, dict) else None
        if src:
            urls.append(str(src))
    return urls[:3]


def _ebay_image_urls(product: dict[str, Any]) -> list[str]:
    for key in ("imageUrl", "galleryURL", "galleryUrl", "image"):
        val = product.get(key)
        if isinstance(val, str) and val:
            return [val]
        if isinstance(val, dict) and val.get("imageUrl"):
            return [str(val["imageUrl"])]
    return []


def extract_product_image_urls(product: dict[str, Any], source: str) -> list[str]:
    source_key = source.strip().lower()
    if product.get("imageUrls") and isinstance(product["imageUrls"], list):
        return [str(u) for u in product["imageUrls"] if u][:3]

    if source_key == "cex":
        return _cex_image_urls(product)
    if source_key in ("jgo", "japangameonline"):
        return _jgo_image_urls(product)
    if source_key == "kaoto":
        return _shopify_image_urls(product)
    if source_key == "ebay-es":
        return _ebay_image_urls(product)

    for key in ("imageUrl", "imageUrls", "thumbnailUrl", "productImageUrl"):
        val = product.get(key)
        if isinstance(val, str) and val:
            return [val]
        if isinstance(val, list):
            return [str(u) for u in val if u][:3]
    return []


def row_image_urls(row: dict[str, Any], *, fetch_missing: bool = True) -> list[str]:
    urls: list[str] = []
    raw = row.get("imageUrls")
    if isinstance(raw, list):
        urls.extend(str(u) for u in raw if u)
    single = row.get("imageUrl")
    if single:
        urls.append(str(single))

    if urls:
        return list(dict.fromkeys(urls))[:3]

    if not fetch_missing:
        return []

    page_url = str(row.get("productUrl") or row.get("url") or "").strip()
    if page_url:
        return fetch_page_image_urls(page_url)[:3]
    return []


def attach_image_urls(row: dict[str, Any], product: dict[str, Any], source: str) -> None:
    urls = extract_product_image_urls(product, source)
    if not urls:
        page_url = str(product.get("productUrl") or product.get("url") or "").strip()
        if page_url and not product.get("imageUrl"):
            urls = fetch_page_image_urls(page_url)
    if urls:
        row["imageUrls"] = urls[:3]
        row["imageUrl"] = urls[0]


__all__ = [
    "attach_image_urls",
    "extract_product_image_urls",
    "fetch_page_image_urls",
    "row_image_urls",
]
