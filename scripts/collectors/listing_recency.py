"""Antigüedad máxima de anuncios P2P (p. ej. 6 meses). CeX/retail = stock vivo."""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from collectors.common import ROOT, load_json

RECENCY_FILE = ROOT / "data" / "ingest-recency.json"
DEFAULT_MAX_LISTING_AGE_DAYS = 180
DEFAULT_WALLAPOP_LISTING_AGE_DAYS = 30
DEFAULT_WALLAPOP_TIME_FILTER = "lastMonth"
DEFAULT_TC_MAX_PAGES = 25
DEFAULT_WALLAPOP_MAX_PAGES = 5
DEFAULT_WALLAPOP_PER_GAME_PAGES = None
DEFAULT_SEARCH_PER_GAME_PAGES = None
DEFAULT_SEARCH_PAGES_CAP = 20
DEFAULT_TC_EARLY_STOP_STALE_RATIO = 0.9

_TC_IMAGE_DATE = re.compile(r"/tc/(\d{4})/(\d{2})/(\d{2})/")


def _load_recency_config() -> dict[str, Any]:
    raw = load_json(RECENCY_FILE, {})
    return raw if isinstance(raw, dict) else {}


def max_listing_age_days() -> int:
    env = os.environ.get("INGEST_MAX_LISTING_AGE_DAYS", "").strip()
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cfg = _load_recency_config()
    try:
        return max(1, int(cfg.get("maxListingAgeDays") or DEFAULT_MAX_LISTING_AGE_DAYS))
    except (TypeError, ValueError):
        return DEFAULT_MAX_LISTING_AGE_DAYS


def tc_max_pages() -> int | None:
    env = os.environ.get("INGEST_TC_MAX_PAGES", "").strip()
    if env:
        if env.lower() in {"0", "none", "all"}:
            return None
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cfg = _load_recency_config()
    raw = cfg.get("tcMaxPages")
    if raw is None:
        return DEFAULT_TC_MAX_PAGES
    try:
        pages = int(raw)
        return max(1, pages) if pages > 0 else None
    except (TypeError, ValueError):
        return DEFAULT_TC_MAX_PAGES


def tc_early_stop_stale_ratio() -> float:
    cfg = _load_recency_config()
    try:
        return min(1.0, max(0.5, float(cfg.get("tcEarlyStopStalePageRatio") or DEFAULT_TC_EARLY_STOP_STALE_RATIO)))
    except (TypeError, ValueError):
        return DEFAULT_TC_EARLY_STOP_STALE_RATIO


def wallapop_listing_age_days() -> int:
    env = os.environ.get("INGEST_WALLAPOP_LISTING_AGE_DAYS", "").strip()
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cfg = _load_recency_config()
    try:
        return max(1, int(cfg.get("wallapopListingAgeDays") or DEFAULT_WALLAPOP_LISTING_AGE_DAYS))
    except (TypeError, ValueError):
        return DEFAULT_WALLAPOP_LISTING_AGE_DAYS


def wallapop_time_filter() -> str:
    env = os.environ.get("INGEST_WALLAPOP_TIME_FILTER", "").strip()
    if env:
        return env
    cfg = _load_recency_config()
    raw = cfg.get("wallapopTimeFilter")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return DEFAULT_WALLAPOP_TIME_FILTER


def wallapop_max_pages() -> int | None:
    env = os.environ.get("INGEST_WALLAPOP_MAX_PAGES", "").strip()
    if env:
        if env.lower() in {"0", "none", "all"}:
            return None
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cfg = _load_recency_config()
    raw = cfg.get("wallapopMaxPages")
    if raw is None:
        return DEFAULT_WALLAPOP_MAX_PAGES
    try:
        pages = int(raw)
        return max(1, pages) if pages > 0 else None
    except (TypeError, ValueError):
        return DEFAULT_WALLAPOP_MAX_PAGES


def wallapop_per_game_pages() -> int | None:
    pages = _per_game_pages_from_config(
        env_key="INGEST_WALLAPOP_PER_GAME_PAGES",
        cfg_key="wallapopPerGamePages",
        default=DEFAULT_WALLAPOP_PER_GAME_PAGES,
    )
    if pages is not None:
        return pages
    return search_per_game_pages()


def _per_game_pages_from_config(
    *,
    env_key: str,
    cfg_key: str,
    default: int | None,
) -> int | None:
    env = os.environ.get(env_key, "").strip()
    if env:
        if env.lower() in {"0", "none", "all"}:
            return None
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cfg = _load_recency_config()
    raw = cfg.get(cfg_key)
    if raw is None:
        return default
    try:
        pages = int(raw)
        return max(1, pages) if pages > 0 else None
    except (TypeError, ValueError):
        return default


