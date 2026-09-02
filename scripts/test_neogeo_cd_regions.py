#!/usr/bin/env python3

from __future__ import annotations

from migrate_neogeo_cd_regions import migrate


def test_migrate_neogeo_cd_regions_only() -> None:
    catalog = [
        {"id": "neogeocd-usa-example", "platformSlug": "neogeocd", "region": "USA"},
        {
            "id": "neogeocd-japon-example",
            "platformSlug": "neogeocd",
            "region": "Japón",
        },
        {"id": "neogeo-usa-example", "platformSlug": "neogeo", "region": "USA"},
    ]

    stats = migrate(catalog)

    assert catalog[0]["region"] == "Occidental"
    assert catalog[1]["region"] == "Japonesa"
    assert catalog[2]["region"] == "USA"
    assert stats == {"changedRegions": 2}


if __name__ == "__main__":
    test_migrate_neogeo_cd_regions_only()
    print("OK: neogeo_cd_regions")
