#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import collectors.price_review_queue as review_queue
import sync_es_prices as sync_module
from collect_ebay_es import process_ebay_item
from collectors.price_review_queue import _row_to_item
from collectors.regional_variant_routing import (
    canonical_region_key,
    resolve_regional_route,
    strict_regions_match,
)
from sync_es_prices import catalog_game_in_write_scope

ROOT = Path(__file__).resolve().parents[1]


def game(
    catalog_id: str,
    region: str,
    *,
    slug: str = "example-game",
    edition: str = "standard",
) -> dict:
    return {
        "id": catalog_id,
        "slug": slug,
        "title": "Example Game",
        "titlePc": "Example Game",
        "platformSlug": "ps4",
        "region": region,
        "edition": edition,
        "physicalVariant": None,
        "listingStatus": "listed",
    }


def report() -> dict:
    return {
        "skippedAuctions": 0,
        "listingCacheHits": 0,
        "skippedReference": 0,
        "skippedRules": 0,
        "skippedTitle": 0,
        "matchedReference": 0,
    }


def item(title: str, *, origin: str = "ES") -> dict:
    return {
        "itemId": f"item-{abs(hash(title))}",
        "title": title,
        "priceEur": 35,
        "url": "https://www.ebay.es/itm/example",
        "imageUrl": "https://i.ebayimg.com/example.jpg",
        "shippingEur": 8,
        "estimatedTotalToSpainEur": 43,
        "originCountry": origin,
        "marketplaceId": "EBAY_ES",
        "destinationCountry": "ES",
    }


def assert_cross_region_sync_is_allowlisted() -> None:
    with tempfile.TemporaryDirectory(prefix="region-atlas-routing-test-") as temp_dir:
        temp = Path(temp_dir)
        source_paths = {
            "catalog.json": ROOT / "data" / "catalog.json",
            "platforms.json": ROOT / "data" / "platforms.json",
            "state.json": ROOT / "data" / "price-sync-state.json",
        }
        for name, source in source_paths.items():
            (temp / name).write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

        base_row = {
            "catalogId": "ps4-japon-13-sentinels-aegis-rim",
            "source": "ebay-es",
            "listingType": "active",
            "title": "13 Sentinels PS4 Japan",
            "listingRegion": "Japón",
            "regionVerified": True,
            "regionEvidence": ["cover_japan", "photo_region_mark", "cover_vision"],
            "aiConfidence": 0.97,
            "condition": "complete",
        }
        ingest = {
            "platformSlug": "ps4",
            "region": "PAL España",
            "collectedAt": "2026-08-28T12:00:00Z",
            "listings": [
                {
                    **base_row,
                    "priceEur": price,
                    "externalId": f"integration-jp-{index}",
                }
                for index, price in enumerate((38, 40, 42), start=1)
            ],
            "regionalCandidates": [],
            "cex": [],
        }
        ingest_file = temp / "ingest.json"
        ids_file = temp / "ids.json"
        ingest_file.write_text(json.dumps(ingest), encoding="utf-8")
        ids_file.write_text(
            json.dumps([
                "ps4-13-sentinels-aegis-rim",
                "ps4-japon-13-sentinels-aegis-rim",
            ]),
            encoding="utf-8",
        )
        argv = [
            "sync_es_prices.py",
            "--platform",
            "ps4",
            "--region",
            "PAL España",
            "--input",
            str(ingest_file),
            "--catalog-ids-file",
            str(ids_file),
            "--allow-cross-region-catalog-ids",
            "--no-advance-rotation",
            "--no-vision",
            "--dry-run",
        ]
        output = io.StringIO()
        with (
            patch.object(sync_module, "CATALOG_FILE", temp / "catalog.json"),
            patch.object(sync_module, "PLATFORMS_FILE", temp / "platforms.json"),
            patch.object(sync_module, "STATE_FILE", temp / "state.json"),
            patch.object(sync_module, "META_FILE", temp / "meta.json"),
            patch.object(review_queue, "QUEUE_FILE", temp / "queue.json"),
            patch.object(sys, "argv", argv),
            contextlib.redirect_stdout(output),
        ):
            sync_module.main()

        result = output.getvalue()
        assert "Objetivo catálogo: 2 juegos" in result
        assert "eBay actualizado (P2P): 1" in result
        assert "Región distinta al catálogo: 0" in result
        assert "Dry-run: no se escriben archivos." in result
        assert (temp / "catalog.json").read_text(encoding="utf-8") == source_paths[
            "catalog.json"
        ].read_text(encoding="utf-8")


