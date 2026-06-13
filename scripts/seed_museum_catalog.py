#!/usr/bin/env python3
"""Pobla / cura catálogo desde listas del Museo del Videojuego (lista blanca)."""

from __future__ import annotations

import html
import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT / "scripts"))

from collectors.pc_region_paths import build_pc_path  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
MUSEUM_DIR = ROOT / "data" / "museum"
REPORT_FILE = ROOT / "data" / "museum-seed-report.json"

MUSEUM_BASE = "https://museodelvideojuego.com"
PAL_REGION_ID = "22"
TITLE_RE = re.compile(
    r'<h2>\s*<a href="(/juegos/[^"]+)"[^>]*>([^<]+)</a>\s*</h2>',
    re.I,
)

REGION_LABELS: dict[str, str] = {
    "usa": "USA",
    "japon": "Japón",
    "pal": "PAL Europa",
    "europa": "Europa",
    "espana": "España",
    "alemania": "Alemania",
    "francia": "Francia",
    "italia": "Italia",
    "reino-unido": "Reino Unido",
    "brasil": "Brasil",
    "portugues": "Portugués",
    "multiregion": "Multiregión",
    "australia": "Australia",
}

# Segmentos de ruta del museo que no son región
CONSOLE_PATH_SEGMENTS = {
    "juegos",
    "nes",
    "super-nintendo",
    "nintendo-64",
    "nintendo-game-boy",
    "sega-master-system",
    "sega-mega-drive-genesis",
    "sega-32x",
    "sega-mega-cd",
    "sega-saturn",
    "sega-dreamcast",
    "sega-game-gear",
    "neo-geo-aes",
    "neo-geo-cd",
    "neo-geo-pocket-pocket-color",
}

MULTI_REGION_DEFAULTS = {
    "region_filter": "All",
    "multi_region": True,
    "catalog_scope": "multi-region",
}

# slug interno -> config museo + PriceCharting
MUSEUM_PLATFORMS: dict[str, dict] = {
    "nes": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-nes",
        "pc_console": "pal-nes",
        "estimated": 2166,
    },
    "snes": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-super-nintendo",
        "pc_console": "pal-super-nintendo",
        "estimated": 2761,
    },
    "n64": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-nintendo-64",
        "pc_console": "pal-nintendo-64",
        "estimated": 776,
    },
    "gameboy": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-game-boy",
        "pc_console": "pal-gameboy",
        "estimated": 1788,
    },
    "mastersystem": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-master-system",
        "pc_console": "pal-sega-master-system",
        "estimated": 500,
    },
    "megadrive": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-megadrive-genesis",
        "pc_console": "pal-sega-mega-drive",
        "estimated": 1679,
    },
    "sega32x": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-32x",
        "pc_console": "pal-mega-drive-32x",
        "estimated": 82,
    },
    "megacd": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-sega-mega-cd",
        "pc_console": "pal-sega-mega-cd",
        "estimated": 372,
    },
    "saturn": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-sega-saturn",
        "pc_console": "pal-sega-saturn",
        "estimated": 1597,
    },
    "dreamcast": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-sega-dreamcast",
        "pc_console": "pal-sega-dreamcast",
        "estimated": 950,
    },
    "gamegear": {
        **MULTI_REGION_DEFAULTS,
        "list_path": "lista-completa-de-juegos-de-game-gear",
        "pc_console": "pal-sega-game-gear",
        "estimated": 637,
    },
    "neogeo": {
        "list_path": "lista-completa-de-juegos-de-neo-geo-aes",
        "pc_console": "neo-geo-aes",
        "estimated": 212,
        "region_filter": "All",
        "multi_region": True,
        "catalog_scope": "multi-region-aes",
    },
    "neogeocd": {
        "list_path": "lista-completa-de-juegos-de-neo-geo-cd",
        "pc_console": "neo-geo-cd",
        "estimated": 161,
        "region_filter": "All",
        "multi_region": True,
        "catalog_scope": "multi-region-cd",
    },
    "neogeopocket": {
        "list_path": "lista-completa-de-juegos-de-neo-geo-pocket-color",
        "pc_console": "neo-geo-pocket-color",
        "estimated": 165,
        "region_filter": "All",
        "multi_region": True,
        "catalog_scope": "multi-region-ngpc",
    },
}

