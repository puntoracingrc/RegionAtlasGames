#!/usr/bin/env python3
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
OUTPUT_FILE = Path("/kunden/homepages/43/d424401959/htdocs/MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/news/news-cache.json")

QUERY = "videojuegos España últimas 24 horas"
SERPAPI_URL = "https://serpapi.com/search.json"
MAX_ITEMS = 9
TIMEOUT = 25

BLOCKED_DOMAINS = {
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "x.com",
    "twitter.com",
    "facebook.com",
    "instagram.com",
}

PREFERRED_TERMS = (
    "videojuego", "videojuegos", "playstation", "ps5", "ps4", "xbox", "nintendo",
    "switch", "steam", "pc gaming", "consola", "consolas", "gaming", "juego", "juegos",
    "desarrolladora", "lanzamiento", "tráiler", "trailer", "game pass", "esports", "e-sports",
)


def load_env():
    values = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def normalize_url(url):
    if not url:
        return ""
    return url.strip()


def domain_from_url(url):
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return ""
    return host[4:] if host.startswith("www.") else host


def is_blocked(url):
    domain = domain_from_url(url)
    return any(domain == blocked or domain.endswith("." + blocked) for blocked in BLOCKED_DOMAINS)


def looks_relevant(item):
    haystack = " ".join([
        item.get("title") or "",
        item.get("snippet") or "",
        item.get("source") or "",
    ]).lower()
    return any(term in haystack for term in PREFERRED_TERMS)


def clean_text(value):
    if isinstance(value, dict):
        value = value.get("name") or value.get("title") or value.get("source") or ""
    elif isinstance(value, list):
        value = " ".join(str(part) for part in value if part)
    elif value is None:
        value = ""
    else:
        value = str(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:500]


def fetch_news(api_key):
    params = {
        "engine": "google_news",
        "q": QUERY,
        "gl": "es",
        "hl": "es",
        "num": "20",
        "api_key": api_key,
    }
    url = SERPAPI_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "RegionAtlasNewsCron/1.0"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_items(payload):
    raw_items = payload.get("news_results") or []
    items = []
    seen = set()
    for raw in raw_items:
        title = clean_text(raw.get("title"))
        link = normalize_url(raw.get("link"))
        if not title or not link or is_blocked(link):
            continue
        key = (title.lower(), domain_from_url(link))
        if key in seen:
            continue
        item = {
            "title": title,
            "url": link,
            "source": clean_text(raw.get("source") or domain_from_url(link)),
            "publishedAt": clean_text(raw.get("date") or raw.get("published_at") or ""),
            "snippet": clean_text(raw.get("snippet")),
            "imageUrl": normalize_url(raw.get("thumbnail") or raw.get("thumbnail_url") or ""),
        }
        if not looks_relevant(item):
            continue
        seen.add(key)
        items.append(item)
        if len(items) >= MAX_ITEMS:
            break
    return items


def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="news-cache-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(tmp_name, path)
        os.chmod(path, 0o644)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def main():
    env = load_env()
    api_key = env.get("SERPAPI_API_KEY") or os.environ.get("SERPAPI_API_KEY")
    if not api_key:
        print("SERPAPI_API_KEY missing", file=sys.stderr)
        return 2
    payload = fetch_news(api_key)
    items = extract_items(payload)
    if not items:
        print("No relevant news items found; cache not overwritten", file=sys.stderr)
        return 3
    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "query": QUERY,
        "scope": "home",
        "items": items,
    }
    atomic_write_json(OUTPUT_FILE, data)
    print(f"Wrote {len(items)} items to {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
