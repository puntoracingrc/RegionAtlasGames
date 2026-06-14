#!/usr/bin/env python3
"""Descarga portadas locales: Museo → PriceCharting → Wikipedia.

Archivos en disco externo (COVERS_ROOT / public/covers symlink):
  {plataforma}/{slug-del-titulo}.jpg

El nombre deriva solo del título del juego (nunca del id, slug de catálogo ni fuente).
Sin metadatos ni referencias a PriceCharting/Museo/Wikipedia en el archivo.
"""

from __future__ import annotations

import argparse
import html
import http.client
import json
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.cover_sources import resolve_cover_url  # noqa: E402
from collectors.covers_storage import (  # noqa: E402
    cover_filename_from_title,
    ensure_covers_root,
    is_local_cover_url,
    local_cover_path,
    public_cover_url,
    save_cover_jpeg,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
PC_MAP_FILE = ROOT / "data" / "pc" / "cover-map.json"
MUSEUM_CACHE_FILE = ROOT / "data" / "museum" / "covers-cache.json"
WIKI_CACHE_FILE = ROOT / "data" / "covers" / "wikipedia-cache.json"
REPORT_FILE = ROOT / "data" / "covers-report.json"

PC_BASE = "https://www.pricecharting.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
PC_LIST_DELAY = 1.2
SAVE_EVERY = 40

PC_CONSOLE_PATHS: dict[str, str] = {
    "nes": "pal-nes",
    "snes": "pal-super-nintendo",
    "n64": "pal-nintendo-64",
    "gameboy": "pal-gameboy",
    "gamecube": "pal-gamecube",
    "wii": "pal-wii",
    "ds": "pal-nintendo-ds",
    "3ds": "pal-nintendo-3ds",
    "megadrive": "pal-sega-mega-drive",
    "sega32x": "pal-mega-drive-32x",
    "megacd": "pal-sega-mega-cd",
    "mastersystem": "pal-sega-master-system",
    "saturn": "pal-sega-saturn",
    "dreamcast": "pal-sega-dreamcast",
    "gamegear": "pal-sega-game-gear",
    "neogeo": "neo-geo-aes",
    "neogeocd": "neo-geo-cd",
    "neogeopocket": "neo-geo-pocket-color",
    "ps1": "pal-playstation",
    "ps2": "pal-playstation-2",
    "ps3": "pal-playstation-3",
    "ps4": "pal-playstation-4",
}

TR_ROW_RE = re.compile(r'<tr[^>]*id="product-[^"]*"[^>]*>(.*?)</tr>', re.S | re.I)


def fetch_bytes(url: str, attempt: int = 0) -> bytes | None:
    if attempt > 3:
        return None
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except (
        urllib.error.URLError,
        TimeoutError,
        socket.timeout,
        urllib.error.HTTPError,
        http.client.IncompleteRead,
    ):
        time.sleep(2 + attempt * 2)
        return fetch_bytes(url, attempt + 1)


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
        http.client.IncompleteRead,
    ):
        time.sleep(2 + attempt * 2)
        return fetch_html(url, attempt + 1)


