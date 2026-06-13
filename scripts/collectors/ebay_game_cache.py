"""Utilidades de caché de búsqueda eBay por juego (respuesta API cruda)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collectors.common import load_json

GAME_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "price-ingest" / "cache" / "ebay"


def game_cache_max_age_hours() -> float:
    raw = os.environ.get("EBAY_GAME_CACHE_MAX_AGE_HOURS", "72").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 72.0


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def game_cache_is_fresh(cache_file: Path, *, max_age_hours: float | None = None) -> bool:
    if not cache_file.exists():
        return False
    if max_age_hours is None:
        max_age_hours = game_cache_max_age_hours()
    if max_age_hours <= 0:
        return False
    cached = load_json(cache_file, {})
    collected = parse_iso(str(cached.get("collectedAt") or ""))
    if collected is None:
        return False
    age_h = (datetime.now(timezone.utc) - collected.astimezone(timezone.utc)).total_seconds() / 3600.0
    return age_h <= max_age_hours


def load_game_cache(cache_file: Path) -> dict[str, Any] | None:
    if not cache_file.exists():
        return None
    return load_json(cache_file, {})


__all__ = [
    "GAME_CACHE_DIR",
    "game_cache_is_fresh",
    "game_cache_max_age_hours",
    "load_game_cache",
]
