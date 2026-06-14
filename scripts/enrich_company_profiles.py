#!/usr/bin/env python3
"""Enriquece data/company-profiles.json desde Wikidata/Wikipedia + IA."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_local_env  # noqa: E402

load_local_env()

from collectors.company_profile_enrich import build_company_profile  # noqa: E402
from collectors.game_details_lib import load_json, save_json  # noqa: E402

COMPANIES_FILE = ROOT / "data" / "index" / "companies.json"
ENTITIES_FILE = ROOT / "data" / "index" / "company-entities.json"
PROFILES_FILE = ROOT / "data" / "company-profiles.json"
OVERRIDES_FILE = ROOT / "data" / "company-wikidata-overrides.json"


def enrich_pending_companies(
    *,
    limit: int | None = None,
    offset: int = 0,
    min_games: int = 20,
    slug: str | None = None,
    force: bool = False,
    use_ai: bool = True,
    dry_run: bool = False,
) -> dict:
    companies = load_json(COMPANIES_FILE, {})
    entities = load_json(ENTITIES_FILE, {}).get("entities") or {}
    profiles: dict[str, dict] = load_json(PROFILES_FILE, {})
    overrides = load_json(OVERRIDES_FILE, {})

    rows = sorted(
        companies.values(),
        key=lambda item: (-int(item.get("gameCount") or 0), str(item.get("slug") or "")),
    )
    if slug:
        rows = [item for item in rows if item.get("slug") == slug]
    else:
        rows = [item for item in rows if int(item.get("gameCount") or 0) >= min_games]
        if not force:
            rows = [
                item
                for item in rows
                if not profiles.get(str(item.get("slug")), {}).get("history")
            ]
        if offset:
            rows = rows[offset:]
        if limit:
            rows = rows[:limit]

    report = {"targets": len(rows), "generated": 0, "skipped": 0, "errors": 0}

    for item in rows:
        item_slug = str(item["slug"])
        if profiles.get(item_slug, {}).get("history") and not force:
            report["skipped"] += 1
            continue
        entity = entities.get(item_slug) or {}
        top_platforms = sorted(
            (item.get("byPlatform") or {}).items(),
            key=lambda pair: -pair[1],
        )
        stats = {
            "gameCount": item.get("gameCount"),
            "developerCount": len(item.get("asDeveloper") or []),
            "publisherCount": len(item.get("asPublisher") or []),
            "topPlatforms": [name for name, _ in top_platforms[:6]],
            "alsoKnownAs": entity.get("aliasNames") or [],
        }
        wikidata_id = None
        ids = entity.get("wikidataIds") or []
        if ids:
            wikidata_id = str(ids[0])
        if item_slug in overrides:
            wikidata_id = str(overrides[item_slug])

        try:
            profile = build_company_profile(
                slug=item_slug,
                name=str(item.get("name") or item_slug),
                stats=stats,
                wikidata_id=wikidata_id,
                use_ai=use_ai,
            )
            if dry_run:
                print(f"[dry-run] {item_slug}: {profile.get('method')} · {profile.get('name')}")
            else:
                profiles[item_slug] = profile
            report["generated"] += 1
            print(f"{item_slug}: {profile.get('method')} · {profile.get('name')}")
        except Exception as exc:  # noqa: BLE001
            report["errors"] += 1
            print(f"{item_slug}: ERROR {exc}")
        time.sleep(0.1)

    if not dry_run:
        save_json(PROFILES_FILE, profiles)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Enriquece fichas de compañía")
    parser.add_argument("--limit", type=int, help="Máximo de compañías pendientes a procesar")
    parser.add_argument("--offset", type=int, default=0, help="Saltar N compañías pendientes")
    parser.add_argument("--min-games", type=int, default=20, help="Mínimo de juegos indexados")
    parser.add_argument("--slug", help="Solo una compañía (slug canónico)")
    parser.add_argument("--force", action="store_true", help="Regenera aunque exista perfil")
    parser.add_argument("--no-ai", action="store_true", help="Solo plantilla factual")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    report = enrich_pending_companies(
        limit=args.limit,
        offset=args.offset,
        min_games=args.min_games,
        slug=args.slug,
        force=args.force,
        use_ai=not args.no_ai,
        dry_run=args.dry_run,
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
