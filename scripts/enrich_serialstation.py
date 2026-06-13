#!/usr/bin/env python3
"""Enriquece game-details.json con metadatos PlayStation desde SerialStation API."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.game_details_lib import (  # noqa: E402
    SOURCE_SERIALSTATION,
    build_indexes,
    coverage_stats,
    details_changed,
    is_valid_detail,
    load_json,
    merge_details,
    save_json,
    split_detail_sources,
)
from collectors.serialstation_details import (  # noqa: E402
    PS_PLATFORMS,
    details_have_serialstation_gaps,
    fetch_serialstation_details,
    is_ps_platform,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
SS_CACHE_FILE = ROOT / "data" / "serialstation" / "details-cache.json"
INDEX_DIR = ROOT / "data" / "index"
REPORT_FILE = ROOT / "data" / "serialstation-enrich-report.json"

SAVE_EVERY = 40


def update_meta(index_stats: dict) -> None:
    if not META_FILE.exists():
        return
    meta = load_json(META_FILE, {})
    meta["gamesWithDetails"] = index_stats.get("gamesWithDetails", 0)
    meta["indexCompanies"] = index_stats.get("companies", 0)
    meta["indexGenres"] = index_stats.get("genres", 0)
    meta["lastSerialstationEnrichAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    save_json(META_FILE, meta)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enriquece metadatos PlayStation desde SerialStation (SLES/CUSA/… + título)"
    )
    parser.add_argument(
        "--platforms",
        help="Slugs PS separados por coma (default: ps1,ps2,ps3,ps4,psp,psvita)",
    )
    parser.add_argument("--limit", type=int, help="Máximo de juegos a procesar")
    parser.add_argument("--force", action="store_true", help="Re-consultar aunque haya caché")
    parser.add_argument(
        "--gaps-only",
        action="store_true",
        help="Solo juegos con huecos (referencia/dev/pub/saga) sin fuente SerialStation",
    )
    parser.add_argument(
        "--merge-only",
        action="store_true",
        help="Solo re-fusionar desde caché (sin peticiones HTTP)",
    )
    parser.add_argument("--indexes-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE, [])
    details: dict[str, dict] = load_json(DETAILS_FILE, {})
    ss_cache: dict[str, dict] = load_json(SS_CACHE_FILE, {})

    if args.indexes_only:
        indexes = build_indexes(details, catalog)
        save_json(INDEX_DIR / "companies.json", indexes["companies"])
        save_json(INDEX_DIR / "genres.json", indexes["genres"])
        save_json(INDEX_DIR / "series.json", indexes["series"])
        update_meta(indexes["stats"])
        print(f"Índices: {indexes['stats']}")
        return

    default_platforms = sorted(PS_PLATFORMS - {"ps5"})
    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()}
        if args.platforms
        else set(default_platforms)
    )

    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and is_ps_platform(str(g.get("platformSlug") or ""))
        and g["platformSlug"] in platform_filter
    ]
    if args.gaps_only:
        targets = [
            g
            for g in targets
            if details_have_serialstation_gaps(details.get(g["id"]))
        ]

    if args.limit:
        targets = targets[: args.limit]

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "platforms": sorted(platform_filter),
        "targets": len(targets),
        "fetched": 0,
        "cached": 0,
        "merged": 0,
        "unchanged": 0,
        "notFound": 0,
        "errors": 0,
        "byMatchMethod": {"reference": 0, "title": 0},
        "byPlatform": {},
    }

    print(f"SerialStation: {len(targets)} juegos PS ({', '.join(sorted(platform_filter))})")

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        platform = game["platformSlug"]
        plat_stats = report["byPlatform"].setdefault(
            platform,
            {"fetched": 0, "cached": 0, "merged": 0, "unchanged": 0, "notFound": 0, "errors": 0},
        )

        existing = details.get(game_id)
        museum_part, pc_part, wd_part, ss_part = split_detail_sources(existing or {})

        if museum_part is None and existing and is_valid_detail(existing):
            museum_part = existing

        cached = ss_cache.get(game_id)
        if cached and is_valid_detail(cached) and cached.get("error") != "fetch-failed" and not args.force:
            ss_part = cached
            report["cached"] += 1
            plat_stats["cached"] += 1
        elif not args.merge_only:
            try:
                fetched = fetch_serialstation_details(game, existing)
                if fetched:
                    ss_cache[game_id] = fetched
                    ss_part = fetched
                    report["fetched"] += 1
                    plat_stats["fetched"] += 1
                    method = fetched.get("sources", {}).get(SOURCE_SERIALSTATION, {}).get("matchMethod")
                    if method in report["byMatchMethod"]:
                        report["byMatchMethod"][method] += 1
                else:
                    ss_cache[game_id] = {
                        "error": "not-found",
                        "sources": {SOURCE_SERIALSTATION: {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}},
                    }
                    report["notFound"] += 1
                    plat_stats["notFound"] += 1
            except Exception:
                ss_cache[game_id] = {"error": "fetch-failed"}
                report["errors"] += 1
                plat_stats["errors"] += 1

        merged = merge_details(museum_part, pc_part, wd_part, ss_part)
        if not merged:
            report["unchanged"] += 1
            plat_stats["unchanged"] += 1
            continue

        if details_changed(existing, merged):
            if existing:
                merged["mergedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            details[game_id] = merged
            report["merged"] += 1
            plat_stats["merged"] += 1
        else:
            report["unchanged"] += 1
            plat_stats["unchanged"] += 1

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_json(SS_CACHE_FILE, ss_cache)
                save_json(DETAILS_FILE, details)
            print(
                f"  [{idx}/{len(targets)}] fetched={report['fetched']} "
                f"merged={report['merged']} notFound={report['notFound']}"
            )

    if not args.dry_run:
        save_json(SS_CACHE_FILE, ss_cache)
        save_json(DETAILS_FILE, details)
        indexes = build_indexes(details, catalog)
        save_json(INDEX_DIR / "companies.json", indexes["companies"])
        save_json(INDEX_DIR / "genres.json", indexes["genres"])
        save_json(INDEX_DIR / "series.json", indexes["series"])
        update_meta(indexes["stats"])
        report["indexes"] = indexes["stats"]
        report["coverage"] = coverage_stats(details, catalog)
        save_json(REPORT_FILE, report)

    print(
        f"\nHecho: {report['merged']} fusionadas, "
        f"{report['fetched']} nuevas / {report['cached']} caché, "
        f"{report['notFound']} sin match, {report['errors']} errores"
    )
    print(f"Match: {report['byMatchMethod']}")
    if not args.dry_run and "coverage" in report:
        cov = report["coverage"]
        print(f"Cobertura: {cov['withDetails']}/{cov['listedGames']} ({cov['coveragePct']}%)")
        print(f"Referencias: {cov['fields'].get('reference', {})}")
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
