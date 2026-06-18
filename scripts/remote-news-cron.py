#!/usr/bin/env python3
import json
import hashlib
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

QUERY = "videojuegos España when:1d"
SERPAPI_URL = "https://serpapi.com/search.json"
MAX_ITEMS = 9
TIMEOUT = 25
SECTION = "home"
TOPIC = "general"
MAX_AGE_DAYS = 3

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
    "switch", "steam", "pc gaming", "consola", "consolas", "gaming",
    "desarrolladora", "lanzamiento", "tráiler", "trailer", "game pass", "esports", "e-sports",
)

SOFT_TERMS = (
    "juego", "juegos", "indie", "trailer", "lanzamiento", "direct", "sony", "microsoft",
)

BANNED_TERMS = (
    "juegos olímpicos", "juegos olimpicos", "juegos universitarios", "juegos de azar",
    "casino", "casinos", "mundial", "fútbol", "futbol", "tenis", "roland garros",
    "eurosport", "quiniela", "apuestas", "lotería", "loteria",
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
        item.get("sourceName") or "",
    ]).lower()
    if any(term in haystack for term in BANNED_TERMS):
        return False
    if any(term in haystack for term in PREFERRED_TERMS):
        return True
    return sum(1 for term in SOFT_TERMS if term in haystack) >= 2


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


def parse_serpapi_date(raw):
    value = clean_text(raw)
    if not value:
        return None
    if value.endswith("Z"):
        candidate = value.replace("Z", "+00:00")
    else:
        candidate = value
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        pass
    for fmt in ("%m/%d/%Y, %I:%M %p, %z %Z", "%m/%d/%Y, %I:%M %p, %z", "%m/%d/%Y, %H:%M %p, %z %Z"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def is_fresh(raw):
    parsed = parse_serpapi_date(raw.get("iso_date") or raw.get("date") or raw.get("published_at"))
    if parsed is None:
        return True
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - parsed.astimezone(timezone.utc) <= timedelta_days(MAX_AGE_DAYS)


def timedelta_days(days):
    from datetime import timedelta
    return timedelta(days=days)


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


def stable_news_id(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def extract_items(payload):
    raw_items = payload.get("news_results") or []
    items = []
    seen = set()
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    for raw in raw_items:
        title = clean_text(raw.get("title"))
        link = normalize_url(raw.get("link"))
        if not title or not link or is_blocked(link):
            continue
        if not is_fresh(raw):
            continue
        key = (title.lower(), domain_from_url(link))
        if key in seen:
            continue
        source_raw = raw.get("source")
        source_name = clean_text(source_raw or domain_from_url(link))
        source_icon = ""
        if isinstance(source_raw, dict):
            source_icon = normalize_url(source_raw.get("icon") or "")
        item = {
            "id": stable_news_id(link),
            "section": SECTION,
            "topic": TOPIC,
            "title": title,
            "sourceName": source_name or "Fuente",
            "sourceIconUrl": source_icon or None,
            "url": link,
            "publishedAt": clean_text(raw.get("iso_date") or raw.get("date") or raw.get("published_at") or "") or None,
            "snippet": clean_text(raw.get("snippet")),
            "imageUrl": normalize_url(raw.get("thumbnail") or raw.get("thumbnail_url") or ""),
            "query": QUERY,
            "fetchedAt": fetched_at,
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
        "items": items,
    }
    atomic_write_json(OUTPUT_FILE, data)
    print(f"Wrote {len(items)} items to {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
