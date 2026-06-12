#!/usr/bin/env python3
"""Descarga portadas al proyecto: PriceCharting, Museo u URL remota existente.

Las imágenes se guardan en public/covers/{plataforma}/{titulo}.jpg
(sin referencias a PriceCharting en nombre ni metadatos).
"""

from __future__ import annotations

import argparse
import html
import http.client
import io
import json
import re
import socket
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
COVERS_DIR = ROOT / "public" / "covers"
PC_MAP_FILE = ROOT / "data" / "pc" / "cover-map.json"
MUSEUM_CACHE_FILE = ROOT / "data" / "museum" / "covers-cache.json"
REPORT_FILE = ROOT / "data" / "covers-report.json"

MUSEUM_BASE = "https://museodelvideojuego.com"
PC_BASE = "https://www.pricecharting.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REQUEST_DELAY = 0.35
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
TR_ROW_RE = re.compile(r'<tr[^>]*id="product-[^"]*"[^>]*>(.*?)</tr>', re.S | re.I)


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text))
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "juego"


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


def parse_museum_cover(html_doc: str) -> str | None:
    block_match = re.search(
        r"field-thumb-juego.*?(?=<!-- THEME HOOK: 'field' -->.*?field--name-field-(?!field-thumb))",
        html_doc,
        re.S | re.I,
    )
    search_in = block_match.group(0) if block_match else html_doc

    colorbox = COLORBOX_THUMB_RE.search(search_in)
    if colorbox:
        raw = colorbox.group(1).strip()
        return raw if raw.startswith("http") else f"{MUSEUM_BASE}{raw}"

    full = FULL_THUMB_RE.search(search_in)
    if full:
        return f"{MUSEUM_BASE}/files/thumbs/{full.group(1)}"

    styled = STYLE_THUMB_RE.search(search_in)
    if styled:
        return f"{MUSEUM_BASE}/files/thumbs/{styled.group(1)}"

    return None


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
    return bool(url and url.startswith("/covers/"))


def local_cover_path(platform: str, filename: str) -> Path:
    return COVERS_DIR / platform / filename


def public_cover_url(platform: str, filename: str) -> str:
    return f"/covers/{platform}/{filename}"


def pick_filename(title: str, platform: str, used: dict[str, set[str]]) -> str:
    base = slugify(title)
    names = used.setdefault(platform, set())
    candidate = f"{base}.jpg"
    if candidate not in names:
        names.add(candidate)
        return candidate
    n = 2
    while True:
        candidate = f"{base}-{n}.jpg"
        if candidate not in names:
            names.add(candidate)
            return candidate
        n += 1


def save_cover_image(raw: bytes, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif img.mode == "L":
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=88, optimize=True)
        dest.write_bytes(buf.getvalue())
        return True
    except Exception:
        if raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n":
            dest.write_bytes(raw)
            return True
        return False


def resolve_remote_url(game: dict, pc_map: dict[str, str], museum_cache: dict) -> str | None:
    existing = game.get("coverUrl")
    if existing and existing.startswith("http"):
        return existing

    museum_path = game.get("museumPath")
    if museum_path:
        cached = museum_cache.get(museum_path, {})
        if cached.get("coverUrl"):
            return cached["coverUrl"]
        page = fetch_html(f"{MUSEUM_BASE}{museum_path}")
        cover = parse_museum_cover(page) if page else None
        museum_cache[museum_path] = {
            "coverUrl": cover,
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        time.sleep(REQUEST_DELAY)
        return cover

    pc_path = game.get("pcPath")
    if pc_path:
        if pc_path in pc_map:
            return pc_map[pc_path]
        page = fetch_html(f"{PC_BASE}{pc_path}")
        if page:
            imgs = re.findall(
                r"https://storage\.googleapis\.com/images\.pricecharting\.com/[^\"']+",
                page,
            )
            if imgs:
                url = upscale_pc_thumb(imgs[0])
                pc_map[pc_path] = url
                return url
        time.sleep(REQUEST_DELAY)
        return None

    return None


def build_pc_maps(platforms: set[str], force: bool) -> dict[str, str]:
    pc_map: dict[str, str] = load_json(PC_MAP_FILE) if not force else {}
    needed_pc_paths = {
        PC_CONSOLE_PATHS[p]
        for p in platforms
        if p in PC_CONSOLE_PATHS
    }
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
    parser = argparse.ArgumentParser(description="Descarga portadas locales (PC + Museo)")
    parser.add_argument("--platforms", help="Slugs separados por coma")
    parser.add_argument("--limit", type=int, help="Máximo de juegos a procesar")
    parser.add_argument("--force", action="store_true", help="Re-descargar aunque ya haya /covers/")
    parser.add_argument("--skip-pc-map", action="store_true", help="No refrescar mapa PriceCharting")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    platform_filter = (
        {p.strip() for p in args.platforms.split(",") if p.strip()} if args.platforms else None
    )

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    by_id = {g["id"]: g for g in catalog}
    museum_cache = load_json(MUSEUM_CACHE_FILE)

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
            ).exists()
        )
    ]
    if args.limit:
        targets = targets[: args.limit]

    platforms_needed = {g["platformSlug"] for g in targets}
    pc_targets = [g for g in targets if g.get("pcPath") and not g.get("museumPath")]

    print(f"Juegos pendientes de portada local: {len(targets)}")
    pc_map = load_json(PC_MAP_FILE)
    if pc_targets and not args.skip_pc_map:
        pc_platforms = {g["platformSlug"] for g in pc_targets}
        print(f"Actualizando mapa PriceCharting ({len(pc_platforms)} plataformas)...")
        pc_map = build_pc_maps(pc_platforms, force=False)

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
            and local_cover_path(platform, Path(current).name).exists()
        ):
            report["skippedExisting"] += 1
            plat_stats["skippedExisting"] += 1
            continue

        remote = resolve_remote_url(game, pc_map, museum_cache)
        if not remote:
            report["missingSource"] += 1
            plat_stats["missingSource"] += 1
            continue

        filename = pick_filename(game["title"], platform, used_names)
        dest = local_cover_path(platform, filename)
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
                save_json(PC_MAP_FILE, pc_map)
                CATALOG_FILE.write_text(
                    json.dumps(list(by_id.values()), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            print(
                f"  [{idx}/{len(targets)}] ok={report['downloaded']} "
                f"missing={report['missingSource']} err={report['downloadErrors']}",
                flush=True,
            )

    if not args.dry_run:
        save_json(MUSEUM_CACHE_FILE, museum_cache)
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
    if not args.dry_run:
        print(f"Portadas: {COVERS_DIR}")
        print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
