#!/usr/bin/env python3
"""Regression checks for the Python side of PhysicalEvidenceBundleV1."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.physical_evidence_bundle import (  # noqa: E402
    build_physical_evidence_bundle,
    map_visual_component,
    validate_physical_evidence_bundle,
)
from collectors.price_review_queue import _row_to_item, merge_price_review_queue_documents  # noqa: E402


def sample_row() -> dict:
    return {
        "source": "ebay-es", "title": "Game PS4", "priceEur": 20, "catalogId": "ps4-game",
        "candidateCatalogId": "ps4-game", "listingRegion": "PAL España", "regionVerified": False,
        "regionReviewNeeded": True, "regionReviewReason": "regional_confirmation_missing",
        "condition": "loose", "externalId": "123", "productUrl": "https://example.test/123",
        "regionEvidence": ["distributor_regional"], "aiConfidence": 0.96,
        "visualObservations": [
            {"imageIndex": 1, "imageSource": "listing", "component": "box", "role": "back", "barcodes": ["3307211234567"]},
            {"imageIndex": 2, "imageSource": "listing", "component": "game", "role": "disc", "productCodes": ["CUSA-12345"]},
        ],
    }


def test_component_mapping() -> None:
    assert map_visual_component({"component": "box", "role": "back"}) == ("UNKNOWN_COMPONENT", "PHYSICAL_PRODUCT")
    assert map_visual_component({"component": "game", "role": "disc"}) == ("DISC", "MEDIA")


def test_queue_preserves_complete_observations() -> None:
    row = sample_row()
    item = _row_to_item(row, "ebay-es", "ps4", {"collectedAt": "2026-09-16T00:00:00Z"})
    assert item is not None
    assert item["evidence"]["visualObservations"] == row["visualObservations"]
    bundle = item["physicalEvidenceBundle"]
    assert not validate_physical_evidence_bundle(bundle)
    assert bundle["observations"][0]["component"] == "UNKNOWN_COMPONENT"
    assert bundle["observations"][1]["component"] == "DISC"
    assert {row["value"] for row in bundle["identifiers"]} == {"3307211234567", "CUSA-12345"}


def test_bundle_hashes_are_deterministic_and_sensitive() -> None:
    item = {
        "id": "review-1", "source": "ebay-es", "platformSlug": "ps4", "listingTitle": "Game PS4",
        "candidateCatalogId": "ps4-game", "targetRegion": "PAL España", "detectedRegion": "PAL España",
        "condition": "loose", "priceEur": 20, "evidence": {"regionEvidence": ["distributor_regional"]},
    }
    first = build_physical_evidence_bundle(item, queue_version="v1")
    second = build_physical_evidence_bundle(item, queue_version="v1")
    changed = build_physical_evidence_bundle({**item, "priceEur": 21}, queue_version="v1")
    assert first["inputHash"] == second["inputHash"]
    assert first["inputHash"] != changed["inputHash"]


def test_common_contract_hash_fixture() -> None:
    fixture = json.loads((ROOT / "scripts" / "fixtures" / "review-curator-contract-item.json").read_text(encoding="utf-8"))
    bundle = build_physical_evidence_bundle(fixture, queue_version="contract-v1")
    assert bundle["inputHash"] == "6a07b31cab1db0dc8136d8f017894aaacdf8c023610f516b38ae78f8523e952b"
    assert bundle["evidenceHash"] == "0a6c2bbc19e52d802e63cc10d4b3c76865645a2144520df84c9244975ce4f599"


def test_generic_distributor_does_not_bind_market() -> None:
    row = sample_row()
    row["regionEvidence"] = []
    row["visualObservations"][0]["distributors"] = ["Ubisoft"]
    item = _row_to_item(row, "ebay-es", "ps4", {"collectedAt": "2026-09-16T00:00:00Z"})
    assert item is not None
    assert item["physicalEvidenceBundle"]["regional"]["marketBinding"] == "UNBOUND"


def test_terminal_curator_statuses_are_not_overwritten() -> None:
    for status in ("accepted", "rerouted", "rejected", "deferred", "proposed_variant"):
        old = {"schemaVersion": 1, "items": [{"id": "x", "status": status, "updatedAt": "2026-01-02"}], "decisions": []}
        new = {"schemaVersion": 1, "items": [{"id": "x", "status": "pending", "updatedAt": "2026-01-03"}], "decisions": []}
        assert merge_price_review_queue_documents(old, new)["items"][0]["status"] == status


if __name__ == "__main__":
    test_component_mapping()
    test_queue_preserves_complete_observations()
    test_bundle_hashes_are_deterministic_and_sensitive()
    test_common_contract_hash_fixture()
    test_generic_distributor_does_not_bind_market()
    test_terminal_curator_statuses_are_not_overwritten()
    print("OK review curator bridge")
