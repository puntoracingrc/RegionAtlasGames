#!/usr/bin/env python3
"""Post-proceso tras regenerar índices: validar enlaces, perfiles nuevos e tops de género."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_local_env  # noqa: E402
from collectors.game_details_lib import load_json, save_json  # noqa: E402
from enrich_company_profiles import enrich_pending_companies  # noqa: E402

load_local_env()

GENRES_FILE = ROOT / "data" / "index" / "genres.json"
GENRE_TOPS_FILE = ROOT / "data" / "genre-tops.json"
VALIDATE_SCRIPT = ROOT / "scripts" / "validate_entity_links.py"
BUILD_GENRE_TOPS_SCRIPT = ROOT / "scripts" / "build_genre_tops.py"


def merge_genre_game_counts(raw: dict) -> dict[str, int]:
    from genre_entity import resolve_canonical_genre

    buckets: dict[str, set[str]] = {}
    for entry in raw.values():
        canonical = resolve_canonical_genre(
            entry["slug"],
            entry.get("name"),
            museum_path=entry.get("museumPath"),
        )
        slug = canonical["slug"]
        bucket = buckets.setdefault(slug, set())
        bucket.update(entry.get("gameIds") or [])
    return {slug: len(ids) for slug, ids in buckets.items()}


def stale_genre_slugs() -> list[str]:
    raw_genres = load_json(GENRES_FILE, {})
    index_counts = merge_genre_game_counts(raw_genres)
    tops = load_json(GENRE_TOPS_FILE, {})
    stored = tops.get("genres") or {}

    stale: list[str] = []
    for slug, count in index_counts.items():
        if count < 6:
            continue
        prev = stored.get(slug) or {}
        if prev.get("gameCount") != count or not prev.get("platforms"):
            stale.append(slug)
    return sorted(stale)


def run_validate() -> bool:
    result = subprocess.run(
        [sys.executable, str(VALIDATE_SCRIPT)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        print(result.stdout.strip())
        return True
    print(result.stderr.strip() or result.stdout.strip(), file=sys.stderr)
    return False


def run_genre_tops(slugs: list[str], *, use_ai: bool) -> dict:
    if not slugs:
        return {"genres": 0, "slugs": []}
    report = {"genres": 0, "slugs": slugs}
    for slug in slugs:
        cmd = [sys.executable, str(BUILD_GENRE_TOPS_SCRIPT), "--slug", slug]
        if not use_ai:
            cmd.append("--no-ai")
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            print(result.stderr.strip() or result.stdout.strip(), file=sys.stderr)
            continue
        report["genres"] += 1
        line = result.stdout.strip().splitlines()[0] if result.stdout else slug
        print(line)
    return report


def run_sync(
    *,
    company_limit: int = 30,
    min_games: int = 1,
    use_ai: bool = True,
    validate: bool = True,
    genre_slugs: list[str] | None = None,
    skip_companies: bool = False,
    skip_genres: bool = False,
    dry_run: bool = False,
) -> dict:
    report: dict = {
        "validated": None,
        "companies": None,
        "genreTops": None,
    }

    if validate and not dry_run:
        report["validated"] = run_validate()
    elif validate:
        report["validated"] = True

    if not skip_companies:
        if dry_run:
            pending = enrich_pending_companies(
                limit=company_limit,
                min_games=min_games,
                use_ai=use_ai,
                dry_run=True,
            )
        else:
            pending = enrich_pending_companies(
                limit=company_limit,
                min_games=min_games,
                use_ai=use_ai,
                dry_run=False,
            )
        report["companies"] = pending

    if not skip_genres:
        slugs = genre_slugs if genre_slugs is not None else stale_genre_slugs()
        if dry_run:
            report["genreTops"] = {"genres": len(slugs), "slugs": slugs}
            print(f"[dry-run] genre tops: {len(slugs)} géneros pendientes")
        else:
            report["genreTops"] = run_genre_tops(slugs, use_ai=use_ai)
            tops = load_json(GENRE_TOPS_FILE, {})
            tops["syncedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            save_json(GENRE_TOPS_FILE, tops)

    print(json.dumps(report, ensure_ascii=False))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza derivados de entidades tras cambios en catálogo")
    parser.add_argument("--company-limit", type=int, default=30)
    parser.add_argument("--min-games", type=int, default=1, help="Mínimo de juegos para enriquecer compañía nueva")
    parser.add_argument("--no-ai", action="store_true")
    parser.add_argument("--skip-validate", action="store_true")
    parser.add_argument("--skip-companies", action="store_true")
    parser.add_argument("--skip-genres", action="store_true")
    parser.add_argument("--genre-slug", action="append", dest="genre_slugs", help="Regenerar tops de género")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    run_sync(
        company_limit=args.company_limit,
        min_games=args.min_games,
        use_ai=not args.no_ai,
        validate=not args.skip_validate,
        genre_slugs=args.genre_slugs,
        skip_companies=args.skip_companies,
        skip_genres=args.skip_genres,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
