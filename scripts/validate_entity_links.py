#!/usr/bin/env python3
"""Comprueba que dev/pub/géneros de game-details resuelven a fichas del índice unificado."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from company_entity import resolve_canonical_company
from genre_entity import resolve_canonical_genre

ROOT = Path(__file__).resolve().parents[1]
DETAILS_PATH = ROOT / "data" / "game-details.json"
COMPANIES_PATH = ROOT / "data" / "index" / "companies.json"
GENRES_PATH = ROOT / "data" / "index" / "genres.json"


def merge_index(raw: dict, resolve_fn) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for entry in raw.values():
        canonical = resolve_fn(entry["slug"], entry.get("name"), museum_path=entry.get("museumPath"))
        bucket = merged.setdefault(
            canonical["slug"],
            {"slug": canonical["slug"], "name": canonical["name"], "gameIds": set()},
        )
        bucket["gameIds"].update(entry.get("gameIds") or [])
    return merged


def main() -> int:
    details = json.loads(DETAILS_PATH.read_text(encoding="utf-8"))
    raw_companies = json.loads(COMPANIES_PATH.read_text(encoding="utf-8"))
    raw_genres = json.loads(GENRES_PATH.read_text(encoding="utf-8"))

    companies = merge_index(raw_companies, resolve_canonical_company)
    genres = merge_index(raw_genres, resolve_canonical_genre)

    missing_dev: list[str] = []
    missing_pub: list[str] = []
    missing_genre: list[str] = []
    orphan_games: list[str] = []

    for game_id, detail in details.items():
        if not detail or detail.get("error"):
            continue

        dev = detail.get("developer")
        if dev:
            canonical = resolve_canonical_company(
                dev["slug"],
                dev.get("name"),
                wikidata_id=dev.get("wikidataId"),
                museum_path=dev.get("museumPath"),
            )
            entry = companies.get(canonical["slug"])
            if not entry:
                missing_dev.append(f"{game_id}: {dev['slug']} -> {canonical['slug']}")
            elif game_id not in entry["gameIds"]:
                orphan_games.append(f"{game_id} dev {canonical['slug']} not in index")

        pub = detail.get("publisher")
        if pub:
            canonical = resolve_canonical_company(
                pub["slug"],
                pub.get("name"),
                wikidata_id=pub.get("wikidataId"),
                museum_path=pub.get("museumPath"),
            )
            entry = companies.get(canonical["slug"])
            if not entry:
                missing_pub.append(f"{game_id}: {pub['slug']} -> {canonical['slug']}")
            elif game_id not in entry["gameIds"]:
                orphan_games.append(f"{game_id} pub {canonical['slug']} not in index")

        for genre in detail.get("genres") or []:
            canonical = resolve_canonical_genre(
                genre["slug"],
                genre.get("name"),
                museum_path=genre.get("museumPath"),
            )
            entry = genres.get(canonical["slug"])
            if not entry:
                missing_genre.append(f"{game_id}: {genre['slug']} -> {canonical['slug']}")
            elif game_id not in entry["gameIds"]:
                orphan_games.append(f"{game_id} genre {canonical['slug']} not in index")

    errors = missing_dev + missing_pub + missing_genre + orphan_games
    if errors:
        print(f"Entity link validation failed ({len(errors)} issues):", file=sys.stderr)
        for line in errors[:40]:
            print(f"  {line}", file=sys.stderr)
        if len(errors) > 40:
            print(f"  … and {len(errors) - 40} more", file=sys.stderr)
        return 1

    print(
        f"OK: all developer/publisher/genre links resolve to merged index fichas "
        f"({len(companies)} companies, {len(genres)} genres)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
