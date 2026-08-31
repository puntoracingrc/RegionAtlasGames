#!/usr/bin/env python3
"""Regresion del sembrado provisional: media, region e idempotencia."""

from __future__ import annotations

import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from apply_provisional_price_seeds import apply_batch  # noqa: E402


def payload() -> dict:
    return {
        "schemaVersion": 1,
        "batchId": "test-batch",
        "platformSlug": "ps4",
        "region": "PAL España",
        "entries": [
            {
                "catalogId": "ps4-existing",
                "title": "Existing",
                "status": "accepted",
                "conditions": {
                    "complete": {"minimum": 20, "maximum": 30},
                    "sealed": {"minimum": 40, "maximum": 40},
                },
            },
            {
                "catalogIds": ["ps4-duplicate-a", "ps4-duplicate-b"],
                "title": "Duplicate",
                "status": "accepted",
                "conditions": {"complete": {"minimum": 25, "maximum": 30}},
            },
            {
                "catalogId": "ps4-retail",
                "title": "Retail",
                "status": "accepted",
                "conditions": {"new_retail": {"minimum": 15, "maximum": 25}},
            },
            {
                "catalogId": "ps4-preserve-verified",
                "title": "Preserve Verified",
                "status": "accepted",
                "conditions": {"sealed": {"minimum": 40, "maximum": 40}},
            },
            {
                "catalogId": "ps4-skipped",
                "title": "Skipped",
                "status": "skipped",
                "reason": "Sin region.",
            },
        ],
    }


def main() -> None:
    catalog = [
        {
            "id": "ps4-existing",
            "platformSlug": "ps4",
            "region": "PAL España",
            "estimatedPriceComplete": 10,
            "recommendedPrice": 10,
            "hasEsPrice": True,
            "priceRegionVerified": True,
        },
        {
            "id": "ps4-duplicate-a",
            "platformSlug": "ps4",
            "region": "PAL España",
            "recommendedPrice": None,
        },
        {
            "id": "ps4-duplicate-b",
            "platformSlug": "ps4",
            "region": "PAL España",
            "recommendedPrice": 22.01,
        },
        {
            "id": "ps4-retail",
            "platformSlug": "ps4",
            "region": "PAL España",
            "recommendedPrice": 30,
        },
        {
            "id": "ps4-preserve-verified",
            "platformSlug": "ps4",
            "region": "PAL España",
            "estimatedPriceComplete": 20,
            "recommendedPrice": 20,
            "hasEsPrice": True,
            "priceRegionVerified": True,
        },
        {
            "id": "ps4-skipped",
            "platformSlug": "ps4",
            "region": "PAL España",
            "recommendedPrice": None,
        },
    ]

    result = apply_batch(catalog, payload(), applied_at="2026-08-31T00:00:00Z")
    assert result["acceptedEntriesApplied"] == 4
    assert result["skippedEntries"] == 1
    assert result["catalogRowsUpdated"] == 5

    existing = catalog[0]
    assert existing["estimatedPriceComplete"] == 17.5
    assert existing["estimatedPriceSealed"] == 40.0
    assert existing["recommendedPrice"] == 17.5
    assert existing["priceRegionVerified"] is False
    assert existing["provisionalPriceBatchIds"] == ["test-batch"]

    # El precio generico previo del duplicado se combina una sola vez con el
    # punto medio 27,50 y se replica en los dos IDs del mismo titulo. El medio
    # centimo usa redondeo comercial: 24,755 pasa a 24,76.
    assert catalog[1]["estimatedPriceComplete"] == 24.76
    assert catalog[2]["estimatedPriceComplete"] == 24.76
    assert catalog[1]["recommendedPrice"] == 24.76
    assert catalog[2]["recommendedPrice"] == 24.76
    # "Nuevo" en tienda no demuestra que el articulo siga precintado. El
    # precio generico previo se conserva como completo y ambas cifras conviven.
    assert catalog[3]["estimatedPriceComplete"] == 30
    assert catalog[3]["estimatedPriceNewRetail"] == 20
    assert catalog[3]["recommendedPrice"] == 30
    assert "estimatedPriceSealed" not in catalog[3]
    assert catalog[4]["estimatedPriceComplete"] == 20
    assert catalog[4]["estimatedPriceSealed"] == 40
    assert catalog[4]["recommendedPrice"] == 20
    assert catalog[4]["priceRegionVerified"] is True
    assert "estimatedPriceComplete" not in catalog[5]

    snapshot = deepcopy(catalog)
    repeated = apply_batch(catalog, payload(), applied_at="2026-08-31T00:00:00Z")
    assert repeated["catalogRowsUpdated"] == 0
    assert repeated["alreadyAppliedEntries"] == 4
    assert catalog == snapshot

    wrong_region = payload()
    wrong_region["batchId"] = "wrong-region"
    wrong_region["entries"] = [wrong_region["entries"][0]]
    catalog[0]["region"] = "PAL Europa"
    try:
        apply_batch(catalog, wrong_region, applied_at="2026-08-31T00:00:00Z")
    except ValueError as error:
        assert "no pertenece" in str(error)
    else:
        raise AssertionError("Una variante regional incompatible no puede aplicarse.")

    print("OK provisional price seeds")


if __name__ == "__main__":
    main()
