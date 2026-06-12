#!/usr/bin/env python3
"""Enriquece coverUrl del catálogo desde las fichas del Museo del Videojuego."""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
CACHE_FILE = ROOT / "data" / "museum" / "covers-cache.json"
REPORT_FILE = ROOT / "data" / "museum-covers-report.json"

MUSEUM_BASE = "https://museodelvideojuego.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REQUEST_DELAY = 0.35
SAVE_EVERY = 40

COLORBOX_THUMB_RE = re.compile(
    r'href="(https://museodelvideojuego\.com/files/thumbs/[^"]+)"',
    re.I,
)
STYLE_THUMB_RE = re.compile(
    r'/files/styles/[^"\']+/public/thumbs/([^"\']+)',
    re.I,
)
FULL_THUMB_RE = re.compile(
    r'https://museodelvideojuego\.com/files/thumbs/([^"\']+)',
    re.I,
)


def fetch_html(url: str, attempt: int = 0) -> str:
    if attempt > 3:
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError):
        time.sleep(2 + attempt * 2)
        return fetch_html(url, attempt + 1)


def normalize_cover_url(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("/files/thumbs/"):
        return f"{MUSEUM_BASE}{raw}"
    return raw


def parse_cover(html_doc: str) -> str | None:
    block_match = re.search(
        r"field-thumb-juego.*?(?=<!-- THEME HOOK: 'field' -->.*?field--name-field-(?!field-thumb))",
        html_doc,
        re.S | re.I,
    )
    search_in = block_match.group(0) if block_match else html_doc

    colorbox = COLORBOX_THUMB_RE.search(search_in)
    if colorbox:
        return normalize_cover_url(colorbox.group(1))

    full = FULL_THUMB_RE.search(search_in)
    if full:
        return normalize_cover_url(f"https://museodelvideojuego.com/files/thumbs/{full.group(1)}")

    styled = STYLE_THUMB_RE.search(search_in)
    if styled:
        return normalize_cover_url(f"/files/thumbs/{styled.group(1)}")

    return None


def load_cache() -> dict:
    if not CACHE_FILE.exists():
        return {}
    return json.loads(CACHE_FILE.read_text(encoding="utf-8"))


def save_cache(cache: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def save_catalog(catalog: list[dict]) -> None:
    CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")


def update_meta(catalog: list[dict]) -> None:
    if not META_FILE.exists():
        return
    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    listed = [g for g in catalog if g.get("listingStatus") != "excluded"]
    with_cover = sum(1 for g in listed if g.get("coverUrl"))
    meta["coversListed"] = with_cover
    meta["coversListedPct"] = round(100 * with_cover / len(listed), 1) if listed else 0
    meta["lastCoversSeedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape portadas del Museo del Videojuego")
    parser.add_argument("--platforms", help="Slugs separados por coma (nes,snes,...)")
    parser.add_argument("--limit", type=int, help="Máximo de fichas a procesar")
    parser.add_argument("--force", action="store_true", help="Re-scrape aunque ya haya coverUrl")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    by_id = {g["id"]: g for g in catalog}
    cache = load_cache()

    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and g.get("museumPath")
        and (not platform_filter or g["platformSlug"] in platform_filter)
        and (args.force or not g.get("coverUrl"))
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
        "samplesMissing": [],
    }

    print(f"Portadas pendientes: {len(targets)}")

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        museum_path = game["museumPath"]
        platform = game["platformSlug"]
        plat_stats = report["byPlatform"].setdefault(
            platform, {"updated": 0, "cached": 0, "missing": 0, "errors": 0}
        )

        cache_key = museum_path
        cached = cache.get(cache_key)
        if cached and cached.get("coverUrl") and not args.force:
            by_id[game_id]["coverUrl"] = cached["coverUrl"]
            report["cached"] += 1
            plat_stats["cached"] += 1
        else:
            url = f"{MUSEUM_BASE}{museum_path}"
            html_doc = fetch_html(url)
            if not html_doc:
                report["errors"] += 1
                plat_stats["errors"] += 1
                cache[cache_key] = {"coverUrl": None, "error": "fetch-failed"}
            else:
                cover = parse_cover(html_doc)
                cache[cache_key] = {
                    "coverUrl": cover,
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                if cover:
                    by_id[game_id]["coverUrl"] = cover
                    report["updated"] += 1
                    plat_stats["updated"] += 1
                else:
                    report["missing"] += 1
                    plat_stats["missing"] += 1
                    if len(report["samplesMissing"]) < 15:
                        report["samplesMissing"].append(
                            {"id": game_id, "title": game["title"], "museumPath": museum_path}
                        )
            time.sleep(REQUEST_DELAY)

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_cache(cache)
                save_catalog(list(by_id.values()))
            print(
                f"  [{idx}/{len(targets)}] "
                f"ok={report['updated']} cache={report['cached']} "
                f"missing={report['missing']} err={report['errors']}"
            )

    if not args.dry_run:
        save_cache(cache)
        save_catalog(list(by_id.values()))
        update_meta(list(by_id.values()))
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"\nHecho: {report['updated']} nuevas, {report['cached']} desde caché, "
        f"{report['missing']} sin imagen, {report['errors']} errores"
    )
    if not args.dry_run:
        print(f"Catálogo: {CATALOG_FILE}")
        print(f"Caché: {CACHE_FILE}")
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
