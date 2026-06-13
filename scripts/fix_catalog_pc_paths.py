#!/usr/bin/env python3
"""Corrige pcPath y pcRegion del catálogo según edición (PAL / USA / Japón)."""

from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT / "scripts"))

from collectors.pc_region_paths import build_pc_path, catalog_region_bucket  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
REPORT_FILE = ROOT / "data" / "pc-path-fix-report.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Alinea pcPath/pcRegion con la edición del juego")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    changed = 0
    skipped = 0
    by_bucket: Counter[str] = Counter()
    samples: list[dict] = []

    for game in catalog:
        if game.get("listingStatus") == "excluded":
            continue
        new_path, new_region = build_pc_path(game)
        if not new_path:
            skipped += 1
            continue

        old_path = game.get("pcPath")
        old_region = game.get("pcRegion")
        if old_path == new_path and old_region == new_region:
            continue

        bucket = catalog_region_bucket(game)
        by_bucket[bucket] += 1
        if len(samples) < 12:
            samples.append(
                {
                    "id": game["id"],
                    "region": game.get("region"),
                    "museumRegion": game.get("museumRegion"),
                    "oldPath": old_path,
                    "newPath": new_path,
                    "newPcRegion": new_region,
                }
            )

        if not args.dry_run:
            game["pcPath"] = new_path
            game["pcRegion"] = new_region
        changed += 1

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "dryRun": args.dry_run,
        "changed": changed,
        "skippedNoConsole": skipped,
        "byBucket": dict(by_bucket),
        "samples": samples,
    }

    if not args.dry_run and changed:
        CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
