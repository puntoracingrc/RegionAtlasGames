#!/usr/bin/env python3

from __future__ import annotations

import os
from unittest.mock import patch

from collectors.ebay_cover_candidates import empty_cover_queue, merge_cover_candidates
from run_ebay_regional_campaign import (
    build_global_state,
    default_state,
    reconcile_state,
    record_result,
    select_batch,
    select_global_batch,
    validate_runtime_environment,
)


def game(
    catalog_id: str,
    region: str,
    *,
    platform: str = "ps4",
    priced: bool = False,
    cover: str | None = "/covers/example.jpg",
) -> dict:
    return {
        "id": catalog_id,
        "title": catalog_id,
        "platformSlug": platform,
        "region": region,
        "listingStatus": "listed",
        "hasEsPrice": priced,
        "coverUrl": cover,
    }


def main() -> None:
    with patch.dict(os.environ, {}, clear=True):
        try:
            validate_runtime_environment()
        except RuntimeError as exc:
            assert "credenciales eBay" in str(exc)
        else:
            raise AssertionError("La campaña debe fallar si faltan secretos")
    with patch.dict(
        os.environ,
        {
            "EBAY_CLIENT_ID": "client",
            "EBAY_CLIENT_SECRET": "secret",
            "OPENAI_API_KEY": "openai",
        },
        clear=True,
    ):
        validate_runtime_environment()

    catalog = [
        game("es-priced", "PAL España", priced=True),
        game("es-missing", "PAL España", cover=None),
        game("uk", "PAL UK/ENG"),
        game("usa", "USA"),
        game("jp", "Japón"),
        game("snes-pal", "PAL Europa", platform="snes", cover=None),
        game("snes-usa", "USA", platform="snes"),
        {**game("excluded", "PAL España"), "listingStatus": "excluded"},
    ]
    ps4 = reconcile_state(default_state("ps4", "PlayStation 4"), catalog, "ps4", "PlayStation 4")
    region, ids = select_batch(ps4, catalog, 2)
    assert region and region["key"] == "pal_es"
    assert ids == ["es-missing", "es-priced"]
    ps4 = record_result(
        ps4,
        "pal_es",
        selected=ids,
        processed=ids,
        matched=["es-missing"],
        failed=[],
        listings_added=3,
        retry_limit=3,
    )
    ps4 = reconcile_state(ps4, catalog, "ps4", "PlayStation 4")
    region, ids = select_batch(ps4, catalog, 2)
    assert region and region["key"] == "pal_uk"
    assert ids == ["uk"]
    assert ps4["totals"]["catalogGames"] == 5
    assert ps4["totals"]["completed"] == 2

    # La migración conserva IDs de la campaña PS4 v1.
    legacy = default_state()
    legacy["schemaVersion"] = 1
    legacy["regions"] = {
        "pal_es": {
            "completedCatalogIds": ["es-missing"],
            "matchedCatalogIds": ["es-missing"],
        }
    }
    migrated = reconcile_state(legacy, catalog, "ps4", "PlayStation 4")
    assert migrated["schemaVersion"] == 2
    assert migrated["regions"]["pal_es"]["completedCatalogIds"] == ["es-missing"]

    snes = reconcile_state(default_state("snes", "Super Nintendo"), catalog, "snes", "Super Nintendo")
    assert snes["regions"]["pal_europa"]["marketScope"] == "multi_region"
    states = {"ps4": ps4, "snes": snes}
    selected_state, selected_region, selected_ids = select_global_batch(states, catalog, ["ps4", "snes"], 1)
    assert selected_state and selected_state["platformSlug"] == "ps4"
    assert selected_region and selected_ids == ["uk"]
    global_state = build_global_state(states, ["ps4", "snes"], batch_size=50)
    assert global_state["totals"]["catalogGames"] == 7
    assert global_state["currentPlatform"] == "ps4"
    assert global_state["schedule"]["hours"] == 6

    queue, added = merge_cover_candidates(
        empty_cover_queue(),
        catalog,
        [
            {
                "catalogId": "es-missing",
                "imageUrl": "https://i.ebayimg.com/example.jpg",
                "productUrl": "https://www.ebay.es/itm/1",
                "externalId": "1",
                "title": "ES missing PS4",
                "aiConfidence": 0.94,
                "regionEvidence": ["cover_spain"],
            },
            {
                "catalogId": "uk",
                "imageUrl": "https://i.ebayimg.com/ignored.jpg",
                "externalId": "2",
            },
        ],
        at="2026-08-27T12:00:00Z",
    )
    assert added == 1
    assert queue["totals"] == {"games": 1, "images": 1, "platforms": 1}
    assert queue["games"]["es-missing"]["status"] == "pending_review"
    print("OK: eBay global regional campaign")


if __name__ == "__main__":
    main()
