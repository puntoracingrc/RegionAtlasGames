#!/usr/bin/env python3
"""Contrato seguro de una tanda Wallapop limitada por IDs de catálogo."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import admin_price_collect  # noqa: E402
import pc_sftp_worker  # noqa: E402
from collectors import common  # noqa: E402


def expect_system_exit(callback, text: str) -> None:
    try:
        callback()
    except SystemExit as exc:
        assert text.lower() in str(exc).lower(), str(exc)
    else:
        raise AssertionError(f"Se esperaba SystemExit con: {text}")


def main() -> None:
    assert admin_price_collect.normalize_catalog_ids(
        ["ps4-alpha", "ps4-alpha", "ps4-beta", "ps4-collector%27s-&amp;-edition"]
    ) == [
        "ps4-alpha",
        "ps4-beta",
        "ps4-collector%27s-&amp;-edition",
    ]
    expect_system_exit(
        lambda: admin_price_collect.normalize_catalog_ids([f"ps4-game-{index}" for index in range(21)]),
        "máximo 20",
    )

    args = pc_sftp_worker.build_admin_collect_args(
        {
            "mode": "wallapop_batch",
            "catalogIds": ["ps4-alpha", "ps4-beta"],
        },
        Path("status.json"),
    )
    assert "--catalog-ids-json" in args
    encoded = args[args.index("--catalog-ids-json") + 1]
    assert json.loads(encoded) == ["ps4-alpha", "ps4-beta"]

    with tempfile.TemporaryDirectory(prefix="wallapop-batch-test-") as temporary:
        temp = Path(temporary)
        catalog_file = temp / "catalog.json"
        catalog = [
            {
                "id": "ps4-alpha",
                "title": "Alpha",
                "platformSlug": "ps4",
                "region": "PAL España",
                "listingStatus": "listed",
                "priceRegionVerified": True,
            },
            {
                "id": "ps4-beta",
                "title": "Beta",
                "platformSlug": "ps4",
                "region": "PAL España",
                "listingStatus": "listed",
            },
            {
                "id": "ps5-other",
                "title": "Other",
                "platformSlug": "ps5",
                "region": "PAL España",
                "listingStatus": "listed",
            },
        ]
        catalog_file.write_text(json.dumps(catalog), encoding="utf-8")

        old_common_catalog = common.CATALOG_FILE
        old_admin_catalog = admin_price_collect.CATALOG_FILE
        old_ids = os.environ.get("PRICE_COLLECT_CATALOG_IDS")
        old_id = os.environ.get("PRICE_COLLECT_CATALOG_ID")
        try:
            common.CATALOG_FILE = catalog_file
            admin_price_collect.CATALOG_FILE = catalog_file
            os.environ["PRICE_COLLECT_CATALOG_IDS"] = json.dumps(["ps4-beta", "ps4-alpha"])
            os.environ.pop("PRICE_COLLECT_CATALOG_ID", None)
            selected = common.platform_catalog_games("ps4")
            assert [game["id"] for game in selected] == ["ps4-alpha", "ps4-beta"]

            result_path = temp / "catalog-price-results.json"
            admin_price_collect.write_wallapop_result(
                result_path,
                job_id="wallapop-batch-test",
                platform_slug="ps4",
                searched_catalog_ids=["ps4-alpha"],
                result_catalog_ids=["ps4-alpha", "ps4-beta"],
                verified_catalog_ids=["ps4-alpha"],
                priced_catalog_ids=["ps4-alpha"],
            )
            result = json.loads(result_path.read_text(encoding="utf-8"))
            assert result["source"] == "wallapop"
            assert [game["id"] for game in result["games"]] == ["ps4-alpha", "ps4-beta"]
            assert result["verifiedCatalogIds"] == ["ps4-alpha"]
            assert result["pricedCatalogIds"] == ["ps4-alpha"]

            after_catalog = [
                {**catalog[0], "recommendedPrice": 25.0},
                {**catalog[1], "recommendedPrice": 18.0, "priceRegionVerified": False},
                catalog[2],
            ]
            assert admin_price_collect.verified_changed_catalog_ids(
                catalog,
                after_catalog,
                ["ps4-alpha", "ps4-beta"],
            ) == ["ps4-alpha"]
            assert admin_price_collect.verified_price_catalog_ids(
                after_catalog,
                ["ps4-alpha", "ps4-beta"],
            ) == ["ps4-alpha"]
            diagnostics = admin_price_collect.price_decision_diagnostics(
                [
                    {
                        "catalogId": "ps4-alpha",
                        "acceptedListings": 3,
                        "verifiedListings": 3,
                        "matchedCatalogIds": ["ps4-alpha"],
                    },
                    {
                        "catalogId": "ps4-beta",
                        "acceptedListings": 2,
                        "verifiedListings": 2,
                        "matchedCatalogIds": ["ps4-beta"],
                    },
                ],
                changed_catalog_ids=["ps4-alpha"],
                priced_catalog_ids=["ps4-alpha"],
            )
            assert diagnostics[0]["priceDecision"] == "price_changed"
            assert diagnostics[1]["priceDecision"] == "awaiting_more_verified_listings"

            tracked = temp / "tracked.json"
            tracked.write_bytes(b"before\n")
            old_mutation_files = admin_price_collect.SCOPED_PRICE_MUTATION_FILES
            try:
                admin_price_collect.SCOPED_PRICE_MUTATION_FILES = (tracked, temp / "missing.json")
                snapshot = admin_price_collect.snapshot_scoped_price_files()
                tracked.write_bytes(b"after\n")
                (temp / "missing.json").write_bytes(b"created\n")
                admin_price_collect.restore_scoped_price_files(snapshot)
                assert tracked.read_bytes() == b"before\n"
                assert not (temp / "missing.json").exists()
            finally:
                admin_price_collect.SCOPED_PRICE_MUTATION_FILES = old_mutation_files
        finally:
            common.CATALOG_FILE = old_common_catalog
            admin_price_collect.CATALOG_FILE = old_admin_catalog
            if old_ids is None:
                os.environ.pop("PRICE_COLLECT_CATALOG_IDS", None)
            else:
                os.environ["PRICE_COLLECT_CATALOG_IDS"] = old_ids
            if old_id is None:
                os.environ.pop("PRICE_COLLECT_CATALOG_ID", None)
            else:
                os.environ["PRICE_COLLECT_CATALOG_ID"] = old_id

    print("OK Wallapop batch job")


if __name__ == "__main__":
    main()
