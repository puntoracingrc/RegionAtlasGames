#!/usr/bin/env python3
"""Detecta fichas equivalentes sin decidir automáticamente cuál debe sobrevivir."""

from __future__ import annotations

import argparse
import itertools
import json
from collections import defaultdict
from pathlib import Path

from catalog_identity import game_identity_key, slugify

ROOT = Path(__file__).resolve().parents[1]
COMMERCIAL_RELATIONS_FILE = ROOT / "data" / "index" / "catalog-commercial-relations.json"


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def reviewed_duplicate_pairs(commercial_relations: dict | None) -> set[frozenset[str]]:
    pairs: set[frozenset[str]] = set()
    if not isinstance(commercial_relations, dict):
        return pairs
    for relation in commercial_relations.get("variants", []):
        provenance = relation.get("provenance", {})
        ids = frozenset(
            str(value)
            for value in (
                relation.get("variantCatalogId"),
                relation.get("canonicalCatalogId"),
            )
            if value
        )
        if (
            len(ids) == 2
            and relation.get("relationshipType") == "same_product_candidate"
            and relation.get("status") == "requires_review"
            and provenance.get("reviewBatch")
            and provenance.get("reviewedAt")
            and provenance.get("evidenceUrls")
            and provenance.get("evidenceSummary")
        ):
            pairs.add(ids)
    return pairs


def duplicate_report(
    catalog: list[dict],
    collection: list[dict],
    commercial_relations: dict | None = None,
) -> dict:
    owned_ids = {
        str(item.get("catalogId"))
        for item in collection
        if isinstance(item, dict) and item.get("catalogId")
    }
    acknowledged_pairs = reviewed_duplicate_pairs(commercial_relations)
    groups: dict[str, list[dict]] = defaultdict(list)
    for game in catalog:
        if not isinstance(game, dict) or game.get("listingStatus") == "excluded":
            continue
        groups[game_identity_key(game)].append(game)

    duplicates = []
    for identity, games in sorted(groups.items()):
        if len(games) < 2:
            continue
        game_ids = {str(game.get("id")) for game in games}
        acknowledged_review = all(
            frozenset(pair) in acknowledged_pairs
            for pair in itertools.combinations(sorted(game_ids), 2)
        )
        pc_ids = {game.get("pcId") for game in games if game.get("pcId") is not None}
        title_pc_keys = {
            slugify(game.get("titlePc") or game.get("title")) for game in games
        }
        duplicates.append(
            {
                "identity": identity,
                "acknowledgedReview": acknowledged_review,
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

    owned_duplicates = [group for group in duplicates if group["ownedCatalogIds"]]
    return {
        "catalogRows": len(catalog),
        "duplicateGroups": len(duplicates),
        "duplicateRows": sum(len(group["games"]) - 1 for group in duplicates),
        "ownedDuplicateGroups": len(owned_duplicates),
        "acknowledgedOwnedDuplicateGroups": sum(
            group["acknowledgedReview"] for group in owned_duplicates
        ),
        "unacknowledgedOwnedDuplicateGroups": sum(
            not group["acknowledgedReview"] for group in owned_duplicates
        ),
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
        load_json(COMMERCIAL_RELATIONS_FILE, {}),
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
    print(
        "En revisión explícita: "
        f"{report['acknowledgedOwnedDuplicateGroups']} / "
        f"sin reconocer: {report['unacknowledgedOwnedDuplicateGroups']}"
    )
    for group in report["groups"]:
        if not group["ownedCatalogIds"]:
            continue
        ids = ", ".join(game["id"] for game in group["games"])
        print(f"- {group['identity']}: {ids}")

    if args.fail_on_owned and report["unacknowledgedOwnedDuplicateGroups"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
