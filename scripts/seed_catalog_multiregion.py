#!/usr/bin/env python3
"""Pobla el catálogo desde PriceCharting en PAL, USA y Japón (multiregión)."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.pc_region_paths import (  # noqa: E402
    JP_PC_CONSOLE,
    NTSC_PC_CONSOLE,
    PAL_PC_CONSOLE,
    pc_region_label,
)

PLATFORMS_FILE = ROOT / "data" / "platforms.json"
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REQUEST_DELAY = 1.6

# Plataformas con catálogo PC en las tres regiones
MULTIREGION_PLATFORMS: dict[str, list[str]] = {
    "ps4": ["pal", "usa", "japan"],
}

REGION_CONFIG: dict[str, dict[str, str | None]] = {
    "pal": {
        "region": "PAL España",
        "museum_region": None,
        "id_suffix": None,
        "seed_source": "pricecharting-pal",
        "match_confidence": "SEED_PC",
        "console_map": "pal",
    },
    "usa": {
        "region": "USA",
        "museum_region": "usa",
        "id_suffix": "usa",
        "seed_source": "pricecharting-ntsc",
        "match_confidence": "SEED_PC_NTSC",
        "console_map": "ntsc",
    },
    "japan": {
        "region": "Japón",
        "museum_region": "japon",
        "id_suffix": "japon",
        "seed_source": "pricecharting-jp",
        "match_confidence": "SEED_PC_JP",
        "console_map": "jp",
    },
}

CONSOLE_MAPS = {
    "pal": PAL_PC_CONSOLE,
    "ntsc": NTSC_PC_CONSOLE,
    "jp": JP_PC_CONSOLE,
}


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


def parse_games(page_html: str, pc_path: str) -> list[tuple[str, str]]:
    pattern = rf'href="(/game/{re.escape(pc_path)}/[^"]+)"[^>]*>([^<]+)</a>'
    out: list[tuple[str, str]] = []
    for href, title in re.findall(pattern, page_html):
        clean = html.unescape(title.strip())
        if clean:
            out.append((href.strip(), clean))
    return out


def catalog_id(platform_slug: str, pc_slug: str, region_key: str) -> str:
    cfg = REGION_CONFIG[region_key]
    suffix = cfg["id_suffix"]
    if suffix:
        return f"{platform_slug}-{suffix}-{pc_slug}"
    return f"{platform_slug}-{pc_slug}"


def make_game(
    platform_slug: str,
    pc_href: str,
    title: str,
    region_key: str,
    pc_console: str,
) -> dict:
    cfg = REGION_CONFIG[region_key]
    pc_slug = pc_href.rsplit("/", 1)[-1]
    cat_id = catalog_id(platform_slug, pc_slug, region_key)
    bucket = "usa" if region_key == "usa" else "japan" if region_key == "japan" else "pal"
    game: dict = {
        "id": cat_id,
        "slug": pc_slug,
        "title": title,
        "titlePc": title,
        "platformSlug": platform_slug,
        "region": cfg["region"],
        "edition": "standard",
        "listingStatus": "listed",
        "coverUrl": None,
        "pcPath": pc_href,
        "pcId": None,
        "pcRegion": pc_region_label(bucket, pc_console),
        "pcCondition": None,
        "matchConfidence": cfg["match_confidence"],
        "marketMin": None,
        "marketMax": None,
        "recommendedPrice": None,
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": None,
        "updatedAt": None,
        "hasEsPrice": False,
        "seedSource": cfg["seed_source"],
    }
    if cfg["museum_region"]:
        game["museumRegion"] = cfg["museum_region"]
    return game


def scrape_console(platform_slug: str, pc_path: str, region_key: str) -> list[dict]:
    seen: set[str] = set()
    games: list[dict] = []
    cursor = 0
    batch = 0

    while batch < 120:
        page_html = (
            fetch_html(f"https://www.pricecharting.com/console/{pc_path}")
            if cursor == 0
            else post_console_page(pc_path, cursor)
        )
        if not page_html:
            break

        matches = parse_games(page_html, pc_path)
        if not matches:
            break

        new_count = 0
        for pc_href, title in matches:
            if pc_href in seen:
                continue
            seen.add(pc_href)
            games.append(make_game(platform_slug, pc_href, title, region_key, pc_path))
            new_count += 1

        print(
            f"  {platform_slug}/{region_key} cursor={cursor}: +{new_count} (total {len(games)})",
            flush=True,
        )
        if new_count == 0:
            break

        next_cursor_match = re.search(r'name="cursor" value="(\d+)"', page_html)
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


def merge_catalog(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], int, int]:
    by_id = {g["id"]: g for g in existing}
    by_pc_path = {g["pcPath"]: g for g in existing if g.get("pcPath")}
    added = 0
    updated = 0

    for game in incoming:
        pc_path = game.get("pcPath")
        if pc_path and pc_path in by_pc_path:
            cur = by_pc_path[pc_path]
            changed = False
            for key in ("titlePc", "pcRegion", "seedSource", "matchConfidence", "museumRegion"):
                if game.get(key) and cur.get(key) != game.get(key):
                    cur[key] = game[key]
                    changed = True
            if changed:
                updated += 1
            continue

        if game["id"] in by_id:
            cur = by_id[game["id"]]
            changed = False
            if not cur.get("pcPath") and game.get("pcPath"):
                cur["pcPath"] = game["pcPath"]
                changed = True
            if not cur.get("titlePc") and game.get("titlePc"):
                cur["titlePc"] = game["titlePc"]
                changed = True
            if game.get("museumRegion") and not cur.get("museumRegion"):
                cur["museumRegion"] = game["museumRegion"]
                changed = True
            if changed:
                updated += 1
            continue

        by_id[game["id"]] = game
        if pc_path:
            by_pc_path[pc_path] = game
        added += 1

    merged = sorted(by_id.values(), key=lambda g: (g["platformSlug"], g["title"].lower()))
    return merged, added, updated


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


def resolve_pc_path(platform_slug: str, region_key: str) -> str | None:
    cfg = REGION_CONFIG[region_key]
    console_map = CONSOLE_MAPS[str(cfg["console_map"])]
    return console_map.get(platform_slug)


def main(
    platforms_filter: list[str] | None = None,
    regions_filter: list[str] | None = None,
    dry_run: bool = False,
) -> None:
    existing = json.loads(CATALOG_FILE.read_text(encoding="utf-8")) if CATALOG_FILE.exists() else []
    targets = platforms_filter or list(MULTIREGION_PLATFORMS.keys())

    total_added = 0
    total_updated = 0

    for platform_slug in targets:
        region_keys = regions_filter or MULTIREGION_PLATFORMS.get(platform_slug, [])
        if not region_keys:
            print(f"Skip {platform_slug}: no configurada como multiregión")
            continue

        for region_key in region_keys:
            if region_key not in REGION_CONFIG:
                print(f"Skip región desconocida: {region_key}")
                continue
            pc_path = resolve_pc_path(platform_slug, region_key)
            if not pc_path:
                print(f"Skip {platform_slug}/{region_key}: sin ruta PC")
                continue

            print(f"Scraping {platform_slug} / {region_key} ({pc_path})...", flush=True)
            scraped = scrape_console(platform_slug, pc_path, region_key)
            existing, added, updated = merge_catalog(existing, scraped)
            total_added += added
            total_updated += updated
            print(f"  -> +{added} nuevos, ~{updated} actualizados", flush=True)

    if dry_run:
        print(f"\n[dry-run] Catálogo quedaría en {len(existing)} juegos (+{total_added} nuevos)")
        return

    CATALOG_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    update_meta(existing)
    print(
        f"\nCatálogo: {len(existing)} juegos (+{total_added} nuevos, ~{total_updated} actualizados)"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed multiregión desde PriceCharting")
    parser.add_argument("--platforms", help="Slugs separados por coma, ej: ps4")
    parser.add_argument(
        "--regions",
        help="Regiones separadas por coma: pal,usa,japan (default: todas las de la plataforma)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Scrapear sin escribir catalog.json")
    args = parser.parse_args()
    filt = [p.strip() for p in args.platforms.split(",")] if args.platforms else None
    region_filt = [r.strip() for r in args.regions.split(",")] if args.regions else None
    main(filt, region_filt, dry_run=args.dry_run)
