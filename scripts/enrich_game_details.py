#!/usr/bin/env python3
"""Enriquece game-details.json: Museo + PriceCharting + Wikidata (solo huecos)."""

from __future__ import annotations

import argparse
import http.client
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT / "scripts"))

from collectors.game_details_lib import (
    SOURCE_PC,
    SOURCE_WIKIDATA,
    build_indexes,
    coverage_stats,
    details_changed,
    is_valid_detail,
    load_json,
    merge_details,
    parse_pc_details,
    save_json,
    split_detail_sources,
)
from collectors.pc_region_paths import effective_pc_path_for_game
from collectors.wikidata_details import details_have_gaps, fetch_wikidata_details

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
PC_CACHE_FILE = ROOT / "data" / "pc" / "details-cache.json"
WIKIDATA_CACHE_FILE = ROOT / "data" / "wikidata" / "details-cache.json"
INDEX_DIR = ROOT / "data" / "index"
REPORT_FILE = ROOT / "data" / "game-details-enrich-report.json"

PC_BASE = "https://www.pricecharting.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REQUEST_DELAY = 0.35
WIKIDATA_DELAY = 0.3
SAVE_EVERY = 50


def fetch_html(url: str, attempt: int = 0) -> str:
    if attempt > 3:
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            time.sleep(10 + attempt * 5)
            return fetch_html(url, attempt + 1)
        return ""
    except (
        urllib.error.URLError,
        TimeoutError,
        socket.timeout,
        OSError,
        http.client.IncompleteRead,
    ):
        time.sleep(2 + attempt * 2)
        return fetch_html(url, attempt + 1)


