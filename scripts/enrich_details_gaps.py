#!/usr/bin/env python3
"""Rellena huecos de metadatos priorizando Wikidata, SerialStation y PC sobre Museo.

Flujo recomendado (Museo ya no es fuente principal):
  1. Re-fusionar desde cachés (--remerge-only)
  2. Consultar Wikidata + SerialStation en huecos (--fetch-gaps)
  3. Regenerar índices

Uso:
  python3 scripts/enrich_details_gaps.py --remerge-only
  python3 scripts/enrich_details_gaps.py --fetch-gaps --platforms gameboy,nes
  python3 scripts/enrich_details_gaps.py --fetch-gaps --limit 100
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.game_details_lib import (  # noqa: E402
    SOURCE_SERIALSTATION,
    SOURCE_WIKIDATA,
    build_indexes,
    details_changed,
    is_valid_detail,
    load_json,
    merge_details,
    resolve_source_parts,
    save_json,
)
from collectors.pc_region_paths import effective_pc_path_for_game  # noqa: E402
from collectors.serialstation_details import (  # noqa: E402
    fetch_serialstation_details,
    is_ps_platform,
)
from collectors.wikidata_details import details_have_gaps, fetch_wikidata_details  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
META_FILE = ROOT / "data" / "meta.json"
MUSEUM_CACHE_FILE = ROOT / "data" / "museum" / "details-cache.json"
PC_CACHE_FILE = ROOT / "data" / "pc" / "details-cache.json"
WIKIDATA_CACHE_FILE = ROOT / "data" / "wikidata" / "details-cache.json"
SS_CACHE_FILE = ROOT / "data" / "serialstation" / "details-cache.json"
INDEX_DIR = ROOT / "data" / "index"
REPORT_FILE = ROOT / "data" / "details-gaps-report.json"

WIKIDATA_DELAY = 0.3
SS_DELAY = 0.35
SAVE_EVERY = 50


def update_meta(stats: dict) -> None:
    if not META_FILE.exists():
        return
    meta = load_json(META_FILE, {})
    meta["gamesWithDetails"] = stats.get("gamesWithDetails", 0)
    meta["indexCompanies"] = stats.get("companies", 0)
    meta["indexGenres"] = stats.get("genres", 0)
    meta["lastDetailsEnrichAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    save_json(META_FILE, meta)


def parse_platforms(raw: str | None) -> set[str] | None:
    if not raw:
        return None
    return {p.strip() for p in raw.split(",") if p.strip()}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Re-fusiona metadatos priorizando fuentes externas y rellena huecos"
    )
    parser.add_argument("--platforms", help="Slugs separados por coma")
    parser.add_argument("--limit", type=int, help="Máximo de juegos")
    parser.add_argument(
        "--remerge-only",
        action="store_true",
        help="Solo re-fusionar desde cachés (sin HTTP)",
    )
    parser.add_argument(
        "--fetch-gaps",
        action="store_true",
        help="Consultar Wikidata y SerialStation donde falten datos",
    )
    parser.add_argument("--force-fetch", action="store_true", help="Re-consultar APIs aunque haya caché")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.remerge_only and not args.fetch_gaps:
        args.remerge_only = True

    catalog = load_json(CATALOG_FILE, [])
    details: dict[str, dict] = load_json(DETAILS_FILE, {})
    museum_cache = load_json(MUSEUM_CACHE_FILE, {})
    pc_cache = load_json(PC_CACHE_FILE, {})
    wd_cache = load_json(WIKIDATA_CACHE_FILE, {})
    ss_cache = load_json(SS_CACHE_FILE, {})

    platform_filter = parse_platforms(args.platforms)
    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and (not platform_filter or g["platformSlug"] in platform_filter)
    ]
    if args.limit:
        targets = targets[: args.limit]

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "mode": "fetch-gaps" if args.fetch_gaps else "remerge-only",
        "targets": len(targets),
        "remerged": 0,
        "unchanged": 0,
        "wikidataFetched": 0,
        "serialstationFetched": 0,
        "stillGaps": 0,
    }

    print(
        f"Metadatos: {len(targets)} juegos · "
        f"modo={'fetch-gaps' if args.fetch_gaps else 'remerge-only'}"
    )

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        platform = str(game.get("platformSlug") or "")
        existing = details.get(game_id)
        pc_path = effective_pc_path_for_game(game)

        museum_part, pc_part, wd_part, ss_part = resolve_source_parts(
            game,
            existing,
            museum_cache=museum_cache,
            pc_cache=pc_cache,
            wd_cache=wd_cache,
            ss_cache=ss_cache,
            pc_path=pc_path,
        )

        if args.fetch_gaps:
            partial = merge_details(museum_part, pc_part, wd_part, ss_part)
            if details_have_gaps(partial):
                if is_ps_platform(platform):
                    cached_ss = ss_cache.get(game_id)
                    if args.force_fetch or not cached_ss or cached_ss.get("error"):
                        try:
                            fetched_ss = fetch_serialstation_details(game, existing)
                            if fetched_ss:
                                ss_cache[game_id] = fetched_ss
                                ss_part = fetched_ss
                                report["serialstationFetched"] += 1
                            else:
                                ss_cache[game_id] = {
                                    "error": "not-found",
                                    "sources": {SOURCE_SERIALSTATION: {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}},
                                }
                        except Exception:
                            ss_cache[game_id] = {"error": "fetch-failed"}
                        time.sleep(SS_DELAY)

                cached_wd = wd_cache.get(game_id)
                if args.force_fetch or not cached_wd or cached_wd.get("error"):
                    partial = merge_details(museum_part, pc_part, wd_part, ss_part)
                    if details_have_gaps(partial):
                        try:
                            fetched_wd = fetch_wikidata_details(str(game.get("title") or ""), platform)
                            if fetched_wd:
                                wd_cache[game_id] = fetched_wd
                                wd_part = fetched_wd
                                report["wikidataFetched"] += 1
                            else:
                                wd_cache[game_id] = {
                                    "error": "not-found",
                                    "sources": {SOURCE_WIKIDATA: {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}},
                                }
                        except Exception:
                            wd_cache[game_id] = {"error": "fetch-failed"}
                        time.sleep(WIKIDATA_DELAY)

        merged = merge_details(museum_part, pc_part, wd_part, ss_part)
        if not merged:
            report["unchanged"] += 1
            continue

        if details_have_gaps(merged):
            report["stillGaps"] += 1

        if details_changed(existing, merged):
            if not args.dry_run:
                if existing:
                    merged["mergedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                details[game_id] = merged
            report["remerged"] += 1
        else:
            report["unchanged"] += 1

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_json(DETAILS_FILE, details)
                save_json(WIKIDATA_CACHE_FILE, wd_cache)
                save_json(SS_CACHE_FILE, ss_cache)
            print(
                f"  [{idx}/{len(targets)}] remerged={report['remerged']} "
                f"wd={report['wikidataFetched']} ss={report['serialstationFetched']} "
                f"gaps={report['stillGaps']}"
            )

    if not args.dry_run:
        save_json(DETAILS_FILE, details)
        save_json(WIKIDATA_CACHE_FILE, wd_cache)
        save_json(SS_CACHE_FILE, ss_cache)
        indexes = build_indexes(details, catalog)
        save_json(INDEX_DIR / "companies.json", indexes["companies"])
        save_json(INDEX_DIR / "genres.json", indexes["genres"])
        save_json(INDEX_DIR / "series.json", indexes["series"])
        update_meta(indexes["stats"])
        save_json(REPORT_FILE, report)

    print(
        f"\nHecho: {report['remerged']} actualizados, {report['unchanged']} sin cambios, "
        f"{report['stillGaps']} con huecos, "
        f"Wikidata +{report['wikidataFetched']}, SerialStation +{report['serialstationFetched']}"
    )
    if not args.dry_run:
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
