#!/usr/bin/env python3
"""Regresión: GAME seminuevo solo autoacepta casos PAL España prudentes."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from sync_es_prices import (  # noqa: E402
    apply_game_preowned_auto_region_policy,
    filter_verified_listings,
    is_game_preowned_auto_verified,
)


def base_row(**overrides):
    row = {
        "catalogId": "ps4-test",
        "source": "game-es-preowned",
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "title": "Bloodborne - Seminuevo",
        "priceEur": 14.99,
        "condition": "complete",
        "matchMethod": "title",
        "matchScore": 0.92,
        "matchMargin": 0.22,
        "regionReviewNeeded": True,
    }
    row.update(overrides)
    return row


def main() -> None:
    catalog_by_id = {"ps4-test": {"id": "ps4-test", "region": "PAL España"}}
    ingest = {"listings": [base_row()]}

    assert apply_game_preowned_auto_region_policy(ingest, catalog_by_id) == 1
    row = ingest["listings"][0]
    assert row["regionVerified"] is True
    assert row["listingRegion"] == "PAL España"
    assert row["regionReviewNeeded"] is False
    assert is_game_preowned_auto_verified(row, "PAL España") is True

    usable, unverified, mismatch, insufficient, stale = filter_verified_listings("ps4", "PAL España", [row])
    assert len(usable) == 1
    assert (unverified, mismatch, insufficient, stale) == (0, 0, 0, 0)

    import_row = base_row(title="Bloodborne Import USA - Seminuevo")
    assert is_game_preowned_auto_verified(import_row, "PAL España") is False
    assert apply_game_preowned_auto_region_policy({"listings": [import_row]}, catalog_by_id) == 0

    weak_row = base_row(matchScore=0.79)
    assert is_game_preowned_auto_verified(weak_row, "PAL España") is False

    non_pal_row = base_row()
    assert is_game_preowned_auto_verified(non_pal_row, "USA") is False

    print("OK GAME seminuevo auto policy")


if __name__ == "__main__":
    main()
