"""Enriquecimiento de metadatos desde Wikidata (match título + plataforma P400)."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from collectors.game_description_ai import PLATFORM_WIKI_HINT
from collectors.game_details_lib import (
    FIELD_KEYS,
    SOURCE_WIKIDATA,
    _field_has_value,
    entity_from_wikidata,
    is_valid_detail,
    slugify,
)

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "RegionAtlasGames/1.0 (catalog enrichment; contact via regionatlas)"
REQUEST_DELAY = 0.25

VIDEO_GAME_QIDS = {"Q7889", "Q21191270", "Q112144412"}
EUROPE_QIDS = {"Q46", "Q48"}  # Europa, Antártida usada a veces como proxy EU en WD

PLATFORM_WIKIDATA_QIDS: dict[str, list[str]] = {
    "nes": ["Q172742"],
    "snes": ["Q183259", "Q174666"],
    "n64": ["Q105689"],
    "gameboy": ["Q186437", "Q186445"],
    "gamecube": ["Q188642", "Q192851"],
    "wii": ["Q8079"],
    "ds": ["Q170325"],
    "3ds": ["Q188642"],
    "megadrive": ["Q10676"],
    "sega32x": ["Q182434"],
    "megacd": ["Q105464"],
    "mastersystem": ["Q182463"],
    "saturn": ["Q10682"],
    "dreamcast": ["Q184689"],
    "gamegear": ["Q206474"],
    "neogeo": ["Q193710"],
    "neogeocd": ["Q1057998"],
    "neogeopocket": ["Q1058014"],
    "ps1": ["Q10677"],
    "ps2": ["Q10680"],
    "ps3": ["Q10683"],
    "ps4": ["Q944147"],
}

MULTIPLAYER_QIDS = {
    "Q208850",
    "Q6895044",
    "Q6895045",
}


def _api_get(params: dict[str, Any]) -> dict[str, Any] | None:
    query = dict(params)
    query["format"] = "json"
    url = f"{WIKIDATA_API}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _claim_entity_ids(claims: dict[str, Any], prop: str) -> list[str]:
    ids: list[str] = []
    for claim in claims.get(prop, []):
        if claim.get("mainsnak", {}).get("snaktype") != "value":
            continue
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, dict) and value.get("id"):
            ids.append(str(value["id"]))
    return ids


def _claim_times(claims: dict[str, Any], prop: str) -> list[str]:
    times: list[str] = []
    for claim in claims.get(prop, []):
        if claim.get("mainsnak", {}).get("snaktype") != "value":
            continue
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, dict) and value.get("time"):
            times.append(str(value["time"]))
    return times


def _label(entity: dict[str, Any], *, prefer: tuple[str, ...] = ("es", "en")) -> str | None:
    labels = entity.get("labels") or {}
    for lang in prefer:
        if lang in labels:
            return str(labels[lang].get("value") or "").strip() or None
    for item in labels.values():
        text = str(item.get("value") or "").strip()
        if text:
            return text
    return None


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


def _is_video_game(claims: dict[str, Any]) -> bool:
    return bool(set(_claim_entity_ids(claims, "P31")) & VIDEO_GAME_QIDS)


def _platform_matches(claims: dict[str, Any], platform_slug: str) -> bool:
    expected = set(PLATFORM_WIKIDATA_QIDS.get(platform_slug, []))
    if not expected:
        return False
    found = set(_claim_entity_ids(claims, "P400"))
    return bool(expected & found)


def _pick_year(claims: dict[str, Any]) -> int | None:
    best_year: int | None = None
    for claim in claims.get("P577", []):
        if claim.get("mainsnak", {}).get("snaktype") != "value":
            continue
        time_val = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if not isinstance(time_val, dict):
            continue
        raw = str(time_val.get("time") or "")
        match = re.search(r"(\d{4})", raw)
        if not match:
            continue
        year = int(match.group(1))
        qualifiers = claim.get("qualifiers") or {}
        region_ids = set()
        for q in qualifiers.get("P291", []):
            v = q.get("datavalue", {}).get("value")
            if isinstance(v, dict) and v.get("id"):
                region_ids.add(str(v["id"]))
        if region_ids & EUROPE_QIDS:
            return year
        if best_year is None or year < best_year:
            best_year = year
    return best_year


def _pick_players(claims: dict[str, Any]) -> int | None:
    modes = set(_claim_entity_ids(claims, "P404"))
    if modes & MULTIPLAYER_QIDS and modes - MULTIPLAYER_QIDS:
        return 2
    if modes & MULTIPLAYER_QIDS:
        return 2
    if modes:
        return 1
    return None


def search_candidates(title: str, platform_slug: str) -> list[str]:
    hint = PLATFORM_WIKI_HINT.get(platform_slug, platform_slug)
    queries = [title, f"{title} {hint}"]
    seen: set[str] = set()
    qids: list[str] = []

    for query in queries:
        for lang in ("es", "en"):
            data = _api_get(
                {
                    "action": "wbsearchentities",
                    "search": query,
                    "language": lang,
                    "limit": 8,
                }
            )
            if not data:
                continue
            for hit in data.get("search", []):
                qid = hit.get("id")
                if qid and qid not in seen:
                    seen.add(qid)
                    qids.append(qid)
            time.sleep(REQUEST_DELAY)
    return qids[:12]


def fetch_entities(qids: list[str]) -> dict[str, dict[str, Any]]:
    if not qids:
        return {}
    data = _api_get(
        {
            "action": "wbgetentities",
            "ids": "|".join(qids),
            "props": "claims|labels",
            "languages": "es|en",
        }
    )
    if not data:
        return {}
    return data.get("entities") or {}


def resolve_labels(qids: list[str], entities: dict[str, dict[str, Any]]) -> dict[str, str]:
    missing = [qid for qid in qids if qid not in entities or "missing" in entities.get(qid, {})]
    if missing:
        entities.update(fetch_entities(missing))
    out: dict[str, str] = {}
    for qid in qids:
        entity = entities.get(qid) or {}
        label = _label(entity)
        if label:
            out[qid] = label
    return out


def match_wikidata_entity(title: str, platform_slug: str) -> tuple[str | None, float]:
    candidates = search_candidates(title, platform_slug)
    if not candidates:
        return None, 0.0

    entities = fetch_entities(candidates)
    best_qid: str | None = None
    best_score = 0.0

    for qid, entity in entities.items():
        if not entity or "missing" in entity:
            continue
        claims = entity.get("claims") or {}
        if not _is_video_game(claims):
            continue
        if not _platform_matches(claims, platform_slug):
            continue
        label = _label(entity) or ""
        score = _title_similarity(title, label)
        if score > best_score:
            best_score = score
            best_qid = qid

    if best_qid and best_score >= 0.55:
        return best_qid, best_score
    return None, best_score


def build_wikidata_details(qid: str, entities: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    if entities is None:
        entities = fetch_entities([qid])
    entity = entities.get(qid) or {}
    claims = entity.get("claims") or {}
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%S")

    label_ids: list[str] = []
    for prop in ("P178", "P123", "P136", "P179"):
        label_ids.extend(_claim_entity_ids(claims, prop))
    label_map = resolve_labels(label_ids, entities)

    developer_q = (_claim_entity_ids(claims, "P178") or [None])[0]
    publisher_q = (_claim_entity_ids(claims, "P123") or [None])[0]
    series_q = (_claim_entity_ids(claims, "P179") or [None])[0]

    developer = (
        entity_from_wikidata(label_map[developer_q], developer_q)
        if developer_q and developer_q in label_map
        else None
    )
    publisher = (
        entity_from_wikidata(label_map[publisher_q], publisher_q)
        if publisher_q and publisher_q in label_map
        else None
    )
    genres = [
        entity_from_wikidata(label_map[q], q)
        for q in _claim_entity_ids(claims, "P136")
        if q in label_map
    ]
    series = (
        entity_from_wikidata(label_map[series_q], series_q)
        if series_q and series_q in label_map
        else None
    )

    year = _pick_year(claims)
    players = _pick_players(claims)
    times = _claim_times(claims, "P577")
    release_date = None
    if times:
        match = re.search(r"(\d{4}-\d{2}-\d{2})", times[0])
        if match:
            release_date = match.group(1)

    detail: dict[str, Any] = {
        "year": year,
        "releaseDate": release_date,
        "reference": None,
        "players": players,
        "support": None,
        "developer": developer,
        "publisher": publisher,
        "genres": genres,
        "series": series,
        "fetchedAt": fetched_at,
        "sources": {
            SOURCE_WIKIDATA: {
                "wikidataId": qid,
                "fetchedAt": fetched_at,
            }
        },
        "fieldSources": {},
    }
    for field in FIELD_KEYS:
        if _field_has_value(detail, field):
            detail["fieldSources"][field] = SOURCE_WIKIDATA
    return detail


def fetch_wikidata_details(title: str, platform_slug: str) -> dict[str, Any] | None:
    qid, score = match_wikidata_entity(title, platform_slug)
    if not qid:
        return None
    detail = build_wikidata_details(qid)
    detail["sources"][SOURCE_WIKIDATA]["matchScore"] = round(score, 3)
    return detail if is_valid_detail(detail) else None


def details_have_gaps(detail: dict[str, Any] | None) -> bool:
    if not detail or not is_valid_detail(detail):
        return True
    for field in ("developer", "publisher", "genres", "year", "series"):
        if not _field_has_value(detail, field):
            return True
    return False
