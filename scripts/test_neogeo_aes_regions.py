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


def test_duplicate_japanese_mahjong_entry_is_consolidated() -> None:
    catalog = [
        {
            "id": "neogeo-bakatono-sama-mahjong-manyuki",
            "platformSlug": "neogeo",
            "region": "Japonesa",
            "listingStatus": "listed",
            "pcId": 1,
            "pcPath": "/duplicate",
            "pcRegion": "legacy",
        },
        {
            "id": "neogeo-mahjong-bakatonosama-manyuki",
            "platformSlug": "neogeo",
            "region": "Japonesa",
            "listingStatus": "listed",
        },
    ]
    aliases: dict[str, str] = {}
    collection = [{"catalogId": "neogeo-bakatono-sama-mahjong-manyuki"}]

    stats = migrate(catalog, aliases, collection)

    assert catalog[0]["listingStatus"] == "excluded"
    assert catalog[0]["pcId"] is None
    assert aliases["neogeo-bakatono-sama-mahjong-manyuki"] == (
        "neogeo-mahjong-bakatonosama-manyuki"
    )
    assert collection[0]["catalogId"] == "neogeo-mahjong-bakatonosama-manyuki"
    assert stats["retiredDuplicates"] == 1
    assert stats["relinkedCollectionItems"] == 1


def test_duplicate_japanese_savage_reign_entry_is_consolidated() -> None:
    catalog = [
        {
            "id": "neogeo-japonesa-savage-reign",
            "platformSlug": "neogeo",
            "region": "Japonesa",
            "listingStatus": "listed",
            "pcId": 4369282,
            "pcPath": "/game/jp-neo-geo-aes/savage-reign",
            "pcRegion": "JP Neo Geo AES (PriceCharting)",
        },
        {
            "id": "neogeo-fuuun-mokushiroku-kakutou-sousei",
            "platformSlug": "neogeo",
            "region": "Japonesa",
            "listingStatus": "listed",
        },
    ]
    aliases: dict[str, str] = {}

    stats = migrate(catalog, aliases, [])

    assert catalog[0]["listingStatus"] == "excluded"
    assert catalog[0]["pcId"] is None
    assert aliases["neogeo-japonesa-savage-reign"] == (
        "neogeo-fuuun-mokushiroku-kakutou-sousei"
    )
    assert stats["retiredDuplicates"] == 1


if __name__ == "__main__":
    test_migrate_regions_and_retire_aliases()
    test_duplicate_japanese_mahjong_entry_is_consolidated()
    test_duplicate_japanese_savage_reign_entry_is_consolidated()
    print("OK: neogeo_aes_regions")
