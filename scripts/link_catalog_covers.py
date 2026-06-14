#!/usr/bin/env python3
"""Asigna coverUrl /covers/… cuando el JPG ya existe en disco (o en hosting)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, save_json  # noqa: E402
from collectors.covers_storage import (  # noqa: E402
    cover_filename_from_title,
    ensure_covers_root,
    is_local_cover_url,
    public_cover_url,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
REPORT_FILE = ROOT / "data/covers-report.json"


def local_jpg_names(root: Path, platform: str) -> set[str]:
    folder = root / platform
    if not folder.is_dir():
        return set()
    return {
        path.name
        for path in folder.glob("*.jpg")
        if path.is_file() and not path.name.startswith("._")
    }


def cdn_only_platforms(report: dict, covers_root: Path) -> set[str]:
    """Plataformas seedeadas sin JPG locales (solo hosting remoto)."""
    by_platform = report.get("byPlatform") or {}
    out: set[str] = set()
    for slug, stats in by_platform.items():
        if not isinstance(stats, dict) or int(stats.get("downloaded") or 0) <= 0:
            continue
        if not local_jpg_names(covers_root, slug):
            out.add(slug)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Enlaza portadas locales al catálogo")
    parser.add_argument("--platforms", help="Slugs separados por coma (default: todas)")
    parser.add_argument(
        "--trust-cdn-only",
        action="store_true",
        help="Asignar /covers/ sin JPG local solo en plataformas sin carpeta local (p. ej. NES en CDN)",
    )
    parser.add_argument(
        "--prune-missing",
        action="store_true",
        help="Quitar coverUrl si no hay JPG local ni plataforma solo-CDN",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    covers_root = ensure_covers_root()
    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    catalog = load_json(CATALOG_FILE, [])
    report = load_json(REPORT_FILE, {}) if REPORT_FILE.exists() else {}
    hosted = cdn_only_platforms(report, covers_root) if args.trust_cdn_only else set()
    local_index = {
        slug: local_jpg_names(covers_root, slug)
        for slug in {str(g.get("platformSlug") or "") for g in catalog}
        if slug
    }

    used: dict[str, set[str]] = {}
    for game in catalog:
        url = game.get("coverUrl")
        if is_local_cover_url(str(url or "")):
            used.setdefault(str(game.get("platformSlug") or ""), set()).add(Path(str(url)).name)

    linked = 0
    kept = 0
    cleared = 0
    skipped = 0
    by_platform: dict[str, int] = {}

    for game in catalog:
        platform = str(game.get("platformSlug") or "")
        if platform_filter and platform not in platform_filter:
            continue

        title = str(game.get("title") or "")
        if not title or not platform:
            continue

        filename = cover_filename_from_title(title, platform, used)
        if game.get("listingStatus") == "excluded":
            continue

        current = game.get("coverUrl")
        platform_files = local_index.get(platform, set())
        has_local = filename in platform_files
        target_url = public_cover_url(platform, filename)
        should_link = has_local or platform in hosted

        if should_link:
            if str(current or "") == target_url:
                kept += 1
            else:
                if not args.dry_run:
                    game["coverUrl"] = target_url
                linked += 1
                by_platform[platform] = by_platform.get(platform, 0) + 1
            continue

        if is_local_cover_url(str(current or "")) or current:
            if args.prune_missing:
                if not args.dry_run:
                    game["coverUrl"] = None
                cleared += 1
            else:
                kept += 1
            continue

        skipped += 1

    if not args.dry_run:
        save_json(CATALOG_FILE, catalog)
        if META_FILE.exists():
            meta = load_json(META_FILE, {})
            listed = [g for g in catalog if g.get("listingStatus") != "excluded"]
            with_cover = sum(1 for g in listed if g.get("coverUrl"))
            local = sum(
                1
                for g in listed
                if is_local_cover_url(str(g.get("coverUrl") or ""))
            )
            meta["catalogWithCover"] = with_cover
            meta["catalogWithLocalCover"] = local
            save_json(META_FILE, meta)

    print(f"Raíz portadas: {covers_root}")
    print(f"Enlazadas: {linked}")
    print(f"Ya OK: {kept}")
    print(f"Limpiadas (sin JPG): {cleared}")
    print(f"Sin archivo (omitidas): {skipped}")
    if args.trust_cdn_only:
        print(f"Plataformas solo CDN: {sorted(hosted)}")
    for slug in sorted(by_platform):
        print(f"  {slug}: {by_platform[slug]}")


if __name__ == "__main__":
    main()