STOPWORDS = {"the", "a", "an", "of", "and", "for", "in", "on", "at", "to", "disneys", "mtvs"}


def museum_seed_kind(pc_console: str) -> str:
    if "neo-geo-pocket" in pc_console:
        return "ngpc"
    if "neo-geo-cd" in pc_console:
        return "cd"
    if "neo-geo-aes" in pc_console:
        return "aes"
    return "pal"


def museum_match_confidence(pc_console: str, multi_region: bool) -> str:
    kind = museum_seed_kind(pc_console)
    if kind == "ngpc":
        return "MUSEUM_NGPC"
    if kind == "cd":
        return "MUSEUM_CD"
    if kind == "aes":
        return "MUSEUM_AES"
    if multi_region:
        return "MUSEUM_MULTI"
    return "MUSEUM_PAL"


def decode_title(title: str) -> str:
    t = html.unescape(title)
    t = re.sub(r"&#\d+;", "", t)
    return t.strip()


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", decode_title(text))
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "juego"


def norm_title(title: str) -> str:
    t = decode_title(title).lower()
    t = re.sub(r"\[[^\]]+\]", "", t)
    t = t.replace("&", " and ")
    t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if t.endswith(", the"):
        t = "the " + t[:-5]
    t = re.sub(r"^the ", "", t)
    return t


def tokens(title: str) -> set[str]:
    return {w for w in norm_title(title).split() if w not in STOPWORDS and len(w) > 1}


def token_similarity(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def fetch_html(url: str, attempt: int = 0) -> str:
    if attempt > 3:
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError):
        time.sleep(2 + attempt * 2)
        return fetch_html(url, attempt + 1)


def parse_museum_path(path: str) -> tuple[str | None, str]:
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) < 2:
        return None, parts[-1] if parts else "juego"
    slug = parts[-1]
    # /juegos/neo-geo-aes/usa/slug -> region penúltimo segmento
    region = parts[-2] if len(parts) >= 3 else None
    if region in CONSOLE_PATH_SEGMENTS:
        region = None
    return region, slug


def region_label(region_code: str | None) -> str:
    if not region_code:
        return "PAL Europa"
    return REGION_LABELS.get(region_code.lower(), region_code.replace("-", " ").title())


def scrape_museum_platform(list_path: str, region_filter: str = PAL_REGION_ID) -> list[dict]:
    games: list[dict] = []
    for page in range(0, 60):
        url = (
            f"{MUSEUM_BASE}/{list_path}"
            f"?field_region_target_id={region_filter}&page={page}"
        )
        html_doc = fetch_html(url)
        if not html_doc:
            break
        matches = TITLE_RE.findall(html_doc)
        if not matches:
            break
        for path, title in matches:
            title = decode_title(title.strip())
            museum_region, slug = parse_museum_path(path)
            entry: dict = {
                "title": title,
                "museumPath": path,
                "museumSlug": slug,
            }
            if museum_region:
                entry["museumRegion"] = museum_region
            games.append(entry)
        time.sleep(0.35)
    return games


def match_score(museum: dict, game: dict) -> float:
    mt, gt = museum["title"], game["title"]
    mn, gn = norm_title(mt), norm_title(gt)
    if mn == gn:
        return 100.0
    if museum["museumSlug"] == game.get("slug"):
        return 95.0
    if mn in gn or gn in mn:
        return 88.0
    sim = token_similarity(mt, gt)
    if sim >= 0.92:
        return 80.0 + sim * 10
    if sim >= 0.78:
        return 70.0 + sim * 10
    return 0.0


def find_best_match(
    museum: dict,
    candidates: list[dict],
    used: set[str],
    *,
    multi_region: bool = False,
) -> dict | None:
    if multi_region:
        region = museum.get("museumRegion")
        slug = museum.get("museumSlug")
        for game in candidates:
            if game["id"] in used:
                continue
            if game.get("slug") == slug and game.get("museumRegion") == region:
                return game
        for game in candidates:
            if game["id"] in used:
                continue
            if game.get("slug") == slug and not game.get("museumRegion"):
                return game

    best: dict | None = None
    best_score = 0.0
    for game in candidates:
        if game["id"] in used:
            continue
        score = match_score(museum, game)
        if score > best_score:
            best_score = score
            best = game
    if best_score >= 70.0:
        return best
    return None


