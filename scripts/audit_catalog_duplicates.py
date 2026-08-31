#!/usr/bin/env python3
"""Detecta fichas equivalentes sin decidir automáticamente cuál debe sobrevivir."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from catalog_identity import game_identity_key, slugify

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def duplicate_report(catalog: list[dict], collection: list[dict]) -> dict:
    owned_ids = {
        str(item.get("catalogId"))
        for item in collection
        if isinstance(item, dict) and item.get("catalogId")
    }
    groups: dict[str, list[dict]] = defaultdict(list)
    for game in catalog:
        if not isinstance(game, dict) or game.get("listingStatus") == "excluded":
            continue
        groups[game_identity_key(game)].append(game)

    duplicates = []
    for identity, games in sorted(groups.items()):
        if len(games) < 2:
            continue
        pc_ids = {game.get("pcId") for game in games if game.get("pcId") is not None}
        title_pc_keys = {
            slugify(game.get("titlePc") or game.get("title")) for game in games
        }
        duplicates.append(
            {
                "identity": identity,
                "ownedCatalogIds": sorted(
                    str(game.get("id")) for game in games if game.get("id") in owned_ids
                ),
                "samePcId": len(pc_ids) == 1 and len(pc_ids) == len(
                    {game.get("pcId") for game in games}
                ),
                "sameReferenceTitle": len(title_pc_keys) == 1,
                "games": [
                    {
                        "id": game.get("id"),
                        "title": game.get("title"),
                        "titlePc": game.get("titlePc"),
                        "pcId": game.get("pcId"),
                        "region": game.get("region"),
                        "edition": game.get("edition"),
                    }
                    for game in games
                ],
            }
        )

    return {
        "catalogRows": len(catalog),
        "duplicateGroups": len(duplicates),
        "duplicateRows": sum(len(group["games"]) - 1 for group in duplicates),
        "ownedDuplicateGroups": sum(bool(group["ownedCatalogIds"]) for group in duplicates),
        "groups": duplicates,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=str(ROOT / "data" / "catalog.json"))
    parser.add_argument("--collection", default=str(ROOT / "data" / "collection.json"))
    parser.add_argument("--output")
    parser.add_argument("--fail-on-owned", action="store_true")
    args = parser.parse_args()

    report = duplicate_report(
        load_json(Path(args.catalog), []),
        load_json(Path(args.collection), []),
    )
    if args.output:
        Path(args.output).write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(
        f"Duplicados canónicos: {report['duplicateGroups']} grupos / "
        f"{report['duplicateRows']} filas sobrantes"
    )
    print(f"Ligados a la colección base: {report['ownedDuplicateGroups']}")
    for group in report["groups"]:
        if not group["ownedCatalogIds"]:
            continue
        ids = ", ".join(game["id"] for game in group["games"])
        print(f"- {group['identity']}: {ids}")

    if args.fail_on_owned and report["ownedDuplicateGroups"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
