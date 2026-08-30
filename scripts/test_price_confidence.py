#!/usr/bin/env python3
"""Regression tests for minimum market sample and verification confidence."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from sync_es_prices import (  # noqa: E402
    MIN_ESTIMATE_OBSERVATIONS,
    MIN_VERIFIED_OBSERVATIONS,
    apply_condition_price_estimates,
    estimate_price,
    merge_scoped_platform_run_state,
)


def base_game() -> dict[str, object]:
    return {
        "recommendedPrice": None,
        "priceRegionVerified": False,
        "hasEsPrice": False,
        "priceDataSources": None,
    }


def main() -> None:
    assert MIN_ESTIMATE_OBSERVATIONS == 2
    assert MIN_VERIFIED_OBSERVATIONS == 3

    estimate = estimate_price([25.0], None, None)
    assert estimate[0] is None
    assert estimate[3] == "insufficient_observations"
    assert estimate[5] == 1

    estimate = estimate_price([20.0, 30.0], None, None)
    assert estimate[0] == 25.0
    assert estimate[5] == 2

    one_observation = base_game()
    assert not apply_condition_price_estimates(
        one_observation,
        [(20.0, "complete", "ebay-es")],
        synced_at="test",
        pc_ref=None,
    )
    assert one_observation["hasEsPrice"] is False

    estimated = base_game()
    assert apply_condition_price_estimates(
        estimated,
        [
            (20.0, "complete", "ebay-es"),
            (30.0, "complete", "wallapop"),
        ],
        synced_at="test",
        pc_ref=None,
    )
    assert estimated["recommendedPrice"] == 25.0
    assert estimated["priceRegionVerified"] is False

    fresh_bucket_wins = {**base_game(), "estimatedPriceComplete": 99.0}
    assert apply_condition_price_estimates(
        fresh_bucket_wins,
        [
            (10.0, "loose", "ebay-es"),
            (14.0, "loose", "wallapop"),
        ],
        synced_at="test",
        pc_ref=None,
    )
    assert fresh_bucket_wins["recommendedPrice"] == 12.0

    verified = base_game()
    assert apply_condition_price_estimates(
        verified,
        [
            (20.0, "complete", "ebay-es"),
            (30.0, "complete", "wallapop"),
            (25.0, "complete", "vinted-es"),
        ],
        synced_at="test",
        pc_ref=None,
    )
    assert verified["recommendedPrice"] == 25.0
    assert verified["priceRegionVerified"] is True

    delivery_total = {
        **base_game(),
        "estimatedShippingToSpainSealed": 3.0,
        "estimatedTotalToSpainSealed": 50.0,
    }
    assert apply_condition_price_estimates(
        delivery_total,
        [
            (10.0, "sealed", "ebay-es"),
            (14.0, "sealed", "wallapop"),
        ],
        synced_at="test",
        pc_ref=None,
    )
    assert delivery_total["estimatedPriceSealed"] == 12.0
    assert delivery_total["estimatedTotalToSpainSealed"] == 15.0

    previous_platform = {
        "lastSyncAt": "full-run",
        "source": "eBay ES",
        "gamesTargeted": 50,
        "gamesUpdated": 20,
    }
    scoped = merge_scoped_platform_run_state(
        previous_platform,
        {"lastSyncAt": "single-game", "source": "Wallapop ES", "gamesTargeted": 1},
        {"ps4-example"},
    )
    assert scoped["lastSyncAt"] == "full-run"
    assert scoped["gamesTargeted"] == 50
    assert scoped["lastScopedSync"]["scope"] == "catalog_ids"
    assert scoped["lastScopedSync"]["catalogIds"] == ["ps4-example"]
    assert scoped["lastScopedSync"]["source"] == "Wallapop ES"

    scoped_region = merge_scoped_platform_run_state(
        {
            "lastSyncAt": "regional-full-run",
            "source": "eBay ES",
            "gamesTargeted": 53,
        },
        {
            "lastSyncAt": "regional-single-game",
            "source": "Wallapop ES",
            "gamesTargeted": 1,
        },
        {"ps4-example"},
    )
    assert scoped_region["lastSyncAt"] == "regional-full-run"
    assert scoped_region["gamesTargeted"] == 53
    assert scoped_region["lastScopedSync"]["lastSyncAt"] == "regional-single-game"

    print("price confidence tests: OK")


if __name__ == "__main__":
    main()