def catalog_id_for_museum(platform_slug: str, museum: dict, *, multi_region: bool = False) -> str:
    if multi_region and museum.get("museumRegion"):
        return f"{platform_slug}-{museum['museumRegion']}-{museum['museumSlug']}"
    return f"{platform_slug}-{museum['museumSlug']}"


def make_game_from_museum(
    platform_slug: str,
    museum: dict,
    pc_console: str,
    *,
    multi_region: bool = False,
    seed_source: str = "museum-pal",
) -> dict:
    slug = museum["museumSlug"]
    cat_id = catalog_id_for_museum(platform_slug, museum, multi_region=multi_region)
    museum_region = museum.get("museumRegion")
    region = region_label(museum_region)
    pc_path, pc_region = build_pc_path(
        {
            "platformSlug": platform_slug,
            "slug": slug,
            "museumSlug": slug,
            "museumRegion": museum_region,
            "region": region,
        }
    )
    if not pc_path:
        pc_path = f"/game/{pc_console}/{slug}"
        if "neo-geo-pocket" in pc_console:
            pc_region = "Referencia global (NGPC)"
        elif "neo-geo-cd" in pc_console:
            pc_region = "Referencia global (CD)"
        elif "neo-geo-aes" in pc_console:
            pc_region = "Referencia global (AES)"
        elif multi_region:
            pc_region = "Referencia global (multiregión)"
        else:
            pc_region = "PAL EU (referencia)"
    return {
        "id": cat_id,
        "slug": slug,
        "title": museum["title"],
        "titlePc": museum["title"],
        "platformSlug": platform_slug,
        "region": region,
        "edition": "standard",
        "listingStatus": "listed",
        "coverUrl": None,
        "pcPath": pc_path,
        "pcId": None,
        "pcRegion": pc_region,
        "pcCondition": None,
        "matchConfidence": museum_match_confidence(pc_console, multi_region),
        "museumPath": museum["museumPath"],
        "museumSlug": museum["museumSlug"],
        "museumRegion": museum_region,
        "marketMin": None,
        "marketMax": None,
        "recommendedPrice": None,
        "pcRefPrice": None,
        "deltaEsVsPc": None,
        "priceSource": None,
        "updatedAt": None,
        "hasEsPrice": False,
        "seedSource": seed_source,
    }


def apply_museum_whitelist(
    catalog: list[dict],
    platform_slug: str,
    museum_games: list[dict],
    pc_console: str,
    *,
    multi_region: bool = False,
    exclude_reason: str = "not-in-museum-pal",
) -> dict:
    by_id = {g["id"]: g for g in catalog}
    platform_games = [g for g in catalog if g["platformSlug"] == platform_slug]
    used_ids: set[str] = set()
    matched = 0
    created = 0
    unmatched_museum: list[str] = []
    allowed_slugs = {m["museumSlug"] for m in museum_games}

    for museum in museum_games:
        hit = find_best_match(
            museum, platform_games, used_ids, multi_region=multi_region
        )
        if hit:
            used_ids.add(hit["id"])
            hit["listingStatus"] = "listed"
            hit.pop("excludeCategory", None)
            hit.pop("excludeReason", None)
            hit["museumPath"] = museum["museumPath"]
            hit["museumSlug"] = museum["museumSlug"]
            if museum.get("museumRegion"):
                hit["museumRegion"] = museum["museumRegion"]
                hit["region"] = region_label(museum["museumRegion"])
            hit["matchConfidence"] = hit.get("matchConfidence") or museum_match_confidence(
                pc_console, multi_region
            )
            if not hit.get("seedSource"):
                hit["seedSource"] = f"museum-{museum_seed_kind(pc_console)}"
            pc_path, pc_region = build_pc_path(hit)
            if pc_path:
                hit["pcPath"] = pc_path
                hit["pcRegion"] = pc_region
            elif not hit.get("pcPath"):
                hit["pcPath"] = f"/game/{pc_console}/{museum['museumSlug']}"
            matched += 1
        else:
            game = make_game_from_museum(
                platform_slug,
                museum,
                pc_console,
                multi_region=multi_region,
                seed_source=f"museum-{museum_seed_kind(pc_console)}",
            )
            by_id[game["id"]] = game
            platform_games.append(game)
            used_ids.add(game["id"])
            created += 1
            unmatched_museum.append(museum["title"])

    excluded = 0
    for game in platform_games:
        if game["id"] in used_ids:
            continue
        game["listingStatus"] = "excluded"
        game["excludeCategory"] = "whitelist"
        game["excludeReason"] = exclude_reason
        excluded += 1

    merged = sorted(by_id.values(), key=lambda g: (g["platformSlug"], g["title"].lower()))
    region_counts: dict[str, int] = {}
    if multi_region:
        for museum in museum_games:
            code = museum.get("museumRegion") or "unknown"
            region_counts[code] = region_counts.get(code, 0) + 1

    return {
        "catalog": merged,
        "museumCount": len(museum_games),
        "matched": matched,
        "created": created,
        "excluded": excluded,
        "listed": matched + created,
        "uniqueSlugs": len(allowed_slugs),
        "byMuseumRegion": region_counts,
        "unmatchedMuseumTitles": unmatched_museum[:20],
    }


