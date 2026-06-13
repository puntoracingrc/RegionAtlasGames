#!/usr/bin/env python3
"""Fase 3 — Promover juegos enriquecidos de staging al catálogo maestro."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING_DIR = ROOT / "data" / "staging"
GAMES_DIR = STAGING_DIR / "games"
INDEX_FILE = STAGING_DIR / "index.json"
CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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


def staging_to_catalog_entry(game: dict) -> dict:
    pc_path = game.get("pcPath") or game.get("pcPathGuess")
    slug = (pc_path or "").rsplit("/", 1)[-1] if pc_path else None
    if not slug:
        slug = str(game.get("catalogId") or "").split("-", 1)[-1]
    catalog_id = game.get("catalogId") or f"{game['platformSlug']}-{slug}"
    return {
        "id": catalog_id,
        "slug": slug,
        "title": game.get("title"),
        "titlePc": game.get("titlePc") or game.get("title"),
        "platformSlug": game.get("platformSlug"),
        "region": game.get("region") or "PAL España",
        "edition": "standard",
        "listingStatus": "listed",
        "coverUrl": game.get("coverUrl"),
        "pcPath": pc_path,
        "pcId": game.get("pcId"),
        "pcRegion": game.get("pcRegion") or "PAL EU (referencia)",
        "pcCondition": None,
        "matchConfidence": "STAGING_PC",
        "marketMin": game.get("marketMin"),
        "marketMax": game.get("marketMax"),
        "recommendedPrice": game.get("recommendedPrice"),
        "pcRefPrice": game.get("pcRefPrice"),
        "deltaEsVsPc": None,
        "priceSource": game.get("priceSource"),
        "updatedAt": time.strftime("%Y-%m-%d"),
        "hasEsPrice": bool(game.get("hasEsPrice")),
        "seedSource": "collection-staging",
        "stagingUnitCount": game.get("unitCount"),
        "stagingUserCount": game.get("userCount"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Promover staging → catalog.json")
    parser.add_argument("--platform", action="append", required=True, help="Slug interno, ej. ps5")
    parser.add_argument("--min-units", type=int, default=1)
    parser.add_argument("--allow-pending", action="store_true", help="Permite pending-catalog")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not GAMES_DIR.exists():
        print("No hay staging local.")
        return

    catalog = load_json(CATALOG_FILE, [])
    catalog_by_id = {g["id"]: g for g in catalog}
    games = [json.loads(p.read_text(encoding="utf-8")) for p in GAMES_DIR.glob("*.json")]

    platforms = set(args.platform)
    candidates = []
    for game in games:
        if game.get("platformSlug") not in platforms:
            continue
        if game.get("status") == "promoted":
            continue
        if int(game.get("unitCount") or 0) < args.min_units:
            continue
        status = game.get("status")
        if status != "enriched" and not args.allow_pending:
            continue
        candidates.append(game)

    candidates.sort(key=lambda g: (-int(g.get("unitCount") or 0), -int(g.get("userCount") or 0)))
    candidates = candidates[: args.limit]

    added = 0
    updated = 0
    for game in candidates:
        entry = staging_to_catalog_entry(game)
        if not entry.get("slug"):
            continue
        existing = catalog_by_id.get(entry["id"])
        if existing:
            for key in ("pcPath", "pcId", "coverUrl", "titlePc", "pcRefPrice"):
                val = entry.get(key)
                if val is not None:
                    existing[key] = val
            existing["seedSource"] = existing.get("seedSource") or "collection-staging"
            updated += 1
        else:
            catalog.append(entry)
            catalog_by_id[entry["id"]] = entry
            added += 1

        game["status"] = "promoted"
        game["catalogId"] = entry["id"]
        game["promotedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        if not args.dry_run:
            save_json(GAMES_DIR / f"{game['pcId']}.json", game)

    if args.dry_run:
        print(f"[dry-run] Añadirían {added} · actualizarían {updated}")
        return

    save_json(CATALOG_FILE, catalog)
    save_json(INDEX_FILE, rebuild_index(games))

    if META_FILE.exists():
        meta = load_json(META_FILE, {})
        listed = sum(1 for g in catalog if g.get("listingStatus") != "excluded")
        meta["catalogListed"] = listed
        meta["catalogTotal"] = len(catalog)
        meta["lastStagingPromotionAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        save_json(META_FILE, meta)

    print(f"Promovidos: {added} nuevos · {updated} actualizados · plataformas {', '.join(sorted(platforms))}")


if __name__ == "__main__":
    main()
