#!/usr/bin/env python3
"""Regression checks for exact-listing gallery acquisition and binding."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.ebay_client import hydrate_ebay_item  # noqa: E402
from collectors.listing_evidence import (  # noqa: E402
    acquire_listing_snapshot,
    bound_observation,
    classify_images,
    diagnose_evidence_stage,
    listing_component_coverage,
    plan_high_detail_images,
)
from collectors.listing_images import curator_ebay_image_records, ebay_image_identity  # noqa: E402


def fake_jpeg(seed: bytes) -> bytes:
    # Hash/content dedupe does not require a decodable image; dimensions are optional.
    return b"\xff\xd8\xff\xdb" + seed + b"\xff\xd9"


def test_exact_item_hydration_uses_official_item_route() -> None:
    payload = {
        "itemId": "v1|123|0", "legacyItemId": "123", "title": "Game PS4",
        "image": {"imageUrl": "https://i.ebayimg.com/images/g/a/s-l1600.jpg"},
        "additionalImages": [{"imageUrl": "https://i.ebayimg.com/images/g/b/s-l1600.jpg"}],
        "thumbnailImages": [{"imageUrl": "https://i.ebayimg.com/images/g/a/s-l225.jpg"}],
        "localizedAspects": [{"name": "EAN", "value": "1234567890123"}],
    }
    with patch("collectors.ebay_client._fetch", return_value=(200, json.dumps(payload))) as fetch:
        row = hydrate_ebay_item("v1|123|0", access_token="token")
    assert "%7C" in fetch.call_args.args[0]
    assert row["legacyItemId"] == "123"
    assert len(row["images"]) == 3
    assert row["aspects"]["EAN"] == ["1234567890123"]


def test_api_variants_are_deduplicated_without_inventing_url() -> None:
    product = {"images": [
        {"url": "https://i.ebayimg.com/images/g/a/s-l225.jpg", "kind": "THUMBNAIL"},
        {"url": "https://i.ebayimg.com/images/g/a/s-l1600.jpg", "kind": "PRIMARY"},
        {"url": "https://i.ebayimg.com/images/g/b/s-l1600.jpg", "kind": "ADDITIONAL"},
    ]}
    rows = curator_ebay_image_records(product)
    assert len(rows) == 2
    assert rows[0]["resolvedUrl"].endswith("s-l1600.jpg")
    assert ebay_image_identity(product["images"][0]["url"]) == ebay_image_identity(product["images"][1]["url"])


def test_snapshot_deduplicates_content_and_never_marks_public() -> None:
    product = {"itemId": "v1|123|0", "title": "Game", "images": [
        {"url": "https://i.ebayimg.com/images/g/a/s-l1600.jpg", "kind": "PRIMARY"},
        {"url": "https://i.ebayimg.com/images/g/b/s-l1600.jpg", "kind": "ADDITIONAL"},
        {"url": "https://i.ebayimg.com/images/g/c/s-l1600.jpg", "kind": "ADDITIONAL"},
    ]}

    def download(url: str):
        data = fake_jpeg(b"same" if "/a/" in url or "/b/" in url else b"different")
        return data, "image/jpeg", url

    with tempfile.TemporaryDirectory() as directory:
        snapshot = acquire_listing_snapshot(product, cache_dir=Path(directory), downloader=download, captured_at="2026-01-01T00:00:00Z")
    assert snapshot["imagesAvailableFromSource"] == 3
    assert snapshot["imagesPreserved"] == 2
    assert all(row["listingId"] == "v1|123|0" for row in snapshot["images"])
    assert all(row["publicationAllowed"] is False for row in snapshot["images"])


def test_component_planner_and_binding_are_listing_specific() -> None:
    snapshot = {
        "listingId": "v1|123|0", "imagesAvailableFromSource": 3, "imagesPreserved": 3,
        "images": [
            {"imageIndex": 1, "contentHash": "a" * 64, "width": 1600, "height": 1200},
            {"imageIndex": 2, "contentHash": "b" * 64, "width": 1600, "height": 1200},
            {"imageIndex": 3, "contentHash": "c" * 64, "width": 1600, "height": 1200},
        ],
    }
    answers = iter([
        {"subject": "TARGET_LISTING_SPECIMEN", "component": "OUTER_PACKAGE_FRONT", "confidence": .99},
        {"subject": "TARGET_LISTING_SPECIMEN", "component": "OUTER_PACKAGE_BACK", "confidence": .98},
        {"subject": "FIGURE", "component": "ACCESSORY", "confidence": .97},
    ])
    classified = classify_images(snapshot, classifier=lambda _: next(answers))
    coverage = listing_component_coverage(classified)
    assert coverage["components"]["OUTER_PACKAGE_BACK"] is True
    assert plan_high_detail_images(classified, platform="ps4", evidence_gaps=["MISSING_MARKET_PROOF"])[0] == 2
    observation = bound_observation(snapshot, classified[1], {"barcodes": ["3307211234567"], "visibleText": ["Distribuido por X España"], "confidence": .95})
    assert observation["listingId"] == snapshot["listingId"]
    assert observation["component"] == "OUTER_PACKAGE_BACK"
    assert diagnose_evidence_stage(snapshot, classified, [observation], market_bound=True, resolved=True) == "RESOLVED"
    wrong = {**classified[1], "listingId": "v1|999|0"}
    try:
        bound_observation(snapshot, wrong, {})
        raise AssertionError("cross-attribution was accepted")
    except ValueError as exc:
        assert str(exc) == "LISTING_IMAGE_CROSS_ATTRIBUTION"


def test_component_planner_prefers_coverage_before_duplicate_views() -> None:
    rows = [
        {"imageIndex": 1, "subject": "TARGET_LISTING_SPECIMEN", "component": "CARTRIDGE_FRONT", "confidence": .99},
        {"imageIndex": 2, "subject": "TARGET_LISTING_SPECIMEN", "component": "CARTRIDGE_FRONT", "confidence": .98},
        {"imageIndex": 3, "subject": "TARGET_LISTING_SPECIMEN", "component": "CARTRIDGE_FRONT", "confidence": .97},
        {"imageIndex": 4, "subject": "TARGET_LISTING_SPECIMEN", "component": "MANUAL_FRONT", "confidence": .90},
        {"imageIndex": 5, "subject": "TARGET_LISTING_SPECIMEN", "component": "OUTER_PACKAGE_BACK", "confidence": .90},
    ]
    selected = plan_high_detail_images(rows, platform="n64", evidence_gaps=["CONDITION"], max_images=3)
    assert set(selected) == {1, 4, 5}


if __name__ == "__main__":
    test_exact_item_hydration_uses_official_item_route()
    test_api_variants_are_deduplicated_without_inventing_url()
    test_snapshot_deduplicates_content_and_never_marks_public()
    test_component_planner_and_binding_are_listing_specific()
    test_component_planner_prefers_coverage_before_duplicate_views()
    print("OK listing evidence acquisition")
