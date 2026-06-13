#!/usr/bin/env python3
"""Enriquece metadatos del catálogo desde fichas del Museo del Videojuego + índices cruzados."""

from __future__ import annotations

import argparse
import http.client
import socket
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT / "scripts"))

from collectors.game_details_lib import (  # noqa: E402
    build_indexes,
    is_valid_detail,
    load_json,
    merge_details,
    parse_museum_details,
    save_json,
    split_detail_sources,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
CACHE_FILE = ROOT / "data" / "museum" / "details-cache.json"
INDEX_DIR = ROOT / "data" / "index"
REPORT_FILE = ROOT / "data" / "museum-details-report.json"

MUSEUM_BASE = "https://museodelvideojuego.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REQUEST_DELAY = 0.35
SAVE_EVERY = 40


def fetch_html(url: str, attempt: int = 0) -> str:
    if attempt > 3:
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
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
    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    meta["gamesWithDetails"] = index_stats.get("gamesWithDetails", 0)
    meta["indexCompanies"] = index_stats.get("companies", 0)
    meta["indexGenres"] = index_stats.get("genres", 0)
    meta["lastDetailsSeedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape metadatos del Museo del Videojuego")
    parser.add_argument("--platforms", help="Slugs separados por coma")
    parser.add_argument("--limit", type=int, help="Máximo de fichas a procesar")
    parser.add_argument("--force", action="store_true", help="Re-scrape aunque esté en caché")
    parser.add_argument("--indexes-only", action="store_true", help="Solo regenerar índices")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = load_json(CATALOG_FILE, [])
    details: dict[str, dict] = load_json(DETAILS_FILE, {})
    cache: dict[str, dict] = load_json(CACHE_FILE, {})

    if args.indexes_only:
        indexes = build_indexes(details, catalog)
        save_json(INDEX_DIR / "companies.json", indexes["companies"])
        save_json(INDEX_DIR / "genres.json", indexes["genres"])
        save_json(INDEX_DIR / "series.json", indexes["series"])
        update_meta(indexes["stats"])
        print(f"Índices: {indexes['stats']}")
        return

    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and g.get("museumPath")
        and (not platform_filter or g["platformSlug"] in platform_filter)
    ]
    if args.limit:
        targets = targets[: args.limit]

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "targets": len(targets),
        "updated": 0,
        "cached": 0,
        "missing": 0,
        "errors": 0,
        "byPlatform": {},
    }

    print(f"Fichas pendientes: {len(targets)}")

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        museum_path = game["museumPath"]
        platform = game["platformSlug"]
        plat_stats = report["byPlatform"].setdefault(
            platform, {"updated": 0, "cached": 0, "missing": 0, "errors": 0}
        )

        existing = details.get(game_id)
        _, pc_part, _, _ = split_detail_sources(existing) if existing else (None, None, None, None)
        cached = cache.get(museum_path)
        museum_part: dict | None = None

        if existing and is_valid_detail(existing) and not args.force:
            museum_part, _, _, _ = split_detail_sources(existing)
            if museum_part is None and existing.get("museumPath"):
                museum_part = existing
            report["cached"] += 1
            plat_stats["cached"] += 1
        elif cached and not args.force and is_valid_detail(cached):
            museum_part = cached
            report["cached"] += 1
            plat_stats["cached"] += 1
        elif cached and not args.force and cached.get("error") != "fetch-failed":
            museum_part = cached
            if cached.get("error"):
                report["errors"] += 1
                plat_stats["errors"] += 1
            else:
                report["missing"] += 1
                plat_stats["missing"] += 1
        else:
            html_doc = fetch_html(f"{MUSEUM_BASE}{museum_path}")
            if not html_doc:
                report["errors"] += 1
                plat_stats["errors"] += 1
                cache[museum_path] = {"error": "fetch-failed", "museumPath": museum_path}
            else:
                parsed = parse_museum_details(html_doc, museum_path)
                if is_valid_detail(parsed):
                    cache[museum_path] = parsed
                    museum_part = parsed
                    report["updated"] += 1
                    plat_stats["updated"] += 1
                else:
                    report["missing"] += 1
                    plat_stats["missing"] += 1
                    cache[museum_path] = parsed
            time.sleep(REQUEST_DELAY)

        if museum_part:
            merged = merge_details(museum_part, pc_part, None, None)
            if merged:
                details[game_id] = merged

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_json(CACHE_FILE, cache)
                save_json(DETAILS_FILE, details)
            print(
                f"  [{idx}/{len(targets)}] "
                f"ok={report['updated']} cache={report['cached']} "
                f"missing={report['missing']} err={report['errors']}"
            )

    if not args.dry_run:
        save_json(CACHE_FILE, cache)
        save_json(DETAILS_FILE, details)
        indexes = build_indexes(details, catalog)
        save_json(INDEX_DIR / "companies.json", indexes["companies"])
        save_json(INDEX_DIR / "genres.json", indexes["genres"])
        save_json(INDEX_DIR / "series.json", indexes["series"])
        update_meta(indexes["stats"])
        report["indexes"] = indexes["stats"]
        save_json(REPORT_FILE, report)

    print(
        f"\nHecho: {report['updated']} nuevas, {report['cached']} desde caché, "
        f"{report['missing']} sin datos, {report['errors']} errores"
    )
    if not args.dry_run and "indexes" in report:
        print(f"Índices: {report['indexes']}")
        print(f"Detalles: {DETAILS_FILE}")
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
