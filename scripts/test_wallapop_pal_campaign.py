#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from wallapop_pal_campaign import (
    CONTROL_MODE,
    MAX_BATCH_SIZE,
    WallapopCampaignControlError,
    effective_settings,
    mark_batch_queued,
    new_state,
    normalize_control_request,
    public_state,
    reconcile_active_batch,
    select_next_batch,
)

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)


def control(action: str = "enable", **overrides: object) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "mode": CONTROL_MODE,
        "requestId": "wallapop-control-test",
        "requestedAt": "2026-08-30T12:00:00Z",
        "action": action,
        "platforms": ["ps4", "ps5", "ps3", "ps2", "ps1"],
        "batchSize": 20,
        "pauseMinutes": 10,
        "jitterMinutes": 3,
        **overrides,
    }


def game(index: int, *, platform: str = "ps4", region: str = "PAL España", excluded: bool = False) -> dict[str, object]:
    return {
        "id": f"{platform}-game-{index:02d}",
        "title": f"Game {index:02d}",
        "platformSlug": platform,
        "region": region,
        "listingStatus": "excluded" if excluded else "listed",
    }


def expect_control_error(payload: dict[str, object], text: str) -> None:
    try:
        normalize_control_request(payload)
    except WallapopCampaignControlError as exc:
        assert text.lower() in str(exc).lower(), str(exc)
    else:
        raise AssertionError(f"Se esperaba rechazo con: {text}")


def test_control_contract() -> None:
    normalized = normalize_control_request(control())
    assert normalized["enabled"] is True
    assert normalized["batchSize"] == MAX_BATCH_SIZE
    assert normalized["pauseMinutes"] == 10
    assert normalized["platforms"] == ["ps4", "ps5", "ps3", "ps2", "ps1"]

    expect_control_error(control(batchSize=21), "entre 1 y 20")
    expect_control_error(control(pauseMinutes=9), "entre 10")
    expect_control_error(control(platforms=["switch"]), "no permitidas")
    expect_control_error({**control(), "command": "curl"}, "no permitidos")


def test_batch_is_pal_bounded_and_ordered() -> None:
    settings = effective_settings(normalize_control_request(control()))
    state = new_state(settings, moment=NOW)
    catalog = [
        *[game(index) for index in range(25, 0, -1)],
        game(30, region="USA"),
        game(31, excluded=True),
        game(1, platform="ps5"),
    ]
    state, batch = select_next_batch(state, catalog, settings, moment=NOW)
    assert batch is not None
    assert batch["platformSlug"] == "ps4"
    assert len(batch["catalogIds"]) == MAX_BATCH_SIZE
    assert batch["catalogIds"] == [f"ps4-game-{index:02d}" for index in range(1, 21)]
    assert "ps4-game-30" not in batch["catalogIds"]
    assert "ps4-game-31" not in batch["catalogIds"]


def test_success_waits_and_never_repeats() -> None:
    settings = effective_settings(normalize_control_request(control(platforms=["ps4"], jitterMinutes=3)))
    catalog = [game(index) for index in range(1, 24)]
    state = new_state(settings, moment=NOW)
    state, batch = select_next_batch(state, catalog, settings, moment=NOW)
    assert batch is not None
    state = mark_batch_queued(state, batch, "wallapop-test-1", moment=NOW)
    state = reconcile_active_batch(
        state,
        {
            "status": "done",
            "exitCode": 0,
            "finishedAt": "2026-08-30T12:05:00Z",
            "verifiedCatalogIds": ["ps4-game-01"],
            "pricedCatalogIds": ["ps4-game-01", "ps4-game-02"],
            "collectorStats": {"games_requested": 20, "games_with_listings": 4},
            "searchDiagnostics": [
                {
                    "catalogId": "ps4-game-01",
                    "title": "Game 01",
                    "outcome": "accepted",
                    "attempts": [{"query": "Game 01 ps4", "results": 4}],
                }
            ],
            "resultCatalogIds": ["ps4-game-01"],
            "resultPath": "results/wallapop-test-1/catalog-price-results.json",
            "ingestResultPath": "results/wallapop-test-1/wallapop-ingest.json",
        },
        settings,
        jitter_minutes=2,
        moment=NOW + timedelta(minutes=5),
    )
    assert state["status"] == "waiting"
    assert state["nextRunAt"] == "2026-08-30T12:17:00Z"
    assert len(state["processedCatalogIds"]) == 20
    assert state["readyArtifacts"][0]["jobId"] == "wallapop-test-1"
    assert state["lastBatch"]["pricedCatalogIds"] == ["ps4-game-01", "ps4-game-02"]
    assert state["lastBatch"]["searchDiagnostics"][0]["catalogId"] == "ps4-game-01"

    state, waiting_batch = select_next_batch(
        state,
        catalog,
        settings,
        moment=NOW + timedelta(minutes=16),
    )
    assert waiting_batch is None
    state, next_batch = select_next_batch(
        state,
        catalog,
        settings,
        moment=NOW + timedelta(minutes=17),
    )
    assert next_batch is not None
    assert next_batch["catalogIds"] == ["ps4-game-21", "ps4-game-22", "ps4-game-23"]


