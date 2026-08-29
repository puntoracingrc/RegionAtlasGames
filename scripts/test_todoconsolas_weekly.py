#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import collect_todoconsolas_weekly as weekly
import pc_sftp_worker
from collect_todoconsolas_weekly import (
    build_campaign_units,
    classify_products,
    merge_campaign_ingest,
    new_campaign_state,
    selected_platforms,
    state_needs_slice,
    write_campaign_summary,
)
from collectors.price_review_queue import _row_to_item
from collectors.tcns_client import TodoConsolasRequestError
from collectors.tcns_review_triage import build_tcns_triage_index
from pc_sftp_worker import publish_todoconsolas_weekly_disabled_status


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
        "productUrl": "https://www.todoconsolas.com/juegos-ps4/1-life-is-strange-2.html",
        "externalId": "1",
        **overrides,
    }


def main() -> None:
    platforms = selected_platforms("snes,switch2,ps5,ps4,neogeo,neogeocd")
    assert platforms[:3] == ["ps4", "ps5", "switch2"]
    units = build_campaign_units(platforms)
    shared = next(unit for unit in units if unit["categoryPath"] == "401-juegos-neogeo")
    assert shared["platformSlugs"] == ["neogeo", "neogeocd"]
    assert len([unit for unit in units if unit["categoryPath"] == "401-juegos-neogeo"]) == 1

    now = datetime(2026, 8, 29, 10, 0, tzinfo=timezone.utc)
    state = new_campaign_state(
        platforms,
        interval_days=7,
        pages_per_run=2,
        delay_seconds=6,
        jitter_seconds=2,
        moment=now,
    )
    assert state["status"] == "running"
    assert state["settings"]["publishMode"] == "git_review_required"
    assert state_needs_slice(state, moment=now) is True
    waiting = {
        **state,
        "status": "ready_for_git",
        "nextDueAt": (now + timedelta(days=7)).isoformat(),
    }
    assert state_needs_slice(waiting, moment=now) is False
    assert state_needs_slice(waiting, moment=now + timedelta(days=8)) is True
    backoff = {
        **state,
        "status": "backoff",
        "blockedUntil": (now + timedelta(hours=24)).isoformat(),
    }
    assert state_needs_slice(backoff, moment=now) is False
    assert state_needs_slice(backoff, moment=now + timedelta(hours=25)) is True

    merged = merge_campaign_ingest(
        {
            "platformSlug": "ps4",
            "collectedAt": "2026-08-29T10:00:00Z",
            "tcns": [{"catalogId": "a", "retailPriceEur": 20}],
            "regionalCandidates": [{"productUrl": "https://example.test/a", "title": "A"}],
        },
        {
            "platformSlug": "ps4",
            "collectedAt": "2026-08-30T10:00:00Z",
            "tcns": [
                {"catalogId": "a", "retailPriceEur": 18},
                {"catalogId": "b", "retailPriceEur": 12},
            ],
            "regionalCandidates": [
                {"productUrl": "https://example.test/a", "title": "A actualizada"},
                {"productUrl": "https://example.test/b", "title": "B"},
            ],
        },
    )
    assert {row["catalogId"] for row in merged["tcns"]} == {"a", "b"}
    assert next(row for row in merged["tcns"] if row["catalogId"] == "a")["retailPriceEur"] == 18
    assert len(merged["regionalCandidates"]) == 2

    index = build_tcns_triage_index(
        [
            game(),
            game(id="ps5-life-is-strange-2", platformSlug="ps5"),
        ],
        {},
    )
    rows, counts = classify_products(
        [
            product(),
            product(
                title="Life Is Strange 2 PS4 (JP)",
                productUrl="https://www.todoconsolas.com/juegos-ps4/2-life-is-strange-2-jp.html",
                externalId="2",
            ),
            product(
                title="Juego Sin Ficha PS4 (SP)",
                productUrl="https://www.todoconsolas.com/juegos-ps4/3-juego-sin-ficha.html",
                externalId="3",
            ),
        ],
        ["ps4"],
        index,
        "2026-08-29T10:00:00Z",
    )
    assert counts["safe_exact"] == 1
    assert counts["regional_variant"] == 1
    assert counts["catalog_gap"] == 1
    assert len(rows["ps4"]["tcns"]) == 1
    assert len(rows["ps4"]["regionalCandidates"]) == 2
    regional_row = next(
        row for row in rows["ps4"]["regionalCandidates"] if row["triageBucket"] == "regional_variant"
    )
    queue_item = _row_to_item(
        regional_row,
        "todoconsolas",
        "ps4",
        {"platformSlug": "ps4", "region": "PAL España"},
    )
    assert queue_item is not None
    assert queue_item["triageBucket"] == "regional_variant"
    assert queue_item["triageReason"] == "catalog_region_not_exact"

    with tempfile.TemporaryDirectory() as tmp:
        output_root = Path(tmp)
        campaign_dir = output_root / str(state["campaignId"])
        ingest_dir = campaign_dir / "ingest"
        ingest_dir.mkdir(parents=True)
        (ingest_dir / "todoconsolas-ps4.json").write_text(
            json.dumps(
                {
                    "platformSlug": "ps4",
                    "tcns": [{"catalogId": "a"}],
                    "regionalCandidates": [{"productUrl": "https://example.test/review"}],
                }
            ),
            encoding="utf-8",
        )
        ready_state = {**state, "status": "ready_for_git", "completedAt": "2026-08-29T11:00:00Z"}
        summary = write_campaign_summary(ready_state, output_root)
        assert summary["totals"] == {"exactListings": 1, "reviewListings": 1, "platformsWithResults": 1}
        assert (campaign_dir / "ready-for-git.json").exists()

    original_collect = weekly.collect_category_pages
    try:
        weekly.collect_category_pages = lambda *_args, **_kwargs: (
            [],
            [{"categoryPath": "359-juegos-ps5", "page": 1, "lastPage": 1, "products": 0}],
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            completed = weekly.run_slice(
                state_path=root / "state.json",
                output_root=root / "campaigns",
                platforms_value="ps5",
                pages_per_run=1,
            )
            assert completed["status"] == "ready_for_git"
            assert completed["progress"]["unitsCompleted"] == 1
            assert completed["progress"]["pagesProcessed"] == 1
    finally:
        weekly.collect_category_pages = original_collect

    def blocked_collect(*_args, **_kwargs):
        raise TodoConsolasRequestError(
            "TodoConsolas bloqueó la petición con HTTP 429",
            status_code=429,
            retry_after="120",
        )

    try:
        weekly.collect_category_pages = blocked_collect
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            blocked_state = weekly.run_slice(
                state_path=root / "state.json",
                output_root=root / "campaigns",
                platforms_value="ps5",
                pages_per_run=1,
                backoff_hours=24,
            )
            assert blocked_state["status"] == "backoff"
            assert blocked_state["lastAction"] == "blocked_without_retry"
            assert blocked_state["units"][0]["nextPage"] == 1
            assert blocked_state["units"][0]["pagesProcessed"] == 0
            assert blocked_state["lastError"]["statusCode"] == 429
    finally:
        weekly.collect_category_pages = original_collect

    class FakeQueue:
        config = type("Config", (), {"runner_id": "test-pc"})()
        payload = None

        def remote(self, *parts):
            return "/".join(parts)

        def upload_bytes(self, _remote, payload):
            self.payload = json.loads(payload.decode("utf-8"))

    original_state = pc_sftp_worker.TODOCONSOLAS_WEEKLY_STATE
    original_marker = pc_sftp_worker.TODOCONSOLAS_WEEKLY_DISABLED_MARKER
    try:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pc_sftp_worker.TODOCONSOLAS_WEEKLY_STATE = root / "state.json"
            pc_sftp_worker.TODOCONSOLAS_WEEKLY_DISABLED_MARKER = root / "disabled.lock"
            pc_sftp_worker.TODOCONSOLAS_WEEKLY_STATE.write_text(
                json.dumps({"status": "ready_for_git", "campaignId": "test-campaign"}),
                encoding="utf-8",
            )
            fake_queue = FakeQueue()
            publish_todoconsolas_weekly_disabled_status(fake_queue)
            assert fake_queue.payload["enabled"] is False
            assert fake_queue.payload["status"] == "disabled"
            assert fake_queue.payload["previousStatus"] == "ready_for_git"
            assert fake_queue.payload["campaignId"] == "test-campaign"
            assert pc_sftp_worker.TODOCONSOLAS_WEEKLY_DISABLED_MARKER.exists()
    finally:
        pc_sftp_worker.TODOCONSOLAS_WEEKLY_STATE = original_state
        pc_sftp_worker.TODOCONSOLAS_WEEKLY_DISABLED_MARKER = original_marker

    print("OK TodoConsolas weekly engine")


if __name__ == "__main__":
    main()
