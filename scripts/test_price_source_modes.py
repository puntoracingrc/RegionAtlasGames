#!/usr/bin/env python3
from __future__ import annotations

import os

from collectors import platform_sources as ps
from daily_price_ingest import runnable_sources


def with_document(document):
    ps._cache = document


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def main() -> None:
    os.environ["PRICE_SOURCES_DISABLE_REMOTE_READ"] = "1"
    os.environ.pop("ENABLE_EBAY_PRICE_WHEEL", None)
    with_document(
        {
            "platforms": {"ps4": {"cex": ["100"]}},
            "collectorSettings": {
                "sources": {
                    "wallapop": {"enabled": True, "enabledManual": True, "enabledRotation": False},
                    "cex": {"enabled": True, "enabledManual": False, "enabledRotation": True},
                    "vinted": {"enabled": False},
                },
                "customSources": [
                    {
                        "id": "manual-shop",
                        "enabled": True,
                        "enabledManual": True,
                        "enabledRotation": False,
                        "status": "active",
                        "strategy": "platform_routes",
                        "platformRoutes": {"ps4": "https://example.test/ps4"},
                    },
                    {
                        "id": "rotation-shop",
                        "enabled": True,
                        "enabledManual": False,
                        "enabledRotation": True,
                        "status": "active",
                        "strategy": "platform_routes",
                        "platformRoutes": {"ps4": "https://example.test/ps4"},
                    },
                    {
                        "id": "legacy-shop",
                        "enabled": False,
                        "status": "active",
                        "strategy": "platform_routes",
                        "platformRoutes": {"ps4": "https://example.test/ps4"},
                    },
                ],
            },
        }
    )

    assert_equal(ps.collector_enabled("wallapop", mode="manual"), True, "wallapop manual")
    assert_equal(ps.collector_enabled("wallapop", mode="automatic"), False, "wallapop rotation")
    assert_equal(ps.collector_enabled("cex", mode="manual"), False, "cex manual")
    assert_equal(ps.collector_enabled("cex", mode="automatic"), True, "cex rotation")
    assert_equal(ps.collector_enabled("vinted", mode="manual"), False, "legacy disabled manual")
    assert_equal(ps.collector_enabled("vinted", mode="automatic"), False, "legacy disabled rotation")

    assert_equal(ps.generic_source_enabled("manual-shop", "ps4", mode="manual"), True, "generic manual on")
    assert_equal(ps.generic_source_enabled("manual-shop", "ps4", mode="automatic"), False, "generic manual off rotation")
    assert_equal(ps.generic_source_enabled("rotation-shop", "ps4", mode="manual"), False, "generic rotation off manual")
    assert_equal(ps.generic_source_enabled("rotation-shop", "ps4", mode="automatic"), True, "generic rotation on")
    assert_equal(ps.generic_source_enabled("legacy-shop", "ps4", mode="manual"), False, "generic legacy off manual")
    assert_equal(ps.generic_source_enabled("legacy-shop", "ps4", mode="automatic"), False, "generic legacy off rotation")
    assert_equal(
        [source for source, _path in runnable_sources("ps4")],
        ["cex", "generic:rotation-shop"],
        "daily runnable sources only include rotation mode",
    )

    with_document(
        {
            "platforms": {"ps4": {"cex": ["100"]}},
            "collectorSettings": {
                "sources": {
                    "wallapop": {"enabled": False, "enabledManual": False, "enabledRotation": False},
                    "cex": {"enabled": False, "enabledManual": False, "enabledRotation": False},
                },
                "customSources": [],
            },
        }
    )
    assert_equal(runnable_sources("ps4"), [], "paused rotation has no runnable collectors")

    merged = ps._newest_document(
        {
            "platforms": {
                "ps4": {"todoconsolas": ["28-juegos-ps4"]},
                "ps5": {"todoconsolas": ["359-juegos-ps5"]},
            },
            "collectorSettings": {"updatedAt": "2026-01-01T00:00:00Z", "sources": {}},
        },
        {
            "platforms": {"ps4": {"todoconsolas": ["old-ps4"]}},
            "collectorSettings": {
                "updatedAt": "2026-08-29T00:00:00Z",
                "sources": {"todoconsolas": {"enabledManual": False, "enabledRotation": False}},
            },
        },
    )
    assert_equal(merged["platforms"]["ps4"]["todoconsolas"], ["28-juegos-ps4"], "local platform registry wins")
    assert_equal(merged["platforms"]["ps5"]["todoconsolas"], ["359-juegos-ps5"], "new local platform survives")
    assert_equal(
        merged["collectorSettings"]["sources"]["todoconsolas"]["enabledRotation"],
        False,
        "newest remote switches survive",
    )

    ps._cache = None
    print("OK price source manual/rotation modes")


if __name__ == "__main__":
    main()
