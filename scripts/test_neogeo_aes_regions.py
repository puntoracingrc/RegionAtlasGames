#!/usr/bin/env python3

from __future__ import annotations

from migrate_neogeo_aes_regions import CATALOG_ID_ALIASES, migrate


def test_migrate_regions_and_retire_aliases() -> None:
    catalog = [
        {
            "id": "neogeo-metal-slug-4",
            "platformSlug": "neogeo",
            "region": "USA",
            "listingStatus": "listed",
        },
        {
            "id": "neogeo-usa-metal-slug-4",
            "platformSlug": "neogeo",
            "region": "USA",
            "listingStatus": "listed",
            "pcId": 37864,
            "pcPath": "/game/neo-geo-aes/metal-slug-4",
            "pcRegion": "legacy",
        },
        {
            "id": "neogeo-japanese-example",
            "platformSlug": "neogeo",
            "region": "Japón",
            "listingStatus": "listed",
        },
        {
            "id": "ps2-example",
            "platformSlug": "ps2",
            "region": "USA",
            "listingStatus": "listed",
        },
    ]
    aliases: dict[str, str] = {}
    collection = [{"catalogId": "neogeo-usa-metal-slug-4"}]

    stats = migrate(catalog, aliases, collection)

    assert catalog[0]["region"] == "Occidental"
    assert catalog[1]["region"] == "Occidental"
    assert catalog[1]["listingStatus"] == "excluded"
    assert catalog[1]["pcId"] is None
    assert catalog[2]["region"] == "Japonesa"
    assert catalog[3]["region"] == "USA"
    assert collection[0]["catalogId"] == "neogeo-metal-slug-4"
    assert aliases["neogeo-usa-metal-slug-4"] == "neogeo-metal-slug-4"
    assert stats == {
        "changedRegions": 3,
        "retiredDuplicates": 1,
        "relinkedCollectionItems": 1,
        "aliases": len(CATALOG_ID_ALIASES),
    }


if __name__ == "__main__":
    test_migrate_regions_and_retire_aliases()
    print("OK: neogeo_aes_regions")
