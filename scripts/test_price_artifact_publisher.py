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


def main() -> None:
    test_tcns_contract()
    test_game_contract()
    print("OK verified price artifact publisher")


if __name__ == "__main__":
    main()
