#!/usr/bin/env python3
"""Consolida Neo Geo AES en sus dos familias comerciales de carátula."""

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

# Son la misma edición occidental con títulos o slugs heredados distintos. La
# ficha de destino conserva la URL pública y la información más completa.
CATALOG_ID_ALIASES = {
    "neogeo-blue%27s-journey": "neogeo-blues-journey",
    "neogeo-eightman": "neogeo-usa-eight-man",
    "neogeo-fatal-fury-king-fighters": "neogeo-fatal-fury",
    "neogeo-japon-metal-slug-5": "neogeo-metal-slug-5",
    "neogeo-japon-world-heroes-2-jet": "neogeo-world-heroes-2-jet",
    "neogeo-king-monsters-2": "neogeo-king-of-the-monsters-2",
    "neogeo-samurai-shodown-iii": "neogeo-samurai-shodown-3-blades-blood",
    "neogeo-samurai-shodown-iv": "neogeo-samurai-shodown-4-amakusas-revenge",
    "neogeo-samurai-shodown-5-samurai-spirits-zero": "neogeo-samurai-shodown-v",
    "neogeo-samurai-shodown-v-special": (
        "neogeo-samurai-shodown-5-special-samurai-spirits-zero-special"
    ),
    "neogeo-spinmaster": "neogeo-spin-master",
    "neogeo-top-player%27s-golf": "neogeo-top-players-golf",
    "neogeo-usa-metal-slug-4": "neogeo-metal-slug-4",
    "neogeo-usa-metal-slug-x": "neogeo-metal-slug-x",
    "neogeo-usa-world-heroes-2": "neogeo-world-heroes-2",
}


def migrate(
    catalog: list[dict],
    aliases: dict[str, str],
    collection: list[dict],
) -> dict[str, int]:
    changed_regions = 0
    retired_duplicates = 0
    relinked_collection_items = 0

    for game in catalog:
        if game.get("platformSlug") != "neogeo":
            continue
        region = str(game.get("region") or "")
        target_region = REGION_MAP.get(region)
        if target_region and target_region != region:
            game["region"] = target_region
            changed_regions += 1

        target_id = CATALOG_ID_ALIASES.get(str(game.get("id") or ""))
        if target_id:
            if game.get("listingStatus") != "excluded":
                retired_duplicates += 1
            game["listingStatus"] = "excluded"
            game["pcId"] = None
            game["pcPath"] = None
            game["pcRegion"] = None
            aliases[str(game["id"])] = target_id

    for item in collection:
        catalog_id = str(item.get("catalogId") or "")
        target_id = CATALOG_ID_ALIASES.get(catalog_id)
        if target_id:
            item["catalogId"] = target_id
            relinked_collection_items += 1

    return {
        "changedRegions": changed_regions,
        "retiredDuplicates": retired_duplicates,
        "relinkedCollectionItems": relinked_collection_items,
        "aliases": len(CATALOG_ID_ALIASES),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=ROOT / "data" / "catalog.json")
    parser.add_argument(
        "--aliases", type=Path, default=ROOT / "data" / "catalog-id-aliases.json"
    )
    parser.add_argument("--collection", type=Path, default=ROOT / "data" / "collection.json")
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    aliases = json.loads(args.aliases.read_text(encoding="utf-8"))
    collection = json.loads(args.collection.read_text(encoding="utf-8"))
    stats = migrate(catalog, aliases, collection)

    args.catalog.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.aliases.write_text(
        json.dumps(dict(sorted(aliases.items())), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    args.collection.write_text(
        json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