def main() -> None:
    target = game("ps4-example", "PAL España")
    japan = game("ps4-japon-example", "Japón")
    usa = game("ps4-usa-example", "USA")
    games = [target, japan, usa]
    by_id = {row["id"]: row for row in games}

    assert canonical_region_key("JAPAN") == "japan"
    assert strict_regions_match("JAPAN", "Japón")
    assert not strict_regions_match("PAL Europa", "PAL España")

    routed_japan = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 NTSC-J Japanese version",
        origin_country="ES",
        platform_games=games,
        ref_to_ids={},
    )
    assert routed_japan.kind == "route"
    assert routed_japan.destination_catalog_id == japan["id"]
    assert routed_japan.proof == "title"

    routed_usa = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 NTSC-U USA ESRB",
        origin_country="ES",
        platform_games=games,
        ref_to_ids={},
    )
    assert routed_usa.kind == "route"
    assert routed_usa.destination_catalog_id == usa["id"]

    seller_hint = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4",
        origin_country="JP",
        platform_games=games,
        ref_to_ids={},
    )
    assert seller_hint.kind == "review"
    assert seller_hint.reason == "seller_origin_hint_only"
    assert seller_hint.origin_region_hint == "Japón"
    assert seller_hint.alternatives == (japan["id"],)

    generic_pal = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 PAL complete",
        origin_country="ES",
        platform_games=games,
        ref_to_ids={},
    )
    assert generic_pal.kind == "review"
    assert generic_pal.detected_region == "PAL Europa"
    assert generic_pal.reason == "regional_variant_missing"

    duplicate_japan = game("ps4-japon-example-alt", "JAPAN")
    ambiguous = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 Japan",
        origin_country="JP",
        platform_games=[*games, duplicate_japan],
        ref_to_ids={},
    )
    assert ambiguous.kind == "review"
    assert ambiguous.reason == "regional_variant_ambiguous"

    reference_route = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 SLPS-12345",
        origin_country="ES",
        platform_games=games,
        ref_to_ids={"SLPS-12345": [japan["id"]]},
    )
    assert reference_route.kind == "route"
    assert reference_route.destination_catalog_id == japan["id"]
    assert reference_route.proof == "reference"

    wrong_game_reference = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 Japan SLPS-99999",
        origin_country="JP",
        platform_games=games,
        ref_to_ids={"SLPS-99999": ["ps4-japon-different-game"]},
    )
    assert wrong_game_reference.kind == "reject"
    assert wrong_game_reference.reason == "reference_other_game"

    conflicting = resolve_regional_route(
        target=target,
        listing_title="Example Game PS4 Japan USA",
        origin_country="JP",
        platform_games=games,
        ref_to_ids={},
    )
    assert conflicting.kind == "review"
    assert conflicting.reason == "regional_signal_conflict"
    assert conflicting.detected_region is None

    with patch(
        "collectors.listing_region_enrich.enrich_listing_region_from_cover",
        return_value=(
            "Japón",
            ["cover_japan", "photo_region_mark", "cover_vision"],
            0.97,
            True,
            "complete",
            ["cover_vision_verified"],
        ),
    ):
        processed = process_ebay_item(
            item("Example Game PS4 Japan"),
            game=target,
            platform_slug="ps4",
            catalog_id=target["id"],
            catalog_region=target["region"],
            regional_family_games=games,
            catalog_by_id=by_id,
            ref_to_ids={},
            use_listing_cache=False,
            report=report(),
        )
    assert processed and processed.rerouted and not processed.review_only
    assert processed.row["catalogId"] == japan["id"]
    assert processed.row["regionalReroutedFromCatalogId"] == target["id"]

    with patch.dict(os.environ, {"REGION_VISION_DISABLED": "1"}):
        hinted = process_ebay_item(
            item("Example Game PS4", origin="JP"),
            game=target,
            platform_slug="ps4",
            catalog_id=target["id"],
            catalog_region=target["region"],
            regional_family_games=games,
            catalog_by_id=by_id,
            ref_to_ids={},
            use_listing_cache=False,
            report=report(),
        )
    assert hinted and hinted.review_only and not hinted.rerouted
    assert hinted.row["candidateCatalogId"] == japan["id"]
    assert hinted.row["regionVerified"] is False
    assert hinted.row["regionReviewReason"] == "seller_origin_hint_only"

    review_item = _row_to_item(
        hinted.row,
        "ebay-es",
        "ps4",
        {"region": "PAL España", "collectedAt": "2026-08-28T10:00:00Z"},
    )
    assert review_item
    assert review_item["catalogId"] is None
    assert review_item["candidateCatalogId"] == japan["id"]
    assert review_item["evidence"]["searchedCatalogId"] == target["id"]

    selected = {target["id"], japan["id"]}
    assert catalog_game_in_write_scope(
        target,
        platform_slug="ps4",
        region="PAL España",
        selected_catalog_ids=selected,
        allow_cross_region_catalog_ids=True,
    )
    assert catalog_game_in_write_scope(
        japan,
        platform_slug="ps4",
        region="PAL España",
        selected_catalog_ids=selected,
        allow_cross_region_catalog_ids=True,
    )
    assert not catalog_game_in_write_scope(
        japan,
        platform_slug="ps4",
        region="PAL España",
        selected_catalog_ids=selected,
        allow_cross_region_catalog_ids=False,
    )
    assert not catalog_game_in_write_scope(
        usa,
        platform_slug="ps4",
        region="PAL España",
        selected_catalog_ids=selected,
        allow_cross_region_catalog_ids=True,
    )

    assert_cross_region_sync_is_allowlisted()

    print("OK: eBay regional rerouting is strict, confirmed and review-safe")


if __name__ == "__main__":
    main()