def post_console_page(pc_path: str, cursor: int) -> str:
    url = f"{PC_BASE}/console/{pc_path}"
    data = urllib.parse.urlencode(
        {
            "sort": "",
            "when": "none",
            "release-date": time.strftime("%Y-%m-%d"),
            "cursor": str(cursor),
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def upscale_pc_thumb(url: str) -> str:
    return re.sub(r"/\d+\.(jpg|png|webp)$", r"/1600.\1", url, flags=re.I)


def parse_console_covers(html_doc: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in TR_ROW_RE.findall(html_doc):
        href_m = re.search(r'href="(/game/[^"]+)"', row, re.I)
        img_m = re.search(
            r'src="(https://storage\.googleapis\.com/images\.pricecharting\.com/[^"]+)"',
            row,
            re.I,
        )
        if not href_m or not img_m:
            continue
        pc_href = html.unescape(href_m.group(1))
        out[pc_href] = upscale_pc_thumb(img_m.group(1))
    return out


def scrape_pc_map(pc_path: str) -> dict[str, str]:
    merged: dict[str, str] = {}
    cursor = 0
    batch = 0
    while batch < 120:
        page_html = (
            fetch_html(f"{PC_BASE}/console/{pc_path}")
            if cursor == 0
            else post_console_page(pc_path, cursor)
        )
        if not page_html:
            break
        chunk = parse_console_covers(page_html)
        if not chunk:
            break
        before = len(merged)
        merged.update(chunk)
        if len(merged) == before:
            break
        cursor += 150
        batch += 1
        time.sleep(PC_LIST_DELAY)
    return merged


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def is_local_cover(url: str | None) -> bool:
    return is_local_cover_url(url)


def pick_filename(title: str, platform: str, used: dict[str, set[str]]) -> str:
    return cover_filename_from_title(title, platform, used)


def save_cover_image(raw: bytes, dest: Path) -> bool:
    return save_cover_jpeg(raw, dest)


def needed_pc_console_paths(platforms: set[str], catalog: list[dict]) -> set[str]:
    paths = {PC_CONSOLE_PATHS[p] for p in platforms if p in PC_CONSOLE_PATHS}
    for game in catalog:
        if game.get("platformSlug") not in platforms:
            continue
        pc_path = str(game.get("pcPath") or "")
        if pc_path.startswith("/game/"):
            parts = pc_path.split("/")
            if len(parts) >= 3 and parts[2]:
                paths.add(parts[2])
    return paths


def build_pc_maps(platforms: set[str], force: bool, catalog: list[dict] | None = None) -> dict[str, str]:
    pc_map: dict[str, str] = load_json(PC_MAP_FILE) if not force else {}
    needed_pc_paths = needed_pc_console_paths(platforms, catalog or [])
    for pc_path in sorted(needed_pc_paths):
        existing = sum(1 for k in pc_map if k.startswith(f"/game/{pc_path}/"))
        print(f"  PriceCharting map {pc_path} ({existing} en caché)...", flush=True)
        fresh = scrape_pc_map(pc_path)
        pc_map.update(fresh)
        print(f"    +{len(fresh)} entradas (total mapa: {len(pc_map)})", flush=True)
        save_json(PC_MAP_FILE, pc_map)
    return pc_map


def update_meta(catalog: list[dict]) -> None:
    if not META_FILE.exists():
        return
    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    listed = [g for g in catalog if g.get("listingStatus") != "excluded"]
    with_cover = sum(1 for g in listed if g.get("coverUrl"))
    local = sum(1 for g in listed if is_local_cover(g.get("coverUrl")))
    meta["coversListed"] = with_cover
    meta["coversLocal"] = local
    meta["coversListedPct"] = round(100 * with_cover / len(listed), 1) if listed else 0
    meta["lastCoversSeedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Descarga portadas locales (Museo + PC + Wikipedia)")
    parser.add_argument("--platforms", help="Slugs separados por coma")
    parser.add_argument("--limit", type=int, help="Máximo de juegos a procesar")
    parser.add_argument("--force", action="store_true", help="Re-descargar aunque ya haya /covers/")
    parser.add_argument("--skip-pc-map", action="store_true", help="No refrescar mapa PriceCharting")
    parser.add_argument("--no-wikipedia", action="store_true", help="No usar Wikipedia como fallback")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    covers_root = ensure_covers_root(require_external_storage=True)
    print(f"Almacén portadas: {covers_root}")

    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    by_id = {g["id"]: g for g in catalog}
    museum_cache = load_json(MUSEUM_CACHE_FILE)
    wiki_cache = load_json(WIKI_CACHE_FILE)

    targets = [
        g
        for g in catalog
        if g.get("listingStatus") != "excluded"
        and (not platform_filter or g["platformSlug"] in platform_filter)
        and (
            args.force
            or not is_local_cover(g.get("coverUrl"))
            or not local_cover_path(
                g["platformSlug"],
                Path(g["coverUrl"]).name if g.get("coverUrl") else "",
                root=covers_root,
            ).exists()
        )
    ]
    if args.limit:
        targets = targets[: args.limit]

    print(f"Juegos pendientes de portada local: {len(targets)}")
    pc_map = load_json(PC_MAP_FILE)
    if not args.skip_pc_map:
        pc_platforms = {g["platformSlug"] for g in targets if g.get("pcPath")}
        if pc_platforms:
            print(f"Actualizando mapa PriceCharting ({len(pc_platforms)} plataformas)...")
            pc_map = build_pc_maps(pc_platforms, force=False, catalog=catalog)

    used_names: dict[str, set[str]] = {}
    for g in catalog:
        url = g.get("coverUrl")
        if is_local_cover(url):
            used_names.setdefault(g["platformSlug"], set()).add(Path(url).name)

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "targets": len(targets),
        "downloaded": 0,
        "skippedExisting": 0,
        "missingSource": 0,
        "downloadErrors": 0,
        "bySource": {"museum": 0, "pricecharting": 0, "wikipedia": 0, "existing": 0},
        "byPlatform": {},
    }

    for idx, game in enumerate(targets, start=1):
        game_id = game["id"]
        platform = game["platformSlug"]
        plat_stats = report["byPlatform"].setdefault(
            platform,
            {"downloaded": 0, "missingSource": 0, "downloadErrors": 0, "skippedExisting": 0},
        )

        current = game.get("coverUrl")
        if (
            not args.force
            and is_local_cover(current)
            and local_cover_path(platform, Path(current).name, root=covers_root).exists()
        ):
            report["skippedExisting"] += 1
            plat_stats["skippedExisting"] += 1
            continue

        remote, source = resolve_cover_url(
            game,
            pc_map=pc_map,
            museum_cache=museum_cache,
            wiki_cache=wiki_cache,
            allow_wikipedia=not args.no_wikipedia,
        )
        if not remote:
            report["missingSource"] += 1
            plat_stats["missingSource"] += 1
            continue

        if source:
            report["bySource"][source] = report["bySource"].get(source, 0) + 1

        filename = pick_filename(game["title"], platform, used_names)
        dest = local_cover_path(platform, filename, root=covers_root)
        if not args.dry_run:
            raw = fetch_bytes(remote)
            if not raw or not save_cover_image(raw, dest):
                report["downloadErrors"] += 1
                plat_stats["downloadErrors"] += 1
                continue
            public_url = public_cover_url(platform, filename)
            by_id[game_id]["coverUrl"] = public_url
            report["downloaded"] += 1
            plat_stats["downloaded"] += 1
        else:
            report["downloaded"] += 1
            plat_stats["downloaded"] += 1

        if idx % SAVE_EVERY == 0:
            if not args.dry_run:
                save_json(MUSEUM_CACHE_FILE, museum_cache)
                save_json(WIKI_CACHE_FILE, wiki_cache)
                save_json(PC_MAP_FILE, pc_map)
                CATALOG_FILE.write_text(
                    json.dumps(list(by_id.values()), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            print(
                f"  [{idx}/{len(targets)}] ok={report['downloaded']} "
                f"missing={report['missingSource']} err={report['downloadErrors']} "
                f"sources={report['bySource']}",
                flush=True,
            )

    if not args.dry_run:
        save_json(MUSEUM_CACHE_FILE, museum_cache)
        save_json(WIKI_CACHE_FILE, wiki_cache)
        save_json(PC_MAP_FILE, pc_map)
        final = list(by_id.values())
        CATALOG_FILE.write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")
        update_meta(final)
        save_json(REPORT_FILE, report)

    print(
        f"\nHecho: {report['downloaded']} descargadas, "
        f"{report['skippedExisting']} ya locales, "
        f"{report['missingSource']} sin origen, "
        f"{report['downloadErrors']} errores"
    )
    print(f"Por fuente: {report['bySource']}")
    if not args.dry_run:
        print(f"Portadas en disco: {covers_root}")
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
