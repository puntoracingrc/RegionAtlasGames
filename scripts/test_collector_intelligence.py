#!/usr/bin/env python3
"""La memoria comparte hechos por ficha, pero nunca consultas entre fuentes."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.collector_intelligence import (  # noqa: E402
    _load_learning_file,
    apply_collector_game_context,
    build_collector_learning_snapshot,
    collector_game_learning,
    collector_source_policy,
    learned_source_queries,
)
from collectors.common import build_ebay_search_queries, build_search_queries  # noqa: E402
from collectors.game_content_profile import game_content_profile  # noqa: E402
from collectors.game_region_learning import game_region_profile  # noqa: E402
from collectors.wallapop_client import wallapop_search_queries  # noqa: E402


def main() -> None:
    catalog_id = "ps4-example-&amp;-game"
    queue = {
        "items": [
            {
                "id": "wallapop-ok",
                "status": "accepted",
                "source": "wallapop",
                "catalogId": catalog_id,
                "listingTitle": "private seller title",
                "evidence": {
                    "url": "https://example.test/private-listing",
                    "description": "private seller description",
                    "imageUrls": ["https://cdn.example.test/front.jpg"],
                    "regionEvidence": ["cover_spain"],
                    "searchQuery": "Example Game ps4",
                },
                "decidedAt": "2026-08-30T10:00:00Z",
                "decision": {
                    "action": "accept",
                    "catalogId": catalog_id,
                    "region": "PAL España",
                    "condition": "complete",
                    "note": "Contraportada española comprobada.",
                    "originalContents": [],
                },
            },
            {
                "id": "ebay-ok",
                "status": "accepted",
                "source": "ebay-es",
                "catalogId": catalog_id,
                "evidence": {"searchQuery": "Example Game"},
                "decidedAt": "2026-08-30T11:00:00Z",
                "decision": {
                    "action": "accept",
                    "catalogId": catalog_id,
                    "region": "PAL España",
                    "condition": "sealed",
                },
            },
            {
                "id": "rejected",
                "status": "rejected",
                "source": "wallapop",
                "catalogId": catalog_id,
                "evidence": {"searchQuery": "wrong query"},
                "decision": {"action": "reject", "catalogId": catalog_id},
            },
        ]
    }
    snapshot = build_collector_learning_snapshot(
        queue,
        updated_at="2026-08-30T12:00:00Z",
    )
    serialized = json.dumps(snapshot, ensure_ascii=False)
    assert "private seller title" not in serialized
    assert "private seller description" not in serialized
    assert "private-listing" not in serialized
    assert "wrong query" not in serialized

    with tempfile.TemporaryDirectory(prefix="collector-learning-") as temp_dir:
        learning_file = Path(temp_dir) / "collector-learning.json"
        learning_file.write_text(
            json.dumps(snapshot, ensure_ascii=False),
            encoding="utf-8",
        )
        previous = os.environ.get("PRICE_COLLECTOR_LEARNING_FILE")
        os.environ["PRICE_COLLECTOR_LEARNING_FILE"] = str(learning_file)
        _load_learning_file.cache_clear()
        try:
            learned = collector_game_learning(catalog_id)
            assert learned["manualExpected"] is False
            assert learned["originalContentsExpected"] == []
            assert learned_source_queries(catalog_id, "wallapop") == ["Example Game ps4"]
            assert learned_source_queries(catalog_id, "ebay-es") == ["Example Game"]
            assert learned_source_queries(catalog_id, "cex") == []

            game = {
                "id": catalog_id,
                "title": "Example Game",
                "platformSlug": "ps4",
                "region": "PAL España",
            }
            assert wallapop_search_queries(game) == [
                "Example Game ps4",
                "Example Game playstation 4",
                "Example Game",
            ]
            assert build_ebay_search_queries(game) == ["Example Game"]
            assert build_search_queries(game, source="cex") == ["Example Game"]

            content = game_content_profile(game)
            assert content["manualExpected"] is False
            assert content["originalContentsExpected"] == []
            assert content["manualExpectationSource"] == "approved_collector_memory"
            profile = game_region_profile(catalog_id)
            assert profile and profile["approvedExamples"][0]["region"] == "PAL España"

            row = apply_collector_game_context({"catalogId": catalog_id}, game, "ebay-es")
            assert row["manualExpected"] is False
            assert row["originalContentsExpected"] == []
            assert collector_source_policy("wallapop")["imageLimit"] == 12
            assert collector_source_policy("ebay-es")["imageLimit"] == 3
            assert collector_source_policy("cex")["queryMode"] == "retail_title_then_same_source_hint"

            learning_file.write_text(
                json.dumps({**snapshot, "policyVersion": "future-policy"}),
                encoding="utf-8",
            )
            _load_learning_file.cache_clear()
            assert collector_game_learning(catalog_id) == {}
        finally:
            if previous is None:
                os.environ.pop("PRICE_COLLECTOR_LEARNING_FILE", None)
            else:
                os.environ["PRICE_COLLECTOR_LEARNING_FILE"] = previous
            _load_learning_file.cache_clear()

    print("OK: memoria común aprobada con políticas y consultas aisladas por fuente")


if __name__ == "__main__":
    main()
