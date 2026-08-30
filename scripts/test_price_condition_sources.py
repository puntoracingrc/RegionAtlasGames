#!/usr/bin/env python3
"""Retail persistido y P2P comparten media sin perder su peso relativo."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.condition_buckets import mean_by_bucket, source_weight  # noqa: E402
from sync_es_prices import (  # noqa: E402
    apply_condition_price_estimates,
    apply_learned_original_contents,
    collect_condition_observations,
)


def main() -> None:
    game = {
        "id": "ps5-astro-bot",
        "title": "Astro Bot",
        "region": "PAL España",
        "tcnsRetailPrice": 20,
        "tcnsCondition": "preowned",
    }
    game_row = {
        "catalogId": game["id"],
        "source": "game-es-preowned",
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "title": "Astro Bot - Seminuevo",
        "condition": "complete",
        "priceEur": 30,
        "listingRegion": "PAL España",
        "matchMethod": "title",
        "matchScore": 0.95,
        "matchMargin": 0.25,
    }
    observations = collect_condition_observations(
        game["id"],
        "PAL España",
        "ps5",
        grouped={game["id"]: [game_row]},
        cex_by_id={},
        jgo_by_id={},
        chollo_by_id={},
        kaoto_by_id={},
        tcns_by_id={},
        tc_by_id={},
        catalog_game=game,
        use_vision=False,
    )
    assert sorted(observations) == sorted(
        [(30.0, "complete", "game-es-preowned"), (20.0, "complete", "todoconsolas")]
    )
    estimates, _ = mean_by_bucket(observations)
    assert estimates["complete"] == 25.0

    p2p_weight = source_weight("ebay-es")
    retail_weight = source_weight("todoconsolas")
    assert p2p_weight > retail_weight
    weighted, _ = mean_by_bucket(
        [(100.0, "complete", "ebay-es"), (20.0, "complete", "todoconsolas")]
    )
    assert weighted["complete"] == 68.48

    verified_game: dict[str, object] = {"priceRegionVerified": True}
    assert apply_condition_price_estimates(
        verified_game,
        [
            (12.0, "complete", "wallapop"),
            (16.0, "complete", "wallapop"),
            (18.0, "sealed", "wallapop"),
            (20.0, "sealed", "wallapop"),
            (22.0, "sealed", "wallapop"),
        ],
        synced_at="2026-08-30T10:00:00Z",
        pc_ref=None,
    )
    assert verified_game["estimatedPriceComplete"] == 14.0
    assert verified_game["estimatedPriceSealed"] == 20.0
    assert verified_game["priceRegionVerified"] is True

    content_game: dict[str, object] = {}
    assert apply_learned_original_contents(
        content_game,
        {
            "manualExpected": True,
            "originalContentsExpected": ["manual", "map", "poster"],
            "originalContentsSource": "accepted_admin_decision",
        },
        synced_at="2026-08-30T10:00:00Z",
    )
    assert content_game["originalContents"] == ["manual", "map", "poster"]
    assert content_game["manualExpected"] is True
    assert not apply_learned_original_contents(
        {},
        {
            "manualExpected": True,
            "originalContentsExpected": ["manual"],
            "originalContentsSource": "platform_generation_default",
        },
        synced_at="2026-08-30T10:00:00Z",
    )
    print("OK weighted stored price sources")


if __name__ == "__main__":
    main()