def update_meta(index_stats: dict) -> None:
    if not META_FILE.exists():
        return
    meta = load_json(META_FILE, {})
    meta["gamesWithDetails"] = index_stats.get("gamesWithDetails", 0)
    meta["indexCompanies"] = index_stats.get("companies", 0)
    meta["indexGenres"] = index_stats.get("genres", 0)
    meta["lastDetailsEnrichAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    save_json(META_FILE, meta)


def needs_pc_fetch(game: dict, existing: dict | None, pc_cache: dict, force: bool) -> bool:
    if force:
        return True
    pc_path = effective_pc_path_for_game(game)
    if not pc_path:
        return False
    cached = pc_cache.get(pc_path)
    if cached and cached.get("error") != "fetch-failed" and is_valid_detail(cached):
        return False
    if existing and existing.get("sources", {}).get(SOURCE_PC) and is_valid_detail(existing):
        return False
    return True


def needs_wikidata_fetch(
    game: dict,
    partial: dict | None,
    wd_cache: dict,
    force: bool,
) -> bool:
    if force:
        return True
    if not details_have_gaps(partial):
        return False
    cache_key = game["id"]
    cached = wd_cache.get(cache_key)
    if cached and cached.get("error") != "fetch-failed" and is_valid_detail(cached):
        return False
    if partial and partial.get("sources", {}).get(SOURCE_WIKIDATA):
        return False
    return True


def sync_entity_derivatives_after_index(*, dry_run: bool = False) -> None:
    from sync_entity_derivatives import run_sync

    print("\n--- Sync entidades (validar · perfiles · tops) ---")
    run_sync(dry_run=dry_run)


def write_indexes(details: dict, catalog: list) -> dict:
    indexes = build_indexes(details, catalog)
    save_json(INDEX_DIR / "companies.json", indexes["companies"])
    save_json(INDEX_DIR / "genres.json", indexes["genres"])
    save_json(INDEX_DIR / "series.json", indexes["series"])
    update_meta(indexes["stats"])
    return indexes


def main() -> None:
    parser = argparse.ArgumentParser(description="Enriquece metadatos del catálogo (Museo + PC + Wikidata)")
    parser.add_argument("--platforms", help="Slugs separados por coma")
    parser.add_argument("--limit", type=int, help="Máximo de juegos a procesar")
    parser.add_argument("--force", action="store_true", help="Re-scrape aunque haya caché")
    parser.add_argument(
        "--merge-only",
        action="store_true",
        help="Solo re-fusionar detalles existentes (sin peticiones HTTP)",
    )
    parser.add_argument(
        "--wikidata-only",
        action="store_true",
        help="Solo enriquecer con Wikidata (sin PriceCharting)",
    )
    parser.add_argument("--no-wikidata", action="store_true", help="No consultar Wikidata")
    parser.add_argument("--no-pc", action="store_true", help="No consultar PriceCharting")
    parser.add_argument("--indexes-only", action="store_true", help="Solo regenerar índices")
    parser.add_argument(
        "--no-entity-sync",
        action="store_true",
        help="No ejecutar sync de perfiles/tops tras regenerar índices",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE, [])
    details: dict[str, dict] = load_json(DETAILS_FILE, {})
    pc_cache: dict[str, dict] = load_json(PC_CACHE_FILE, {})
    wd_cache: dict[str, dict] = load_json(WIKIDATA_CACHE_FILE, {})

    if args.indexes_only:
        indexes = write_indexes(details, catalog)
        print(f"Índices: {indexes['stats']}")
        if not args.no_entity_sync and not args.dry_run:
            sync_entity_derivatives_after_index()
        elif not args.no_entity_sync:
            sync_entity_derivatives_after_index(dry_run=True)
        return

    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and (not platform_filter or g["platformSlug"] in platform_filter)
    ]
    if args.wikidata_only:
        targets = [g for g in targets if details_have_gaps(details.get(g["id"]))]
    elif not args.no_pc:
        targets = [g for g in targets if g.get("pcPath") or details.get(g["id"])]

    if args.limit:
        targets = targets[: args.limit]

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "mode": "merge-only"
        if args.merge_only
        else ("wikidata-only" if args.wikidata_only else "fetch+merge"),
        "targets": len(targets),
        "pcFetched": 0,
        "pcCached": 0,
        "pcErrors": 0,
        "wikidataFetched": 0,
        "wikidataCached": 0,
        "wikidataSkipped": 0,
        "wikidataErrors": 0,
        "merged": 0,
        "unchanged": 0,
        "catalogPcIdUpdated": 0,
        "byPlatform": {},
    }

    print(f"Juegos a enriquecer: {len(targets)}")

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        platform = game["platformSlug"]
        pc_path = effective_pc_path_for_game(game)
        plat_stats = report["byPlatform"].setdefault(
            platform,
            {
                "pcFetched": 0,
                "pcCached": 0,
                "pcErrors": 0,
                "wikidataFetched": 0,
                "wikidataCached": 0,
                "wikidataSkipped": 0,
                "wikidataErrors": 0,
                "merged": 0,
                "unchanged": 0,
            },
        )

        existing = details.get(game_id)
        museum_part, pc_part, wd_part, ss_part = split_detail_sources(existing or {})

        if museum_part is None and existing and is_valid_detail(existing):
            museum_part = existing

        if not args.no_pc and not args.wikidata_only and pc_path:
            cached_pc = pc_cache.get(pc_path)
            if cached_pc and is_valid_detail(cached_pc) and cached_pc.get("error") != "fetch-failed":
                pc_part = cached_pc
                report["pcCached"] += 1
                plat_stats["pcCached"] += 1
            elif not args.merge_only and needs_pc_fetch(game, existing, pc_cache, args.force):
                html_doc = fetch_html(f"{PC_BASE}{pc_path}")
                if not html_doc:
                    report["pcErrors"] += 1
                    plat_stats["pcErrors"] += 1
                    pc_cache[pc_path] = {"error": "fetch-failed", "sources": {SOURCE_PC: {"pcPath": pc_path}}}
                else:
                    parsed_pc = parse_pc_details(html_doc, pc_path)
                    if is_valid_detail(parsed_pc):
                        pc_cache[pc_path] = parsed_pc
                        pc_part = parsed_pc
                        report["pcFetched"] += 1
                        plat_stats["pcFetched"] += 1
                    else:
                        pc_cache[pc_path] = parsed_pc
                        report["pcErrors"] += 1
                        plat_stats["pcErrors"] += 1
                time.sleep(REQUEST_DELAY)

        partial = merge_details(museum_part, pc_part, wd_part, None)

        if not args.no_wikidata:
            if not details_have_gaps(partial):
                report["wikidataSkipped"] += 1
                plat_stats["wikidataSkipped"] += 1
            else:
                cached_wd = wd_cache.get(game_id)
                if cached_wd and is_valid_detail(cached_wd) and cached_wd.get("error") != "fetch-failed":
                    wd_part = cached_wd
                    report["wikidataCached"] += 1
                    plat_stats["wikidataCached"] += 1
                elif not args.merge_only and needs_wikidata_fetch(game, partial, wd_cache, args.force):
                    try:
                        fetched_wd = fetch_wikidata_details(str(game.get("title") or ""), platform)
                        if fetched_wd:
                            wd_cache[game_id] = fetched_wd
                            wd_part = fetched_wd
                            report["wikidataFetched"] += 1
                            plat_stats["wikidataFetched"] += 1
                        else:
                            wd_cache[game_id] = {
                                "error": "not-found",
                                "sources": {SOURCE_WIKIDATA: {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}},
                            }
                            report["wikidataErrors"] += 1
                            plat_stats["wikidataErrors"] += 1
                    except Exception:
                        wd_cache[game_id] = {"error": "fetch-failed"}
                        report["wikidataErrors"] += 1
                        plat_stats["wikidataErrors"] += 1
                    time.sleep(WIKIDATA_DELAY)

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

        product_id = merged.get("pcProductId")
        if product_id and not game.get("pcId"):
            game["pcId"] = product_id
            report["catalogPcIdUpdated"] += 1

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_json(PC_CACHE_FILE, pc_cache)
                save_json(WIKIDATA_CACHE_FILE, wd_cache)
                save_json(DETAILS_FILE, details)
                save_json(CATALOG_FILE, catalog)
            print(
                f"  [{idx}/{len(targets)}] "
                f"pc={report['pcFetched']} wd={report['wikidataFetched']} "
                f"merged={report['merged']} wdSkip={report['wikidataSkipped']}"
            )

    if not args.dry_run:
        save_json(PC_CACHE_FILE, pc_cache)
        save_json(WIKIDATA_CACHE_FILE, wd_cache)
        save_json(DETAILS_FILE, details)
        save_json(CATALOG_FILE, catalog)
        indexes = write_indexes(details, catalog)
        report["indexes"] = indexes["stats"]
        report["coverage"] = coverage_stats(details, catalog)
        save_json(REPORT_FILE, report)
        if not args.no_entity_sync:
            sync_entity_derivatives_after_index()

    print(
        f"\nHecho: {report['merged']} fusionadas, "
        f"PC {report['pcFetched']} nuevas / {report['pcCached']} caché, "
        f"Wikidata {report['wikidataFetched']} nuevas / {report['wikidataCached']} caché "
        f"({report['wikidataSkipped']} sin huecos, {report['wikidataErrors']} errores)"
    )
    if not args.dry_run and "coverage" in report:
        cov = report["coverage"]
        print(
            f"Cobertura: {cov['withDetails']}/{cov['listedGames']} ({cov['coveragePct']}%)"
        )
        print(f"Roles: {cov['roles']}")
        print(f"Fuentes: {cov['sourceMix']}")
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