def update_meta(catalog: list[dict]) -> None:
    platforms = json.loads(PLATFORMS_FILE.read_text(encoding="utf-8"))
    meta = json.loads(META_FILE.read_text(encoding="utf-8")) if META_FILE.exists() else {}

    listed_by_platform: dict[str, int] = {}
    excluded_by_platform: dict[str, int] = {}
    for game in catalog:
        slug = game["platformSlug"]
        if game.get("listingStatus") == "excluded":
            excluded_by_platform[slug] = excluded_by_platform.get(slug, 0) + 1
        else:
            listed_by_platform[slug] = listed_by_platform.get(slug, 0) + 1

    meta.update(
        {
            "catalogListed": sum(listed_by_platform.values()),
            "catalogExcluded": sum(excluded_by_platform.values()),
            "catalogTotal": len(catalog),
            "catalogEstimatedTotal": sum(p["estimatedCatalogSize"] for p in platforms),
            "platformCount": len(platforms),
            "listedByPlatform": dict(sorted(listed_by_platform.items())),
            "excludedByPlatform": dict(sorted(excluded_by_platform.items())),
            "lastMuseumSeedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    )
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main(platforms_filter: list[str] | None = None) -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Seed/whitelist catálogo desde Museo del Videojuego")
    parser.add_argument("--platforms", help="Slugs: mastersystem,megadrive,saturn")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    targets = platforms_filter or list(MUSEUM_PLATFORMS.keys())
    if args.platforms:
        targets = [p.strip() for p in args.platforms.split(",")]

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8")) if CATALOG_FILE.exists() else []
    report: dict = {"platforms": {}, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}

    MUSEUM_DIR.mkdir(parents=True, exist_ok=True)

    for slug in targets:
        cfg = MUSEUM_PLATFORMS.get(slug)
        if not cfg:
            print(f"Skip {slug}: no configurado")
            continue

        print(f"\nScraping museo: {slug}...")
        region_filter = cfg.get("region_filter", PAL_REGION_ID)
        multi_region = bool(cfg.get("multi_region"))
        museum_games = scrape_museum_platform(cfg["list_path"], region_filter)
        scope = "multiregión" if multi_region else "PAL"
        print(f"  {len(museum_games)} juegos ({scope}) en museo")

        museum_file = MUSEUM_DIR / f"{slug}.json"
        museum_file.write_text(
            json.dumps(museum_games, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        result = apply_museum_whitelist(
            catalog,
            slug,
            museum_games,
            cfg["pc_console"],
            multi_region=multi_region,
            exclude_reason=f"not-in-museum-{museum_seed_kind(cfg['pc_console'])}",
        )
        catalog = result["catalog"]
        report["platforms"][slug] = {
            k: v for k, v in result.items() if k != "catalog"
        }
        print(
            f"  -> listados {result['listed']} "
            f"(match {result['matched']}, nuevos {result['created']}, excluidos {result['excluded']})"
        )

    if args.dry_run:
        print("\n[dry-run] Sin guardar cambios")
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    update_meta(catalog)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCatálogo guardado: {CATALOG_FILE}")
    print(f"Informe: {REPORT_FILE}")


if __name__ == "__main__":
    main()