def search_per_game_pages() -> int | None:
    """Páginas de búsqueda por juego (CeX, TodoColeccion, TodoConsolas, Kaoto, …). None = todas."""
    return _per_game_pages_from_config(
        env_key="INGEST_SEARCH_PER_GAME_PAGES",
        cfg_key="searchPerGamePages",
        default=DEFAULT_SEARCH_PER_GAME_PAGES,
    )


def search_pages_cap() -> int:
    """Tope duro cuando search_per_game_pages() es None (evita barridos infinitos)."""
    env = os.environ.get("INGEST_SEARCH_PAGES_CAP", "").strip()
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cfg = _load_recency_config()
    try:
        return max(1, int(cfg.get("searchPagesCap") or DEFAULT_SEARCH_PAGES_CAP))
    except (TypeError, ValueError):
        return DEFAULT_SEARCH_PAGES_CAP


def apply_recency_to_retail() -> bool:
    env = os.environ.get("INGEST_RECENCY_RETAIL", "").strip().lower()
    if env in {"1", "true", "yes"}:
        return True
    if env in {"0", "false", "no"}:
        return False
    return bool(_load_recency_config().get("applyToRetail"))


def parse_listed_at_from_tc_image(image_url: str | None) -> str | None:
    if not image_url:
        return None
    match = _TC_IMAGE_DATE.search(str(image_url))
    if not match:
        return None
    year, month, day = (int(match.group(i)) for i in range(1, 4))
    try:
        dt = datetime(year, month, day, 12, 0, 0, tzinfo=timezone.utc)
    except ValueError:
        return None
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_listed_at(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        try:
            year, month, day = (int(part) for part in text.split("-"))
            return datetime(year, month, day, 12, 0, 0, tzinfo=timezone.utc)
        except ValueError:
            return None
    normalized = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def listing_cutoff(*, now: datetime | None = None, source: str | None = None) -> datetime:
    anchor = now or datetime.now(timezone.utc)
    days = max_listing_age_days()
    src = str(source or "").lower()
    if src == "wallapop":
        days = wallapop_listing_age_days()
    return anchor - timedelta(days=days)


def is_recent_listing(
    row: dict[str, Any],
    *,
    source: str | None = None,
    now: datetime | None = None,
) -> bool:
    src = str(source or row.get("source") or "").lower()
    if src in {"cex", "japangameonline", "chollogames", "kaotostore", "todoconsolas"}:
        if not apply_recency_to_retail():
            return True

    listed = parse_listed_at(str(row.get("listedAt") or ""))
    if listed is None:
        collected = parse_listed_at(str(row.get("collectedAt") or ""))
        if collected is not None:
            listed = collected
    if listed is None:
        return True

    return listed >= listing_cutoff(now=now, source=src)


def filter_recent_rows(
    rows: list[dict[str, Any]],
    *,
    source: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    kept: list[dict[str, Any]] = []
    dropped = 0
    for row in rows:
        if is_recent_listing(row, source=source or str(row.get("source") or "")):
            kept.append(row)
        else:
            dropped += 1
    return kept, dropped


def filter_recent_products(
    products: list[dict[str, Any]],
    *,
    source: str = "todocoleccion",
) -> tuple[list[dict[str, Any]], int]:
    return filter_recent_rows(products, source=source)


def enrich_tc_product(product: dict[str, Any]) -> dict[str, Any]:
    image = product.get("imageUrl")
    if not image:
        raw_image = product.get("image")
        if isinstance(raw_image, list):
            image = raw_image[0] if raw_image else None
        elif raw_image:
            image = str(raw_image)
    if image and not product.get("imageUrl"):
        product["imageUrl"] = str(image)
    listed_at = product.get("listedAt") or parse_listed_at_from_tc_image(str(image or ""))
    if listed_at:
        product["listedAt"] = listed_at
    return product


__all__ = [
    "DEFAULT_MAX_LISTING_AGE_DAYS",
    "DEFAULT_TC_MAX_PAGES",
    "apply_recency_to_retail",
    "enrich_tc_product",
    "filter_recent_products",
    "filter_recent_rows",
    "is_recent_listing",
    "listing_cutoff",
    "max_listing_age_days",
    "parse_listed_at_from_tc_image",
    "search_pages_cap",
    "search_per_game_pages",
    "tc_early_stop_stale_ratio",
    "tc_max_pages",
    "wallapop_listing_age_days",
    "wallapop_max_pages",
    "wallapop_per_game_pages",
    "wallapop_time_filter",
]
