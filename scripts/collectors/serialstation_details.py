"""Metadatos PlayStation desde SerialStation API (códigos SLES/CUSA/ULES… + título)."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from collectors.game_details_lib import (
    FIELD_KEYS,
    SOURCE_SERIALSTATION,
    _field_has_value,
    entity_from_serialstation,
    is_valid_detail,
    slugify,
)
from collectors.reference_match import extract_references_from_text, normalize_reference
from collectors import platform_sources as ps

API_BASE = "https://api.serialstation.com/v1"
USER_AGENT = "RegionAtlasGames/1.0 (catalog enrichment)"
REQUEST_DELAY = 0.25

PS_PLATFORMS = frozenset(ps.ps_platform_slugs()) | frozenset({"ps5"})

PLATFORM_TO_CONSOLE = ps.legacy_serialstation_consoles()

REGION_TITLE_ID_PREFIXES: dict[str, list[str]] = {
    "PAL ES": ["SLES", "SCES", "BLES", "ULES", "CUSA", "PCSB", "PCSE", "NPUB", "NPEB", "NPEG"],
    "PAL Europa": ["SLES", "SCES", "BLES", "ULES", "CUSA", "NPUB", "NPEB", "NPEG"],
    "USA": ["SLUS", "BLUS", "ULUS", "CUSA", "NPUB", "NPUB"],
    "Japón": ["SLPS", "SCPS", "SLPM", "SCAJ", "NPJH", "NPJB", "PCSG", "ULJM", "VLJM"],
}

PS_REFERENCE_PREFIXES = frozenset(
    {
        "CUSA",
        "BLUS",
        "BLES",
        "BLJM",
        "NPUB",
        "NPEB",
        "NPJB",
        "ULES",
        "ULUS",
        "SLPS",
        "SLES",
        "SLED",
        "SLUS",
        "SCPS",
        "SCES",
        "SCED",
        "PCSB",
        "PCSE",
        "PCSF",
        "PCSG",
        "NPJH",
        "NPUG",
        "ULJM",
        "VLJM",
        "PPSA",
    }
)


def is_ps_platform(platform_slug: str) -> bool:
    return platform_slug in PS_PLATFORMS


def _api_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | list[Any] | None:
    query = dict(params or {})
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, urllib.error.HTTPError):
        return None


def format_title_id(title_id: str) -> str:
    raw = normalize_reference(title_id)
    match = re.match(r"^([A-Z]{3,4})(\d{3,6}[A-Z0-9]*)$", raw)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return raw


def to_api_title_id(reference: str) -> str:
    return re.sub(r"[\s-]+", "", normalize_reference(reference))


def is_ps_reference(reference: str) -> bool:
    raw = normalize_reference(reference)
    prefix = re.match(r"^([A-Z]{3,4})", raw)
    return bool(prefix and prefix.group(1) in PS_REFERENCE_PREFIXES)


def _normalize_title(text: str) -> str:
    return re.sub(r"\s+", " ", slugify(text).replace("-", " ")).strip()


def _title_similarity(a: str, b: str) -> float:
    na, nb = _normalize_title(a), _normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.92
    ta, tb = set(na.split()), set(nb.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def pick_title_id(title_ids: list[str], region: str, platform_slug: str) -> str | None:
    if not title_ids:
        return None
    prefixes = REGION_TITLE_ID_PREFIXES.get(region) or REGION_TITLE_ID_PREFIXES["PAL Europa"]
    console = PLATFORM_TO_CONSOLE.get(platform_slug)
    ranked: list[tuple[int, str]] = []
    for tid in title_ids:
        up = tid.upper()
        score = 0
        for idx, prefix in enumerate(prefixes):
            if up.startswith(prefix):
                score = 100 - idx
                break
        if console == "PS4" and up.startswith("CUSA"):
            score = max(score, 80)
        if console == "PS2" and up.startswith(("SLES", "SCES", "SLUS", "SLPS")):
            score = max(score, 70)
        ranked.append((score, tid))
    ranked.sort(key=lambda x: (-x[0], x[1]))
    if ranked[0][0] > 0:
        return ranked[0][1]
    return title_ids[0]


def extract_game_reference(game: dict[str, Any], details: dict[str, Any] | None) -> str | None:
    detail_ref = str((details or {}).get("reference") or "").strip()
    if detail_ref and is_ps_reference(detail_ref):
        return format_title_id(detail_ref)
    text = " ".join(
        str(game.get(key) or "")
        for key in ("title", "titlePc", "slug", "id")
    )
    for ref in sorted(extract_references_from_text(text), key=len, reverse=True):
        if is_ps_reference(ref):
            return format_title_id(ref)
    return None


def fetch_title_id_record(reference: str) -> dict[str, Any] | None:
    data = _api_get(f"/title-ids/{to_api_title_id(reference)}")
    return data if isinstance(data, dict) and data.get("title_id") else None


def fetch_game(game_id: str) -> dict[str, Any] | None:
    data = _api_get(f"/games/{game_id}")
    return data if isinstance(data, dict) and data.get("id") else None


def search_games(title: str, *, limit: int = 15) -> list[dict[str, Any]]:
    data = _api_get("/games/", {"name": title, "limit": limit})
    if not isinstance(data, dict):
        return []
    items = data.get("items") or []
    return [item for item in items if isinstance(item, dict)]


def match_game_by_reference(reference: str) -> tuple[dict[str, Any] | None, str | None, float]:
    record = fetch_title_id_record(reference)
    time.sleep(REQUEST_DELAY)
    if not record:
        return None, None, 0.0
    games = record.get("games") or []
    if not games:
        return None, None, 0.0
    game_id = games[0].get("id")
    if not game_id:
        return None, None, 0.0
    game = fetch_game(str(game_id))
    time.sleep(REQUEST_DELAY)
    if not game:
        return None, None, 0.0
    return game, str(record.get("title_id") or ""), 1.0


def match_game_by_title(
    title: str,
    platform_slug: str,
    region: str,
) -> tuple[dict[str, Any] | None, str | None, float]:
    candidates = search_games(title)
    time.sleep(REQUEST_DELAY)
    if not candidates:
        return None, None, 0.0

    console = PLATFORM_TO_CONSOLE.get(platform_slug)
    best_game: dict[str, Any] | None = None
    best_score = 0.0

    for candidate in candidates:
        systems = candidate.get("title_ids") or []
        _ = systems  # title_ids list on game object, not systems
        name = str(candidate.get("name") or "")
        score = _title_similarity(title, name)
        if console and score >= 0.45:
            prefixes = {
                "PS1": ("SLUS", "SLES", "SCES"),
                "PS2": ("SLUS", "SLES", "SCES"),
                "PS3": ("BLUS", "BLES", "BCUS", "BCES"),
                "PS4": ("CUSA", "PCSB", "PCSE"),
                "PSP": ("ULUS", "ULES", "UCES"),
                "PSV": ("PCSB", "PCSE", "PCSF"),
            }.get(console, ())
            if any(str(tid).upper().startswith(prefixes) for tid in (candidate.get("title_ids") or [])):
                score += 0.08
        score = min(score, 1.0)
        if score > best_score:
            best_score = score
            best_game = candidate

    if not best_game or best_score < 0.55:
        return None, None, best_score

    title_ids = best_game.get("title_ids") or []
    picked = pick_title_id([str(t) for t in title_ids], region, platform_slug)
    return best_game, picked, best_score


def build_serialstation_details(
    game: dict[str, Any],
    ss_game: dict[str, Any],
    *,
    title_id: str | None,
    match_method: str,
    match_score: float,
) -> dict[str, Any]:
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%S")
    region = str(game.get("region") or "PAL Europa")
    platform = str(game.get("platformSlug") or "")

    if not title_id:
        title_ids = ss_game.get("title_ids") or []
        title_id = pick_title_id([str(t) for t in title_ids], region, platform)

    reference = format_title_id(title_id) if title_id else None

    dev = (ss_game.get("developers") or [None])[0]
    pub = (ss_game.get("publishers") or [None])[0]
    franchise = (ss_game.get("franchises") or [None])[0]

    developer = (
        entity_from_serialstation(str(dev["name"]), str(dev["id"]))
        if isinstance(dev, dict) and dev.get("name")
        else None
    )
    publisher = (
        entity_from_serialstation(str(pub["name"]), str(pub["id"]))
        if isinstance(pub, dict) and pub.get("name")
        else None
    )
    series = (
        entity_from_serialstation(str(franchise["name"]), str(franchise["id"]))
        if isinstance(franchise, dict) and franchise.get("name")
        else None
    )

    detail: dict[str, Any] = {
        "year": None,
        "releaseDate": None,
        "reference": reference,
        "players": None,
        "support": None,
        "developer": developer,
        "publisher": publisher,
        "genres": [],
        "series": series,
        "fetchedAt": fetched_at,
        "sources": {
            SOURCE_SERIALSTATION: {
                "serialstationId": ss_game.get("id"),
                "titleId": title_id,
                "matchMethod": match_method,
                "matchScore": round(match_score, 3),
                "fetchedAt": fetched_at,
            }
        },
        "fieldSources": {},
    }

    for field in FIELD_KEYS:
        if _field_has_value(detail, field):
            detail["fieldSources"][field] = SOURCE_SERIALSTATION
    return detail


def fetch_serialstation_details(
    game: dict[str, Any],
    details: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    platform = str(game.get("platformSlug") or "")
    if not is_ps_platform(platform):
        return None

    title = str(game.get("title") or "")
    region = str(game.get("region") or "PAL Europa")

    reference = extract_game_reference(game, details)
    if reference:
        ss_game, title_id, score = match_game_by_reference(reference)
        if ss_game:
            detail = build_serialstation_details(
                game,
                ss_game,
                title_id=title_id,
                match_method="reference",
                match_score=score,
            )
            return detail if is_valid_detail(detail) else None

    ss_game, title_id, score = match_game_by_title(title, platform, region)
    if not ss_game:
        return None

    # Fetch full game if search result is summary-only (same schema, but ensure id)
    full_game = fetch_game(str(ss_game.get("id") or "")) or ss_game
    time.sleep(REQUEST_DELAY)

    detail = build_serialstation_details(
        game,
        full_game,
        title_id=title_id,
        match_method="title",
        match_score=score,
    )
    return detail if is_valid_detail(detail) else None


def details_have_serialstation_gaps(detail: dict[str, Any] | None) -> bool:
    if not detail or not is_valid_detail(detail):
        return True
    if detail.get("sources", {}).get(SOURCE_SERIALSTATION):
        return False
    for field in ("reference", "developer", "publisher", "series"):
        if not _field_has_value(detail, field):
            return True
    return False
