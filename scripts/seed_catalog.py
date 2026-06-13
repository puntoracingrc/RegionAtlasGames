#!/usr/bin/env python3
"""Pobla el catálogo maestro desde listados PAL de PriceCharting."""

from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT / "scripts"))

PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REQUEST_DELAY = 1.6

from collectors.pc_region_paths import PAL_PC_CONSOLE

PC_CONSOLE_PATHS: dict[str, str] = PAL_PC_CONSOLE


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text))
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "juego"


def fetch_html(url: str, attempt: int = 0) -> str:
    if attempt > 3:
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            time.sleep(10 + attempt * 5)
            return fetch_html(url, attempt + 1)
        return ""
    except Exception:
        return ""


def post_console_page(pc_path: str, cursor: int) -> str:
    url = f"https://www.pricecharting.com/console/{pc_path}"
    data = urllib.parse.urlencode(
        {
            "sort": "",
            "when": "none",
            "release-date": time.strftime("%Y-%m-%d"),
            "cursor": str(cursor),
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def parse_games(html: str, pc_path: str) -> list[tuple[str, str]]:
    pattern = rf'href="(/game/{re.escape(pc_path)}/[^"]+)"[^>]*>([^<]+)</a>'
    return [(href.strip(), title.strip()) for href, title in re.findall(pattern, html) if title.strip()]


def make_game(platform_slug: str, pc_href: str, title: str) -> dict:
    pc_slug = pc_href.rsplit("/", 1)[-1]
    cat_id = f"{platform_slug}-{pc_slug}"
    return {
        "id": cat_id,
        "slug": pc_slug,
        "title": title,
        "titlePc": title,
        "platformSlug": platform_slug,
        "region": "PAL España",
        "edition": "standard",
        "listingStatus": "listed",
        "coverUrl": None,
        "pcPath": pc_href,
        "pcId": None,
        "pcRegion": "PAL EU (referencia)",
        "pcCondition": None,
        "matchConfidence": "SEED_PC",
        "marketMin": None,
        "marketMax": None,
        "recommendedPrice": None,
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": None,
        "updatedAt": None,
        "hasEsPrice": False,
        "seedSource": "pricecharting-pal",
    }


def scrape_console(platform_slug: str, pc_path: str) -> list[dict]:
    seen: set[str] = set()
    games: list[dict] = []
    cursor = 0
    batch = 0

    while batch < 80:
        html = fetch_html(f"https://www.pricecharting.com/console/{pc_path}") if cursor == 0 else post_console_page(pc_path, cursor)
        if not html:
            break

        matches = parse_games(html, pc_path)
        if not matches:
            break

        new_count = 0
        for pc_href, title in matches:
            if pc_href in seen:
                continue
            seen.add(pc_href)
            games.append(make_game(platform_slug, pc_href, title))
            new_count += 1

        print(f"  {platform_slug} cursor={cursor}: +{new_count} (total {len(games)})")
        if new_count == 0:
            break

        next_cursor_match = re.search(r'name="cursor" value="(\d+)"', html)
        if not next_cursor_match:
            break
        next_cursor = int(next_cursor_match.group(1))
        if next_cursor <= cursor:
            cursor += 150
        else:
            cursor = next_cursor
        batch += 1
        time.sleep(REQUEST_DELAY)

    return games


def merge_catalog(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], int]:
    by_id = {g["id"]: g for g in existing}
    added = 0

    for game in incoming:
        if game["id"] in by_id:
            cur = by_id[game["id"]]
            if not cur.get("pcPath") and game.get("pcPath"):
                cur["pcPath"] = game["pcPath"]
            if not cur.get("titlePc") and game.get("titlePc"):
                cur["titlePc"] = game["titlePc"]
            continue
        by_id[game["id"]] = game
        added += 1

    merged = sorted(by_id.values(), key=lambda g: (g["platformSlug"], g["title"].lower()))
    return merged, added


def update_meta(catalog: list[dict]) -> None:
    platforms = json.loads(PLATFORMS_FILE.read_text(encoding="utf-8"))
    meta = json.loads(META_FILE.read_text(encoding="utf-8")) if META_FILE.exists() else {}

    listed_by_platform: dict[str, int] = {}
    for game in catalog:
        if game.get("listingStatus") == "excluded":
            continue
        slug = game["platformSlug"]
        listed_by_platform[slug] = listed_by_platform.get(slug, 0) + 1

    listed_count = sum(listed_by_platform.values())
    excluded_count = len(catalog) - listed_count

    meta.update(
        {
            "catalogListed": listed_count,
            "catalogExcluded": excluded_count,
            "catalogTotal": len(catalog),
            "catalogEstimatedTotal": sum(p["estimatedCatalogSize"] for p in platforms),
            "listedByPlatform": listed_by_platform,
            "lastSeedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    )
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main(platforms_filter: list[str] | None = None) -> None:
    existing = json.loads(CATALOG_FILE.read_text(encoding="utf-8")) if CATALOG_FILE.exists() else []
    targets = platforms_filter or list(PC_CONSOLE_PATHS.keys())

    total_added = 0
    for slug in targets:
        pc_path = PC_CONSOLE_PATHS.get(slug)
        if not pc_path:
            print(f"Skip {slug}: sin ruta PC")
            continue
        print(f"Scraping {slug} ({pc_path})...")
        scraped = scrape_console(slug, pc_path)
        existing, added = merge_catalog(existing, scraped)
        total_added += added
        print(f"  -> +{added} nuevos")

    CATALOG_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    update_meta(existing)
    print(f"\nCatálogo: {len(existing)} juegos (+{total_added} nuevos)")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--platforms", help="Slugs separados por coma, ej: ps1,ps2,nes")
    args = parser.parse_args()
    filt = [p.strip() for p in args.platforms.split(",")] if args.platforms else None
    main(filt)
