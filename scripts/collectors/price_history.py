"""Histórico de medias por estado (suelto / completo / precintado) tras cada sync."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from collectors.common import ROOT, load_json, save_json

PRICE_HISTORY_FILE = ROOT / "data" / "price-history.json"
MAX_SNAPSHOTS_PER_GAME = 104


def _parse_day(iso_at: str) -> str:
    return iso_at[:10]


def _snapshot_values(snapshot: dict[str, Any]) -> tuple[Any, Any, Any]:
    return snapshot.get("loose"), snapshot.get("complete"), snapshot.get("sealed")


def snapshot_from_game(game: dict[str, Any], synced_at: str) -> dict[str, Any] | None:
    loose = game.get("estimatedPriceLoose")
    complete = game.get("estimatedPriceComplete")
    sealed = game.get("estimatedPriceSealed")
    if loose is None and complete is None and sealed is None:
        return None
    return {
        "at": synced_at,
        "loose": loose,
        "complete": complete,
        "sealed": sealed,
    }


def load_price_history() -> dict[str, Any]:
    raw = load_json(PRICE_HISTORY_FILE, {})
    if not isinstance(raw, dict):
        return {"version": 1, "games": {}}
    games = raw.get("games")
    if not isinstance(games, dict):
        return {"version": 1, "games": {}}
    return {"version": int(raw.get("version") or 1), "games": games}


def append_snapshot(history: dict[str, Any], game_id: str, snapshot: dict[str, Any]) -> bool:
    games: dict[str, list[dict[str, Any]]] = history.setdefault("games", {})
    series = list(games.get(game_id) or [])
    day = _parse_day(str(snapshot["at"]))

    if series:
        last = series[-1]
        if _parse_day(str(last["at"])) == day and _snapshot_values(last) == _snapshot_values(snapshot):
            return False
        if _parse_day(str(last["at"])) == day:
            series[-1] = snapshot
            games[game_id] = series
            return True

    if series and _snapshot_values(series[-1]) == _snapshot_values(snapshot):
        return False

    series.append(snapshot)
    if len(series) > MAX_SNAPSHOTS_PER_GAME:
        series = series[-MAX_SNAPSHOTS_PER_GAME :]
    games[game_id] = series
    return True


def record_platform_snapshots(
    games: list[dict[str, Any]],
    *,
    synced_at: str,
) -> int:
    history = load_price_history()
    recorded = 0
    for game in games:
        game_id = str(game.get("id") or "").strip()
        if not game_id:
            continue
        snapshot = snapshot_from_game(game, synced_at)
        if snapshot is None:
            continue
        if append_snapshot(history, game_id, snapshot):
            recorded += 1
    if recorded:
        save_json(PRICE_HISTORY_FILE, history)
    return recorded


def seed_from_catalog(catalog: list[dict[str, Any]], *, overwrite: bool = False) -> int:
    """Un punto inicial por juego con medias por estado (usa ``updatedAt`` del catálogo)."""
    history = load_price_history()
    games_map: dict[str, list[dict[str, Any]]] = history.setdefault("games", {})
    seeded = 0
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    for game in catalog:
        game_id = str(game.get("id") or "").strip()
        if not game_id:
            continue
        if not overwrite and games_map.get(game_id):
            continue
        at = str(game.get("updatedAt") or now)
        snapshot = snapshot_from_game(game, at)
        if snapshot is None:
            continue
        games_map[game_id] = [snapshot]
        seeded += 1

    if seeded:
        save_json(PRICE_HISTORY_FILE, history)
    return seeded


__all__ = [
    "PRICE_HISTORY_FILE",
    "load_price_history",
    "record_platform_snapshots",
    "seed_from_catalog",
    "snapshot_from_game",
]