def test_blocking_error_stops_without_advancing() -> None:
    settings = effective_settings(normalize_control_request(control(platforms=["ps4"])))
    catalog = [game(1)]
    state = new_state(settings, moment=NOW)
    state, batch = select_next_batch(state, catalog, settings, moment=NOW)
    assert batch is not None
    state = mark_batch_queued(state, batch, "wallapop-blocked", moment=NOW)
    state = reconcile_active_batch(
        state,
        {"status": "error", "exitCode": 1, "error": "Wallapop API (429)"},
        settings,
        moment=NOW + timedelta(minutes=1),
    )
    assert state["status"] == "blocked"
    assert state["nextRunAt"] is None
    assert state["processedCatalogIds"] == []
    assert state["lastError"]["blocked"] is True


def test_disable_waits_for_active_batch_then_stops() -> None:
    enabled = effective_settings(normalize_control_request(control(platforms=["ps4"])))
    disabled = effective_settings(normalize_control_request(control("disable", platforms=["ps4"])))
    catalog = [game(1)]
    state = new_state(enabled, moment=NOW)
    state, batch = select_next_batch(state, catalog, enabled, moment=NOW)
    assert batch is not None
    state = mark_batch_queued(state, batch, "wallapop-stop", moment=NOW)

    state, no_batch = select_next_batch(state, catalog, disabled, moment=NOW)
    assert no_batch is None
    assert state["status"] == "stopping"
    state = reconcile_active_batch(
        state,
        {"status": "done", "exitCode": 0},
        disabled,
        moment=NOW + timedelta(minutes=1),
    )
    assert state["status"] == "disabled"
    assert state["nextRunAt"] is None


def test_public_state_omits_large_internal_cursor() -> None:
    settings = effective_settings(normalize_control_request(control(platforms=["ps4"])))
    state = new_state(settings, moment=NOW)
    state["processedCatalogIds"] = ["ps4-game-01"]
    published = public_state(state, settings, [game(1), game(2)])
    assert "processedCatalogIds" not in published
    assert published["progress"]["processedGames"] == 1
    assert published["settings"]["maxBatchSize"] == MAX_BATCH_SIZE
    assert published["settings"]["autoPublish"] is True
    assert published["readyArtifactCount"] == 0
    assert published["priceResults"]["changedGames"] == 0

    state["readyArtifacts"] = [
        {"jobId": "one", "verifiedCatalogIds": ["ps4-game-01", "ps4-game-02"]},
        {"jobId": "two", "verifiedCatalogIds": ["ps4-game-02"]},
    ]
    published = public_state(state, settings, [game(1), game(2)])
    assert published["priceResults"]["changedGames"] == 2
    assert published["priceResults"]["batchesWithChanges"] == 2


def main() -> None:
    test_control_contract()
    test_batch_is_pal_bounded_and_ordered()
    test_success_waits_and_never_repeats()
    test_blocking_error_stops_without_advancing()
    test_disable_waits_for_active_batch_then_stops()
    test_public_state_omits_large_internal_cursor()
    print("OK Wallapop PAL campaign")


if __name__ == "__main__":
    main()
