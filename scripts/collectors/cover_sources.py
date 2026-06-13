"""Fuentes de portadas: Museo → PriceCharting → Wikipedia."""

from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from collectors.game_description_ai import PLATFORM_WIKI_HINT, search_wikipedia_title

MUSEUM_BASE = "https://museodelvideojuego.com"
PC_BASE = "https://www.pricecharting.com"
USER_AGENT = "RegionAtlasGames/1.0 (cover seed)"
REQUEST_DELAY = 0.35

COLORBOX_THUMB_RE = re.compile(
    r'href="(https://museodelvideojuego\.com/files/thumbs/[^"]+)"',
    re.I,
)
STYLE_THUMB_RE = re.compile(
    r'/files/styles/[^"\']+/public/thumbs/([^"\']+)',
    re.I,
)
FULL_THUMB_RE = re.compile(
    r'https://museodelvideojuego\.com/files/thumbs/([^"\']+)',
    re.I,
)
PC_IMG_RE = re.compile(
    r"https://storage\.googleapis\.com/images\.pricecharting\.com/[^\"']+",
    re.I,
)


def fetch_html(url: str, attempt: int = 0) -> str:
    if attempt > 3:
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError):
        time.sleep(1 + attempt)
        return fetch_html(url, attempt + 1)


def fetch_json(url: str) -> dict[str, Any] | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def upscale_pc_thumb(url: str) -> str:
    return re.sub(r"/\d+\.(jpg|png|webp)$", r"/1600.\1", url, flags=re.I)


def parse_museum_cover(html_doc: str) -> str | None:
    block_match = re.search(
        r"field-thumb-juego.*?(?=<!-- THEME HOOK: 'field' -->.*?field--name-field-(?!field-thumb))",
        html_doc,
        re.S | re.I,
    )
    search_in = block_match.group(0) if block_match else html_doc

    colorbox = COLORBOX_THUMB_RE.search(search_in)
    if colorbox:
        raw = colorbox.group(1).strip()
        return raw if raw.startswith("http") else f"{MUSEUM_BASE}{raw}"

    full = FULL_THUMB_RE.search(search_in)
    if full:
        return f"{MUSEUM_BASE}/files/thumbs/{full.group(1)}"

    styled = STYLE_THUMB_RE.search(search_in)
    if styled:
        return f"{MUSEUM_BASE}/files/thumbs/{styled.group(1)}"

    return None


def fetch_museum_cover(museum_path: str, museum_cache: dict[str, Any]) -> str | None:
    cached = museum_cache.get(museum_path, {})
    if cached.get("coverUrl"):
        return cached["coverUrl"]

    page = fetch_html(f"{MUSEUM_BASE}{museum_path}")
    cover = parse_museum_cover(page) if page else None
    museum_cache[museum_path] = {
        "coverUrl": cover,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    time.sleep(REQUEST_DELAY)
    return cover


def fetch_pc_cover(pc_path: str, pc_map: dict[str, str]) -> str | None:
    if pc_path in pc_map:
        return pc_map[pc_path]

    page = fetch_html(f"{PC_BASE}{pc_path}")
    if not page:
        time.sleep(REQUEST_DELAY)
        return None

    imgs = PC_IMG_RE.findall(page)
    if not imgs:
        time.sleep(REQUEST_DELAY)
        return None

    url = upscale_pc_thumb(html.unescape(imgs[0]))
    pc_map[pc_path] = url
    time.sleep(REQUEST_DELAY)
    return url


def fetch_wikipedia_cover(title: str, platform_slug: str, wiki_cache: dict[str, Any]) -> str | None:
    cache_key = f"{platform_slug}::{title.lower()}"
    if cache_key in wiki_cache:
        return wiki_cache[cache_key].get("coverUrl")

    cover: str | None = None
    source_url: str | None = None

    for lang in ("es", "en"):
        page_title = search_wikipedia_title(title, platform_slug, lang=lang)
        if not page_title:
            continue
        params = urllib.parse.urlencode(
            {
                "action": "query",
                "prop": "pageimages",
                "piprop": "original|thumbnail",
                "pithumbsize": 800,
                "titles": page_title,
                "format": "json",
            }
        )
        data = fetch_json(f"https://{lang}.wikipedia.org/w/api.php?{params}")
        if not data:
            continue
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            original = page.get("original") or page.get("thumbnail")
            if isinstance(original, dict) and original.get("source"):
                cover = str(original["source"])
                source_url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(page_title.replace(' ', '_'))}"
                break
        if cover:
            break
        time.sleep(0.15)

    wiki_cache[cache_key] = {
        "coverUrl": cover,
        "sourceUrl": source_url,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    return cover


def resolve_cover_url(
    game: dict[str, Any],
    *,
    pc_map: dict[str, str],
    museum_cache: dict[str, Any],
    wiki_cache: dict[str, Any],
    allow_wikipedia: bool = True,
) -> tuple[str | None, str | None]:
    """Devuelve (url, source) con source en museum|pricecharting|wikipedia|existing."""

    existing = game.get("coverUrl")
    if existing and str(existing).startswith("http"):
        return str(existing), "existing"

    museum_path = game.get("museumPath")
    if museum_path:
        cover = fetch_museum_cover(museum_path, museum_cache)
        if cover:
            return cover, "museum"

    pc_path = game.get("pcPath")
    if pc_path:
        cover = fetch_pc_cover(pc_path, pc_map)
        if cover:
            return cover, "pricecharting"

    if allow_wikipedia:
        title = str(game.get("title") or "")
        platform = str(game.get("platformSlug") or "")
        cover = fetch_wikipedia_cover(title, platform, wiki_cache)
        if cover:
            return cover, "wikipedia"

    return None, None
