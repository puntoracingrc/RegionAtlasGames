#!/usr/bin/env python3
"""Convierte coverUrl externas (Museo, etc.) a rutas /covers/{plataforma}/{archivo}.jpg."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, save_json  # noqa: E402
from collectors.covers_storage import (  # noqa: E402
    cover_filename_from_title,
    is_local_cover_url,
    public_cover_url,
)

CATALOG_FILE = ROOT / "data" / "catalog.json"


def main() -> None:
    catalog = load_json(CATALOG_FILE, [])
    used: dict[str, set[str]] = {}
    converted = 0
    kept = 0
    cleared = 0

    for game in catalog:
        cover = game.get("coverUrl")
        if not cover:
            continue
        if is_local_cover_url(str(cover)):
            kept += 1
            continue

        title = str(game.get("title") or "")
        platform = str(game.get("platformSlug") or "")
        if not title or not platform:
            game["coverUrl"] = None
            cleared += 1
            continue

        filename = cover_filename_from_title(title, platform, used)
        game["coverUrl"] = public_cover_url(platform, filename)
        converted += 1

    save_json(CATALOG_FILE, catalog)
    print(f"Catálogo actualizado: {CATALOG_FILE}")
    print(f"  Rutas /covers/ ya OK: {kept}")
    print(f"  Convertidas desde URL externa: {converted}")
    print(f"  Sin título/plataforma (limpiadas): {cleared}")


if __name__ == "__main__":
    main()
