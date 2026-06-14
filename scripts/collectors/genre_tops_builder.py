"""Referentes de género por plataforma: heurísticas + Wikipedia + IA opcional."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from typing import Any

from collectors.catalog_ai_match import ai_available
from collectors.common import now_iso
from collectors.game_description_ai import PLATFORM_WIKI_HINT, _http_json
from collectors.game_description_ai import _openai_chat

USER_AGENT = "RegionAtlasGames/1.0 (genre tops; contact via regionatlas)"
WIKIPEDIA_API = "https://es.wikipedia.org/w/api.php"
REQUEST_DELAY = 0.25
TOP_PLATFORMS_PER_GENRE = 8
TOP_GAMES_PER_PLATFORM = 4
CANDIDATE_POOL = 16
MIN_PLATFORM_GAMES = 6


def _normalize(text: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", text.lower())
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return re.sub(r"\s+", " ", text)


def fetch_wikipedia_context(genre_name: str, platform_slug: str) -> str:
    platform_hint = PLATFORM_WIKI_HINT.get(platform_slug, platform_slug)
    query = f"mejores juegos {genre_name} {platform_hint}"
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": 2,
            "format": "json",
        }
    )
    try:
        payload = _http_json(f"{WIKIPEDIA_API}?{params}")
    except (OSError, json.JSONDecodeError, TimeoutError):
        return ""
    hits = payload.get("query", {}).get("search") or []
    if not hits:
        return ""
    title = hits[0].get("title")
    if not title:
        return ""
    time.sleep(REQUEST_DELAY)
    extract_params = urllib.parse.urlencode(
        {
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "exintro": 0,
            "exchars": 1800,
            "titles": title,
            "format": "json",
        }
    )
    try:
        extract_payload = _http_json(f"{WIKIPEDIA_API}?{extract_params}")
    except (OSError, json.JSONDecodeError, TimeoutError):
        return ""
    pages = extract_payload.get("query", {}).get("pages") or {}
    for page in pages.values():
        extract = page.get("extract")
        if extract:
            return str(extract)
    return ""


def score_candidate(
    game: dict[str, Any],
    details: dict[str, Any] | None,
    wiki_context: str,
) -> float:
    score = 0.0
    title = str(game.get("title") or "")
    detail = details or {}
    seo = detail.get("seoMeta") or {}

    if seo.get("referenceUsed"):
        score += 45
    highlights = seo.get("highlights") or []
    score += min(len(highlights), 4) * 8
    if detail.get("year"):
        score += 6
    price = game.get("recommendedPrice")
    if isinstance(price, (int, float)) and price > 0:
        score += min(float(price) / 12.0, 35)
        if price >= 100:
            score += 20

    norm_title = _normalize(title)
    wiki_norm = _normalize(wiki_context)
    if norm_title and wiki_norm:
        tokens = [token for token in norm_title.split() if len(token) >= 4]
        hits = sum(1 for token in tokens if token in wiki_norm)
        if hits >= 2 or norm_title in wiki_norm:
            score += 35
        elif hits == 1:
            score += 12

    return score


def pick_with_year_spread(
    candidates: list[tuple[str, dict[str, Any], float]],
    limit: int,
) -> list[str]:
    chosen: list[str] = []
    chosen_years: list[int] = []
    for game_id, game, score in candidates:
        if len(chosen) >= limit:
            break
        year = (game.get("details") or {}).get("year")
        if isinstance(year, int) and chosen_years:
            if any(abs(year - existing) < 3 for existing in chosen_years):
                continue
        chosen.append(game_id)
        if isinstance(year, int):
            chosen_years.append(year)

    if len(chosen) < limit:
        for game_id, _game, _score in candidates:
            if game_id in chosen:
                continue
            chosen.append(game_id)
            if len(chosen) >= limit:
                break
    return chosen


def pick_with_ai(
    genre_name: str,
    platform_name: str,
    candidates: list[tuple[str, dict[str, Any], float]],
    wiki_context: str,
    limit: int,
) -> list[str] | None:
    if not ai_available() or len(candidates) < limit:
        return None

    pool = candidates[:CANDIDATE_POOL]
    rows = []
    for game_id, game, score in pool:
        detail = game.get("details") or {}
        rows.append(
            {
                "id": game_id,
                "title": game.get("title"),
                "year": detail.get("year"),
                "score": round(score, 1),
            }
        )

    system = (
        "Eres curador de videojuegos retro para Region Atlas (España). "
        "Elige los títulos más representativos de un género en una plataforma. "
        "Devuelve JSON: {\"ids\": [\"id1\", \"id2\", ...]} usando SOLO ids del listado."
    )
    user = (
        f"Género: {genre_name}\nPlataforma: {platform_name}\n"
        f"Máximo: {limit} títulos, repartidos en distintas épocas si es posible.\n"
        f"Contexto web (no copiar):\n{wiki_context[:1200] or '(sin contexto)'}\n\n"
        f"Candidatos:\n{json.dumps(rows, ensure_ascii=False, indent=2)}"
    )
    try:
        raw = _openai_chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )
        parsed = json.loads(raw)
        ids = [str(item) for item in parsed.get("ids") or []]
        valid = {game_id for game_id, _, _ in pool}
        filtered = [game_id for game_id in ids if game_id in valid]
        if len(filtered) >= min(2, limit):
            return filtered[:limit]
    except (json.JSONDecodeError, KeyError, TypeError, OSError):
        return None
    return None


def build_platform_tops(
    *,
    genre_name: str,
    platform_slug: str,
    platform_name: str,
    games: list[dict[str, Any]],
    details_index: dict[str, dict[str, Any]],
    use_ai: bool,
) -> list[dict[str, Any]]:
    if len(games) < MIN_PLATFORM_GAMES:
        return []

    time.sleep(REQUEST_DELAY)
    wiki_context = fetch_wikipedia_context(genre_name, platform_slug)

    enriched: list[tuple[str, dict[str, Any], float]] = []
    for game in games:
        game_id = str(game["id"])
        detail = details_index.get(game_id)
        game_payload = {**game, "details": detail}
        score = score_candidate(game, detail, wiki_context)
        enriched.append((game_id, game_payload, score))

    enriched.sort(
        key=lambda item: (-item[2], str(item[1].get("title") or "")),
    )

    picked_ids = None
    if use_ai:
        picked_ids = pick_with_ai(
            genre_name,
            platform_name,
            enriched,
            wiki_context,
            TOP_GAMES_PER_PLATFORM,
        )
    if not picked_ids:
        picked_ids = pick_with_year_spread(enriched, TOP_GAMES_PER_PLATFORM)

    tops: list[dict[str, Any]] = []
    for game_id in picked_ids:
        game = next(item[1] for item in enriched if item[0] == game_id)
        detail = game.get("details") or {}
        tops.append(
            {
                "id": game_id,
                "year": detail.get("year"),
            }
        )
    return tops
