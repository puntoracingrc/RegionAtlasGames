#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLATFORM_SLUG = "neogeo-aes-plus"


def main() -> None:
    platforms = json.loads((ROOT / "data" / "platforms.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))
    details = json.loads((ROOT / "data" / "game-details.json").read_text(encoding="utf-8"))

    platform = next(item for item in platforms if item.get("slug") == PLATFORM_SLUG)
    assert platform["active"] is True
    assert platform["status"] == "open"
    assert platform["estimatedCatalogSize"] == 20
    assert (ROOT / "public" / "platform-consoles" / f"{PLATFORM_SLUG}.png").exists()

    games = [
        item
        for item in catalog
        if item.get("platformSlug") == PLATFORM_SLUG and item.get("listingStatus") == "listed"
    ]
    assert len(games) == 20
    assert len({item["id"] for item in games}) == 20
    assert sum(item["region"] == "Internacional" for item in games) == 10
    assert sum(item["region"] == "Japonesa" for item in games) == 10

    for game in games:
        assert game["estimatedPriceSealed"] == 80.0
        assert game["estimatedPriceNewRetail"] == 80.0
        assert game["estimatedPriceComplete"] is None
        assert game["regionVerified"] is True
        assert game["priceRegionVerified"] is True
        cover = ROOT / "public" / game["coverUrl"].removeprefix("/")
        assert cover.exists(), cover
        detail = details[game["id"]]
        assert detail["year"] == 2026
        assert detail["support"] == "Cartucho"
        assert len(detail["description"]) > 180
        assert detail["descriptionMeta"]["referenceUsed"] is True
        assert "areajugones.sport.es" in detail["descriptionMeta"]["referenceUrl"]

    print("OK: neogeo_aes_plus_catalog")


if __name__ == "__main__":
    main()
