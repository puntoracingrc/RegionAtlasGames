#!/usr/bin/env python3
"""Contrato del publicador Git para artefactos del PC."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from publish_verified_price_artifacts import (  # noqa: E402
    ArtifactError,
    validate_game_ingest,
    validate_tcns_ingest,
    validate_wallapop_artifact,
)


def expect_error(callback) -> None:
    try:
        callback()
    except ArtifactError:
        return
    raise AssertionError("Se esperaba una parada segura.")


def test_tcns_contract() -> None:
    row = {
        "catalogId": "ps5-astro-bot",
        "source": "todoconsolas",
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "condition": "preowned",
        "conditionRaw": "Segunda mano",
        "priceEur": 44.95,
        "retailPriceEur": 44.95,
        "productUrl": "https://www.todoconsolas.com/juegos-ps5/astro-bot.html",
        "listingRegion": "PAL España",
        "catalogRegion": "PAL España",
        "regionVerified": True,
        "autoApproved": True,
        "acceptancePolicy": "tcns_exact_title_region_used_v1",
    }
    payload = {
        "platformSlug": "ps5",
        "source": "todoconsolas",
        "listings": [],
        "regionalCandidates": [{"unsafe": True}],
        "tcns": [row],
        "tc": [],
    }
    clean = validate_tcns_ingest(payload, "ps5", 1)
    assert clean["regionalCandidates"] == []
    bad_region = {**payload, "tcns": [{**row, "catalogRegion": "USA"}]}
    expect_error(lambda: validate_tcns_ingest(bad_region, "ps5", 1))


def test_game_contract() -> None:
    row = {
        "catalogId": "switch2-mario-kart-world",
        "source": "game-es-preowned",
        "sourceType": "retail_es_preowned",
        "offerType": "preowned",
        "condition": "complete",
        "matchMethod": "title",
        "priceEur": 49.99,
        "productUrl": "https://www.game.es/mario-kart-world-seminuevo/123",
    }
    job = {"platformSlug": "switch2"}
    payload = {
        "platformSlug": "switch2",
        "source": "game-es-preowned",
        "offerType": "preowned",
        "listings": [row],
    }
    clean = validate_game_ingest(payload, job)
    assert clean["listings"] == [row]
    assert clean["tcns"] == []
    bad_host = {**payload, "listings": [{**row, "productUrl": "https://example.com/123"}]}
    expect_error(lambda: validate_game_ingest(bad_host, job))


def test_wallapop_contract() -> None:
    job_id = "wallapop-pal-test-1"
    manifest = {
        "jobId": job_id,
        "platformSlug": "ps4",
        "searchedCatalogIds": ["ps4-alpha"],
        "resultCatalogIds": ["ps4-alpha", "ps4-alpha-usa"],
        "verifiedCatalogIds": ["ps4-alpha"],
        "resultPath": f"results/{job_id}/catalog-price-results.json",
        "ingestResultPath": f"results/{job_id}/wallapop-ingest.json",
    }
    catalog = [
        {"id": "ps4-alpha", "platformSlug": "ps4", "region": "PAL España"},
        {"id": "ps4-alpha-usa", "platformSlug": "ps4", "region": "USA"},
    ]
    result = {
        "schemaVersion": 1,
        "jobId": job_id,
        "source": "wallapop",
        "platformSlug": "ps4",
        "searchedCatalogIds": ["ps4-alpha"],
        "catalogIds": ["ps4-alpha", "ps4-alpha-usa"],
        "verifiedCatalogIds": ["ps4-alpha"],
        "games": [
            {
                "id": "ps4-alpha",
                "platformSlug": "ps4",
                "region": "PAL España",
                "priceRegionVerified": True,
            },
            {
                "id": "ps4-alpha-usa",
                "platformSlug": "ps4",
                "region": "USA",
                "priceRegionVerified": False,
            },
        ],
    }
    verified_row = {
        "catalogId": "ps4-alpha",
        "source": "wallapop",
        "listingType": "active",
        "priceEur": 20,
        "title": "Alpha PS4 precintado",
        "listingRegion": "PAL España",
        "regionVerified": True,
        "regionEvidence": ["cover_vision"],
        "productUrl": "https://es.wallapop.com/item/alpha-123",
        "condition": "sealed",
    }
    ingest = {
        "platformSlug": "ps4",
        "source": "wallapop",
        "listings": [
            verified_row,
            {
                **verified_row,
                "externalId": "review-only",
                "regionVerified": False,
                "listingRegion": "",
            },
        ],
    }
    platform, clean, count = validate_wallapop_artifact(manifest, result, ingest, catalog)
    assert platform == "ps4"
    assert count == 1
    assert clean["listings"] == [{**verified_row, "catalogRegion": "PAL España"}]
    assert clean["regionalCandidates"] == []

    bad_region = {
        **ingest,
        "listings": [{**verified_row, "listingRegion": "USA"}],
    }
    expect_error(lambda: validate_wallapop_artifact(manifest, result, bad_region, catalog))
    bad_path = {**manifest, "ingestResultPath": "app/data/catalog.json"}
    expect_error(lambda: validate_wallapop_artifact(bad_path, result, ingest, catalog))


def main() -> None:
    test_tcns_contract()
    test_game_contract()
    test_wallapop_contract()
    print("OK verified price artifact publisher")


if __name__ == "__main__":
    main()
