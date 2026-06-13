#!/usr/bin/env python3
"""Genera data/cover-remote-by-id.json — fallback remoto cuando /covers/ no está en el deploy."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, save_json  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
PC_MAP_FILE = ROOT / "data" / "pc" / "cover-map.json"
MUSEUM_CACHE_FILE = ROOT / "data" / "museum" / "covers-cache.json"
OUT_FILE = ROOT / "data" / "cover-remote-by-id.json"


def main() -> None:
    catalog = load_json(CATALOG_FILE, [])
    pc_map = load_json(PC_MAP_FILE, {}) if PC_MAP_FILE.exists() else {}
    museum_cache = load_json(MUSEUM_CACHE_FILE, {}) if MUSEUM_CACHE_FILE.exists() else {}

    remote_by_id: dict[str, str] = {}
    from_pc = 0
    from_museum = 0

    for game in catalog:
        if game.get("listingStatus") == "excluded":
            continue
        cover = game.get("coverUrl")
        if not cover or not str(cover).startswith("/covers/"):
            continue

        gid = str(game["id"])
        pc_path = game.get("pcPath")
        if pc_path and pc_path in pc_map and pc_map[pc_path]:
            remote_by_id[gid] = str(pc_map[pc_path])
            from_pc += 1
            continue

        museum_path = game.get("museumPath")
        if museum_path:
            cached = museum_cache.get(museum_path) or {}
            url = cached.get("coverUrl")
            if url:
                remote_by_id[gid] = str(url)
                from_museum += 1

    save_json(OUT_FILE, remote_by_id)
    print(f"Guardado: {OUT_FILE} ({len(remote_by_id)} entradas)")
    print(f"  PriceCharting: {from_pc} · Museo: {from_museum}")


if __name__ == "__main__":
    main()
