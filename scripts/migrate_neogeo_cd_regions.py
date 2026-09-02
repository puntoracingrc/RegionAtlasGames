#!/usr/bin/env python3
"""Consolida Neo Geo CD en sus dos familias comerciales de caratula."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REGION_MAP = {
    "PAL España": "Occidental",
    "USA": "Occidental",
    "Japón": "Japonesa",
}


def migrate(catalog: list[dict]) -> dict[str, int]:
    changed_regions = 0

    for game in catalog:
        if game.get("platformSlug") != "neogeocd":
            continue
        region = str(game.get("region") or "")
        target_region = REGION_MAP.get(region)
        if target_region and target_region != region:
            game["region"] = target_region
            changed_regions += 1

    return {"changedRegions": changed_regions}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=ROOT / "data" / "catalog.json")
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    stats = migrate(catalog)

    args.catalog.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
