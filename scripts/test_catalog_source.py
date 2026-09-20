#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from collectors.catalog_source import (
    CatalogSourceError,
    load_catalog,
    platform_inventory,
    require_platform_catalog,
)

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    canonical = ROOT / "data" / "catalog.json"
    catalog = load_catalog(canonical)
    ps5 = require_platform_catalog(catalog, "ps5", source=canonical)
    ps5_es = require_platform_catalog(
        catalog,
        "ps5",
        source=canonical,
        region="PAL España",
    )
    report = platform_inventory(catalog, "ps5", region="PAL España")
    assert len(ps5) > 0
    assert len(ps5_es) > 0
    assert report["validListedEntries"] == len(ps5)
    assert report["validRegionEntries"] == len(ps5_es)
    assert report["uniqueListedIds"] == len(ps5)

    with tempfile.TemporaryDirectory(prefix="catalog-source-test-") as temporary:
        legacy = Path(temporary) / "games.json"
        legacy.write_text(
            json.dumps([{"id": "legacy-ps4", "title": "Legacy", "platformSlug": "ps4"}]),
            encoding="utf-8",
        )
        try:
            require_platform_catalog(load_catalog(legacy), "ps5", source=legacy)
        except CatalogSourceError as exc:
            message = str(exc)
            assert "platformSlug=ps5" in message
            assert "data/games.json es un archivo legado" in message
        else:
            raise AssertionError("Un archivo legado sin PS5 no puede validar la plataforma")

    print(
        "OK catalogo PS5 canonico: "
        f"{report['validListedEntries']} fichas; "
        f"{report['validRegionEntries']} PAL España"
    )


if __name__ == "__main__":
    main()
