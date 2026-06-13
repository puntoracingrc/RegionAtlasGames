"""Resuelve estado de conservación: texto → visión (solo casos dudosos)."""

from __future__ import annotations

import re
from typing import Any

from collectors.condition_buckets import (
    DISPLAY_BUCKETS,
    bucket_from_raw,
    infer_condition_bucket,
)
from collectors.condition_vision import classify_condition_from_images
from collectors.listing_images import row_image_urls

CONDITION_HINT_RE = re.compile(
    r"\b("
    r"completo|complete|cib|precintado|precintada|sellado|sealed|"
    r"suelto|loose|cartucho|disco|caja|manual|estado|conserv|usado|used"
    r")\b",
    re.I,
)

_VISION_STATS = {
    "calls": 0,
    "resolved": 0,
    "skipped_no_images": 0,
    "skipped_no_key": 0,
    "skipped_has_bucket": 0,
    "skipped_no_hints": 0,
}


def vision_stats() -> dict[str, int]:
    return dict(_VISION_STATS)


def reset_vision_stats() -> None:
    for key in _VISION_STATS:
        _VISION_STATS[key] = 0


def _vision_cache_key(row: dict[str, Any]) -> str:
    external = str(row.get("externalId") or "").strip()
    source = str(row.get("source") or "row").strip().lower()
    if external:
        return f"{source}:{external}"
    url = str(row.get("productUrl") or row.get("url") or "").strip()
    if url:
        return f"{source}:{url}"
    return ""


def _row_description(row: dict[str, Any]) -> str:
    return str(row.get("description") or row.get("listingDescription") or "").strip()


def _text_bucket(row: dict[str, Any], *, title: str, condition_raw: str) -> str | None:
    description = _row_description(row)
    explicit = str(row.get("condition") or row.get("conditionBucket") or "").strip().lower()
    if explicit in DISPLAY_BUCKETS:
        return explicit
    bucket = bucket_from_raw(condition_raw)
    if bucket:
        return bucket
    return infer_condition_bucket(title, condition_raw=condition_raw, description=description)


def _needs_vision(row: dict[str, Any], *, title: str, condition_raw: str) -> bool:
    if _text_bucket(row, title=title, condition_raw=condition_raw):
        _VISION_STATS["skipped_has_bucket"] += 1
        return False
    text = f"{title} {_row_description(row)} {condition_raw}".strip()
    if not CONDITION_HINT_RE.search(text):
        _VISION_STATS["skipped_no_hints"] += 1
        return False
    return True


def resolve_condition_bucket(
    row: dict[str, Any],
    *,
    platform_slug: str,
    use_vision: bool = True,
    fetch_images: bool = True,
) -> tuple[str | None, str]:
    """
    Devuelve (estado, method) con method: text | vision | none.
    estado ∈ loose | complete | sealed | None
    """
    title = str(row.get("title") or "")
    condition_raw = str(row.get("condition") or "")

    bucket = _text_bucket(row, title=title, condition_raw=condition_raw)
    if bucket:
        return bucket, "text"

    if not use_vision or not _needs_vision(row, title=title, condition_raw=condition_raw):
        return None, "none"

    cache_key = _vision_cache_key(row)
    if not cache_key:
        _VISION_STATS["skipped_no_key"] += 1
        return None, "none"

    has_inline_image = bool(row.get("imageUrls") or row.get("imageUrl"))
    urls = row_image_urls(row, fetch_missing=fetch_images and not has_inline_image)
    if not urls:
        _VISION_STATS["skipped_no_images"] += 1
        return None, "none"

    _VISION_STATS["calls"] += 1
    bucket, _conf, _reason = classify_condition_from_images(
        urls,
        title=title,
        platform_slug=platform_slug,
        source=str(row.get("source") or "unknown"),
        cache_key=cache_key,
    )
    if bucket:
        _VISION_STATS["resolved"] += 1
        return bucket, "vision"
    return None, "none"


__all__ = ["resolve_condition_bucket", "reset_vision_stats", "vision_stats"]
