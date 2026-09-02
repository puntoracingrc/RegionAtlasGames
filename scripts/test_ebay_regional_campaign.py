#!/usr/bin/env python3

from __future__ import annotations

import os
from unittest.mock import patch

from collect_ebay_es import SearchBudget, filter_platform_games_by_regions
from collectors.ebay_cover_candidates import empty_cover_queue, merge_cover_candidates
from run_ebay_regional_campaign import (
    build_global_state,
    campaign_region_in_scope,
    current_daily_usage,
    default_state,
    reconcile_state,
    record_result,
    select_batch,
    select_global_batch,
    sync_catalog_ids,
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
    assert campaign_region_in_scope("PAL España")
    assert campaign_region_in_scope("España")
    assert campaign_region_in_scope("PAL Europa")
    assert not campaign_region_in_scope("USA")
    assert not campaign_region_in_scope("Japón")
    assert not campaign_region_in_scope("PAL UK/ENG")

    budget = SearchBudget.from_value(2)
    assert budget.reserve()
    assert budget.reserve()
    assert not budget.reserve()
    assert budget.used == 2
    assert budget.exhausted

    routed_games = filter_platform_games_by_regions(
        [
            game("es", "PAL España"),
            game("eu", "PAL Europa"),
            game("usa", "USA"),
            game("jp", "Japón"),
        ],
        "PAL España,España,PAL Europa",
    )
    assert [row["id"] for row in routed_games] == ["es", "eu"]

    usage = current_daily_usage({})
    assert usage["apiSearches"] == 0
    same_day = current_daily_usage({"dailyUsage": {"date": usage["date"], "apiSearches": 750}})
    assert same_day["apiSearches"] == 750
    stale_day = current_daily_usage({"dailyUsage": {"date": "2000-01-01", "apiSearches": 1000}})
    assert stale_day["apiSearches"] == 0

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
        game("ps4-pal", "PAL Europa"),
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
        regional_reroutes=1,
        regional_reviews=2,
    )
    assert ps4["lastRun"]["regionalReroutes"] == 1
    assert ps4["lastRun"]["regionalReviews"] == 2
    assert "1 aprovechados en otra región" in ps4["log"][-1]["message"]
    assert sync_catalog_ids(["es-missing", "es-priced"], ["jp", "es-missing"]) == [
        "es-missing",
        "es-priced",
        "jp",
    ]
    ps4 = reconcile_state(ps4, catalog, "ps4", "PlayStation 4")
    region, ids = select_batch(ps4, catalog, 2)
    assert region and region["key"] == "pal_europa"
    assert ids == ["ps4-pal"]
    assert ps4["totals"]["catalogGames"] == 3
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
    ps4 = record_result(
        ps4,
        "pal_europa",
        selected=["ps4-pal"],
        processed=["ps4-pal"],
        matched=[],
        failed=[],
        listings_added=0,
        retry_limit=3,
        api_searches=1,
        search_budget=250,
    )
    ps4 = reconcile_state(ps4, catalog, "ps4", "PlayStation 4")
    states = {"ps4": ps4, "snes": snes}
    selected_state, selected_region, selected_ids = select_global_batch(states, catalog, ["ps4"], 1)
    assert not selected_state
    assert not selected_region and selected_ids == []
    selected_state, selected_region, selected_ids = select_global_batch(states, catalog, ["ps4", "snes"], 1)
    assert selected_state and selected_state["platformSlug"] == "snes"
    assert selected_region and selected_ids == ["snes-pal"]
    global_state = build_global_state(
        states,
        ["ps4", "snes"],
        current={"dailyUsage": same_day},
    )
    assert global_state["totals"]["catalogGames"] == 4
    assert global_state["currentPlatform"] == "snes"
    assert global_state["schedule"]["hours"] == 6
    assert global_state["schedule"]["dailySearchBudget"] == 1000
    assert global_state["schedule"]["dailySearchesUsed"] == 750
    assert global_state["schedule"]["dailySearchesRemaining"] == 250
    assert global_state["schedule"]["regions"] == ["PAL España", "PAL Europa"]

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
