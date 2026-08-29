#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pc_sftp_worker
from collectors.catalog_match import CatalogMatchResult
from collectors.price_review_queue import _reason as review_reason
from collectors.price_review_queue import merge_price_review_queue_documents
from collectors.tcns_policy import (
    POLICY_VERSION,
    canonical_tcns_title,
    tcns_auto_match_decision,
    tcns_row_is_auto_approved,
)
from sync_es_prices import apply_tcns_row, collect_condition_observations
from daily_price_ingest import LIST_KEYS
from pc_sftp_worker import upload_price_review_queue_verified


def game(**overrides):
    return {
        "id": "ps4-life-is-strange-2",
        "title": "Life is Strange 2",
        "platformSlug": "ps4",
        "region": "PAL España",
        **overrides,
    }


def product(**overrides):
    return {
        "title": "Life Is Strange 2 PS4 (SP)",
        "priceEur": 11.95,
        "conditionRaw": "Segunda mano",
        "productUrl": "https://www.todoconsolas.com/juegos-ps4/1-life-is-strange-2-5021290082134.html",
        **overrides,
    }


def result(target=None, **overrides):
    return CatalogMatchResult(
        game=target or game(),
        match_method="title",
        match_score=0.714,
        margin=0.714,
        **overrides,
    )


def approved_row(**overrides):
    return {
        "catalogId": "ps4-life-is-strange-2",
        "source": "todoconsolas",
        "title": "Life Is Strange 2 PS4 (SP)",
        "priceEur": 11.95,
        "retailPriceEur": 11.95,
        "condition": "preowned",
        "listingRegion": "PAL España",
        "regionVerified": True,
        "regionEvidence": ["listing_title_region", "catalog_title_exact"],
        "matchMethod": "title",
        "matchScore": 0.714,
        "matchMargin": 0.714,
        "autoApproved": True,
        "acceptancePolicy": POLICY_VERSION,
        **overrides,
    }


def main() -> None:
    assert "regionalCandidates" in LIST_KEYS
    assert canonical_tcns_title("Life Is Strange 2 PS4 (SP)", "ps4") == "life is strange 2"
    assert canonical_tcns_title("Life is Strange 2", "ps4") == "life is strange 2"

    ok, reason = tcns_auto_match_decision(product(), result(), "ps4")
    assert ok is True
    assert reason == POLICY_VERSION

    ok, reason = tcns_auto_match_decision(
        product(title="Life Is Strange 2 PS4 (EU)"),
        result(),
        "ps4",
    )
    assert ok is False
    assert reason == "catalog_region_not_exact"

    ok, reason = tcns_auto_match_decision(
        product(title="Life Is Strange 2 Collector Edition PS4 (SP)"),
        result(),
        "ps4",
    )
    assert ok is False
    assert reason == "catalog_title_not_exact"

    changed_game = game(tcnsRetailPrice=10.0)
    ok, reason = tcns_auto_match_decision(product(priceEur=30.0), result(changed_game), "ps4")
    assert ok is False
    assert reason == "price_change_requires_review"

    target = game()
    row = approved_row()
    assert review_reason(row) is None
    assert tcns_row_is_auto_approved(row, target) is True
    assert apply_tcns_row(target, row, "2026-08-29T10:00:00Z") is True
    assert target["tcnsRetailPrice"] == 11.95

    observations = collect_condition_observations(
        target["id"],
        target["region"],
        "ps4",
        grouped={},
        cex_by_id={},
        jgo_by_id={},
        chollo_by_id={},
        kaoto_by_id={},
        tcns_by_id={target["id"]: {**row, "conditionRaw": "Segunda mano"}},
        tc_by_id={},
        catalog_game=target,
        use_vision=False,
    )
    assert observations == []

    merged_queue = merge_price_review_queue_documents(
        {
            "items": [
                {"id": "decided", "status": "accepted", "listingTitle": "Anterior"},
                {"id": "remote-only", "status": "pending", "listingTitle": "Remoto"},
            ],
            "decisions": [{"id": "decision-1"}],
        },
        {
            "items": [
                {"id": "decided", "status": "pending", "listingTitle": "No sobrescribir"},
                {"id": "local-only", "status": "pending", "listingTitle": "Nuevo"},
            ],
            "decisions": [],
        },
    )
    queue_by_id = {item["id"]: item for item in merged_queue["items"]}
    assert set(queue_by_id) == {"decided", "remote-only", "local-only"}
    assert queue_by_id["decided"]["status"] == "accepted"

    rejected_target = game()
    assert apply_tcns_row(rejected_target, {**row, "autoApproved": False}, "test") is False
    assert "tcnsRetailPrice" not in rejected_target

    class FakeQueue:
        payload = {"items": [{"id": "remote-review", "status": "pending"}], "decisions": []}

        def remote(self, *parts):
            return "/".join(parts)

        def upload_file(self, _remote, local_path):
            self.payload = json.loads(local_path.read_text(encoding="utf-8"))

        def exists(self, _remote):
            return True

        def read_json(self, _remote):
            return self.payload

    original_root = pc_sftp_worker.ROOT
    with tempfile.TemporaryDirectory() as tmp:
        pc_sftp_worker.ROOT = Path(tmp)
        review_file = Path(tmp) / "data" / "admin" / "price-review-queue.json"
        review_file.parent.mkdir(parents=True)
        review_file.write_text(json.dumps({"items": [{"id": "review-1"}]}), encoding="utf-8")
        try:
            assert upload_price_review_queue_verified(FakeQueue()) == 2
        finally:
            pc_sftp_worker.ROOT = original_root
    print("OK TodoConsolas exact price policy")


if __name__ == "__main__":
    main()
