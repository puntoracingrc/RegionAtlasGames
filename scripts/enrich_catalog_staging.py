#!/usr/bin/env python3
"""Fase 2 — Enriquecer juegos en staging desde PriceCharting (portada + pcPath)."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.cover_sources import fetch_pc_cover, upscale_pc_thumb  # noqa: E402
from collectors.game_details_lib import parse_pc_details  # noqa: E402

STAGING_DIR = ROOT / "data" / "staging"
GAMES_DIR = STAGING_DIR / "games"
INDEX_FILE = STAGING_DIR / "index.json"
PC_MAP_FILE = STAGING_DIR / "pc-cover-cache.json"
PC_BASE = "https://www.pricecharting.com"


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def fetch_html(url: str) -> str:
    import urllib.error
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "RegionAtlasGames/1.0 (staging enrich)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError):
        return ""


def parse_page(html: str) -> dict:
    import re

    canonical = re.search(
        r'<link rel="canonical" href="https://www\.pricecharting\.com(/game/[^"]+)"',
        html,
        re.I,
    )
    pc_path = canonical.group(1) if canonical else None
    product_id = None
    match = re.search(r'data-product-id="(\d+)"', html)
    if match:
        product_id = int(match.group(1))
    title_match = re.search(r'<h1[^>]*id="product_name"[^>]*>([^<]+)<', html, re.I)
    return {
        "pcPath": pc_path,
        "productId": product_id,
        "titlePc": title_match.group(1).strip() if title_match else None,
    }


def rebuild_index(games: list[dict]) -> dict:
    by_platform: dict[str, dict[str, int]] = {}
    for game in games:
        slug = str(game.get("platformSlug") or "")
        stats = by_platform.setdefault(
            slug,
            {"games": 0, "units": 0, "pendingEnrich": 0, "enriched": 0, "promoted": 0},
        )
        stats["games"] += 1
        stats["units"] += int(game.get("unitCount") or 0)
        status = game.get("status") or "pending-catalog"
        if status == "promoted":
            stats["promoted"] += 1
        elif status == "enriched":
            stats["enriched"] += 1
        else:
            stats["pendingEnrich"] += 1
    return {
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pcIds": sorted(int(g["pcId"]) for g in games),
        "byPlatform": by_platform,
    }


def enrich_game(game: dict, pc_map: dict[str, str], delay: float) -> dict:
    if game.get("status") == "promoted":
        return game

    candidates = [game.get("pcPath"), game.get("pcPathGuess")]
    pc_id = int(game["pcId"])

    for candidate in candidates:
        if not candidate or not str(candidate).startswith("/game/"):
            continue
        html = fetch_html(f"{PC_BASE}{candidate}")
        time.sleep(delay)
        if not html:
            continue
        parsed = parse_page(html)
        if parsed.get("productId") and parsed["productId"] != pc_id:
            continue

        pc_path = parsed.get("pcPath") or candidate
        details = parse_pc_details(html, pc_path)
        slug = pc_path.rsplit("/", 1)[-1]
        cover_source = fetch_pc_cover(pc_path, pc_map)
        cover_url = f"/covers/{game['platformSlug']}/{slug}.jpg" if cover_source else None

        game.update(
            {
                "status": "enriched",
                "pcPath": pc_path,
                "titlePc": parsed.get("titlePc") or game.get("titlePc") or game.get("title"),
                "coverSourceUrl": upscale_pc_thumb(cover_source) if cover_source else None,
                "coverUrl": cover_url,
                "enrichedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "enrichError": None,
                "catalogId": game.get("catalogId") or f"{game['platformSlug']}-{slug}",
            }
        )
        if details.get("pcProductId"):
            game["pcProductId"] = details["pcProductId"]
        return game

    game["enrichError"] = "No se pudo verificar la ficha en PriceCharting."
    return game


def main() -> None:
    parser = argparse.ArgumentParser(description="Enriquecer staging desde PriceCharting")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--delay", type=float, default=0.9)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not GAMES_DIR.exists():
        print("No hay staging local en data/staging/games")
        return

    pc_map = load_json(PC_MAP_FILE, {})
    games = []
    for path in sorted(GAMES_DIR.glob("*.json")):
        games.append(json.loads(path.read_text(encoding="utf-8")))

    targets = [
        g
        for g in games
        if g.get("status") == "pending-catalog"
    ]
    targets.sort(key=lambda g: (-int(g.get("unitCount") or 0), -int(g.get("userCount") or 0)))
    targets = targets[: args.limit]

    enriched = 0
    failed = 0
    for game in targets:
        before = game.get("status")
        updated = enrich_game(game, pc_map, args.delay)
        if updated.get("status") == "enriched" and before != "enriched":
            enriched += 1
        elif updated.get("status") != "enriched":
            failed += 1
        if not args.dry_run:
            save_json(GAMES_DIR / f"{updated['pcId']}.json", updated)

    if not args.dry_run:
        save_json(PC_MAP_FILE, pc_map)
        save_json(INDEX_FILE, rebuild_index(games))

    print(f"Intentados: {len(targets)} · Enriquecidos: {enriched} · Fallidos: {failed}")


if __name__ == "__main__":
    main()
