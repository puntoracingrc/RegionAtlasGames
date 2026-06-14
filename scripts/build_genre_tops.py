#!/usr/bin/env python3
"""Genera data/genre-tops.json: referentes por género y plataforma."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_local_env  # noqa: E402
from collectors.game_details_lib import is_valid_detail, load_json, save_json  # noqa: E402
from collectors.genre_tops_builder import (  # noqa: E402
    MIN_PLATFORM_GAMES,
    TOP_PLATFORMS_PER_GENRE,
    build_platform_tops,
)
from genre_entity import resolve_canonical_genre  # noqa: E402

load_local_env()

CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
GENRES_FILE = ROOT / "data" / "index" / "genres.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
OUTPUT_FILE = ROOT / "data" / "genre-tops.json"


def merge_genre_index(raw: dict) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for entry in raw.values():
        canonical = resolve_canonical_genre(
            entry["slug"],
            entry.get("name"),
            museum_path=entry.get("museumPath"),
        )
        bucket = merged.setdefault(
            canonical["slug"],
            {
                "slug": canonical["slug"],
                "name": canonical["name"],
                "gameIds": set(),
                "byPlatform": {},
            },
        )
        for game_id in entry.get("gameIds") or []:
            bucket["gameIds"].add(game_id)
        for platform, count in (entry.get("byPlatform") or {}).items():
            bucket["byPlatform"][platform] = bucket["byPlatform"].get(platform, 0) + int(count)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera tops de referentes por género")
    parser.add_argument("--slug", help="Solo un género canónico")
    parser.add_argument("--no-ai", action="store_true", help="Solo heurística + Wikipedia")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE, [])
    details = load_json(DETAILS_FILE, {})
    raw_genres = load_json(GENRES_FILE, {})
    platforms = {
        str(item["slug"]): str(item.get("shortName") or item.get("name") or item["slug"])
        for item in load_json(PLATFORMS_FILE, [])
    }
    merged_genres = merge_genre_index(raw_genres)

    catalog_by_id = {
        str(item["id"]): item
        for item in catalog
        if item.get("listingStatus") != "excluded"
    }
    details_index = {
        game_id: detail
        for game_id, detail in details.items()
        if is_valid_detail(detail)
    }

    rows = sorted(
        merged_genres.values(),
        key=lambda item: (-len(item["gameIds"]), item["slug"]),
    )
    if args.slug:
        rows = [item for item in rows if item["slug"] == args.slug]

    output = load_json(OUTPUT_FILE, {})
    genres_out: dict[str, dict] = output.get("genres") or {}

    report = {"genres": 0, "platforms": 0, "entries": 0}

    for genre in rows:
        slug = genre["slug"]
        name = genre["name"]
        game_ids = [game_id for game_id in genre["gameIds"] if game_id in catalog_by_id]
        if len(game_ids) < MIN_PLATFORM_GAMES:
            continue

        platform_buckets: dict[str, list[dict]] = {}
        for game_id in game_ids:
            game = catalog_by_id[game_id]
            platform_buckets.setdefault(str(game["platformSlug"]), []).append(game)

        platform_rows = sorted(
            platform_buckets.items(),
            key=lambda pair: -len(pair[1]),
        )[:TOP_PLATFORMS_PER_GENRE]

        platform_tops: dict[str, list[dict]] = {}
        for platform_slug, platform_games in platform_rows:
            if len(platform_games) < MIN_PLATFORM_GAMES:
                continue
            platform_name = platforms.get(platform_slug, platform_slug)
            tops = build_platform_tops(
                genre_name=name,
                platform_slug=platform_slug,
                platform_name=platform_name,
                games=platform_games,
                details_index=details_index,
                use_ai=not args.no_ai,
            )
            if tops:
                platform_tops[platform_slug] = tops
                report["platforms"] += 1
                report["entries"] += len(tops)

        if platform_tops:
            genres_out[slug] = {
                "gameCount": len(game_ids),
                "platforms": platform_tops,
            }
            report["genres"] += 1
            print(f"{slug}: {len(platform_tops)} plataformas · {sum(len(v) for v in platform_tops.values())} referentes")

    payload = {
        "version": 1,
        "generatedAt": __import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "genres": genres_out,
    }

    if not args.dry_run:
        save_json(OUTPUT_FILE, payload)
        print(f"Guardado {OUTPUT_FILE.relative_to(ROOT)}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
