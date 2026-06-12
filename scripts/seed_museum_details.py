#!/usr/bin/env python3
"""Enriquece metadatos del catálogo desde fichas del Museo del Videojuego + índices cruzados."""

from __future__ import annotations

import argparse
import http.client
import socket
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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

FIELD_BLOCK_RE = re.compile(
    r'<div\s+class="field__label">([^<]+)</div>\s*(.*?)(?=<div\s+class="field__label">|\Z)',
    re.S | re.I,
)
LINK_RE = re.compile(r'href="(/[^"]+)"[^>]*>([^<]+)</a>', re.I)
SUPPORT_ALT_RE = re.compile(r'alt="Soporte:\s*([^"]+)"', re.I)


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


def slug_from_path(path: str) -> str:
    return path.strip("/").split("/")[-1]


def entity_from_link(path: str, name: str) -> dict:
    return {
        "name": name.strip(),
        "slug": slug_from_path(path),
        "museumPath": path,
    }


def plain_text(body: str) -> str:
    text = re.sub(r"<!--.*?-->", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_fields(html_doc: str) -> dict[str, str | list | dict | None]:
    section = html_doc
    main = re.search(
        r'class="group-second">(.*?)class="group-fourth">',
        html_doc,
        re.S | re.I,
    )
    if main:
        section = main.group(1)

    fields: dict[str, str | list | dict | None] = {}
    for label, body in FIELD_BLOCK_RE.findall(section):
        label = label.strip()
        links = LINK_RE.findall(body)
        if label == "Género" and links:
            fields[label] = [entity_from_link(p, n) for p, n in links]
        elif label in {"Desarrolla", "Publica", "Saga juego"} and links:
            fields[label] = entity_from_link(links[0][0], links[0][1])
        elif label == "Año" and links:
            href, text = links[0]
            year_match = re.search(r"/(\d{4})$", href)
            fields[label] = int(year_match.group(1)) if year_match else int(text) if text.isdigit() else None
        elif label == "Num. Jugadores" and links:
            fields[label] = int(links[0][1]) if links[0][1].isdigit() else None
        elif label == "Soporte":
            alt = SUPPORT_ALT_RE.search(body)
            fields[label] = alt.group(1).strip() if alt else plain_text(body) or None
        elif label == "Referencia":
            value = re.split(r"\s+<", plain_text(body))[0].strip()
            fields[label] = value if value else None
        elif label == "Lanzamiento":
            value = plain_text(body)
            fields[label] = value if value else None
        elif links:
            fields[label] = [entity_from_link(p, n) for p, n in links]

    return fields


def parse_details(html_doc: str, museum_path: str) -> dict:
    fields = parse_fields(html_doc)
    return {
        "year": fields.get("Año"),
        "releaseDate": fields.get("Lanzamiento"),
        "reference": fields.get("Referencia"),
        "players": fields.get("Num. Jugadores"),
        "support": fields.get("Soporte"),
        "developer": fields.get("Desarrolla"),
        "publisher": fields.get("Publica"),
        "genres": fields.get("Género") or [],
        "series": fields.get("Saga juego"),
        "museumPath": museum_path,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


def load_json(path: Path, default: dict | list) -> dict | list:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def build_indexes(details: dict[str, dict], catalog: list[dict]) -> dict:
    listed_ids = {
        g["id"]
        for g in catalog
        if g.get("listingStatus") != "excluded" and g["id"] in details
    }
    by_id = {g["id"]: g for g in catalog}

    companies: dict[str, dict] = {}
    genres: dict[str, dict] = {}
    series: dict[str, dict] = {}

    def bump_entity(
        bucket: dict[str, dict],
        entity: dict | None,
        game_id: str,
        role: str | None = None,
    ) -> None:
        if not entity:
            return
        slug = entity["slug"]
        entry = bucket.setdefault(
            slug,
            {
                "name": entity["name"],
                "slug": slug,
                "museumPath": entity["museumPath"],
                "gameIds": [],
                "byPlatform": {},
                **({"asDeveloper": [], "asPublisher": []} if role else {}),
            },
        )
        if game_id not in entry["gameIds"]:
            entry["gameIds"].append(game_id)
            platform = by_id[game_id]["platformSlug"]
            entry["byPlatform"][platform] = entry["byPlatform"].get(platform, 0) + 1
        if role == "developer" and game_id not in entry.get("asDeveloper", []):
            entry["asDeveloper"].append(game_id)
        if role == "publisher" and game_id not in entry["asPublisher"]:
            entry["asPublisher"].append(game_id)

    for game_id in listed_ids:
        detail = details[game_id]
        bump_entity(companies, detail.get("developer"), game_id, "developer")
        bump_entity(companies, detail.get("publisher"), game_id, "publisher")
        for genre in detail.get("genres") or []:
            bump_entity(genres, genre, game_id)
        bump_entity(series, detail.get("series"), game_id)

    for bucket in (companies, genres, series):
        for entry in bucket.values():
            entry["gameCount"] = len(entry["gameIds"])
            entry["byPlatform"] = dict(sorted(entry["byPlatform"].items()))

    return {
        "companies": dict(sorted(companies.items(), key=lambda x: (-x[1]["gameCount"], x[0]))),
        "genres": dict(sorted(genres.items(), key=lambda x: (-x[1]["gameCount"], x[0]))),
        "series": dict(sorted(series.items(), key=lambda x: (-x[1]["gameCount"], x[0]))),
        "stats": {
            "gamesWithDetails": len(listed_ids),
            "companies": len(companies),
            "genres": len(genres),
            "series": len(series),
        },
    }


def update_meta(index_stats: dict) -> None:
    if not META_FILE.exists():
        return
    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    meta["gamesWithDetails"] = index_stats.get("gamesWithDetails", 0)
    meta["indexCompanies"] = index_stats.get("companies", 0)
    meta["indexGenres"] = index_stats.get("genres", 0)
    meta["lastDetailsSeedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def is_valid_detail(entry: dict) -> bool:
    if not entry or "error" in entry:
        return False
    return bool(entry.get("developer") or entry.get("publisher") or entry.get("genres"))


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

        cached = cache.get(museum_path)
        existing = details.get(game_id)
        if existing and is_valid_detail(existing) and not args.force:
            report["cached"] += 1
            plat_stats["cached"] += 1
        elif cached and not args.force and is_valid_detail(cached):
            details[game_id] = {**cached, "museumPath": museum_path}
            report["cached"] += 1
            plat_stats["cached"] += 1
        elif cached and not args.force and cached.get("error") != "fetch-failed":
            details[game_id] = {**cached, "museumPath": museum_path}
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
                parsed = parse_details(html_doc, museum_path)
                if parsed.get("developer") or parsed.get("publisher") or parsed.get("genres"):
                    cache[museum_path] = parsed
                    details[game_id] = parsed
                    report["updated"] += 1
                    plat_stats["updated"] += 1
                else:
                    report["missing"] += 1
                    plat_stats["missing"] += 1
                    cache[museum_path] = parsed
            time.sleep(REQUEST_DELAY)

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
