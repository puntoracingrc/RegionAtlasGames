#!/usr/bin/env python3
"""Campaña reanudable para consultar todo PS4 por regiones en eBay España."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, now_iso, save_json  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
STATE_FILE = ROOT / "data" / "ebay-regional-campaigns" / "ps4.json"

REGION_ORDER = (
    ("pal_es", "PAL España", "PAL España"),
    ("pal_uk", "PAL UK", "PAL UK/ENG"),
    ("usa", "USA", "USA"),
    ("japon", "Japón", "Japón"),
    ("japan_alias", "Japón (alias JAPAN)", "JAPAN"),
)


def validate_runtime_environment() -> None:
    has_ebay_token = bool(os.environ.get("EBAY_ACCESS_TOKEN", "").strip())
    has_ebay_credentials = bool(
        os.environ.get("EBAY_CLIENT_ID", "").strip()
        and os.environ.get("EBAY_CLIENT_SECRET", "").strip()
    )
    if not has_ebay_token and not has_ebay_credentials:
        raise RuntimeError("Faltan credenciales eBay para ejecutar la campaña.")
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        raise RuntimeError(
            "Falta OPENAI_API_KEY; PS4 exige validar evidencia visual antes de publicar precios."
        )


def campaign_games(catalog: list[dict[str, Any]], catalog_region: str) -> list[dict[str, Any]]:
    games = [
        game
        for game in catalog
        if game.get("platformSlug") == "ps4"
        and game.get("listingStatus") != "excluded"
        and game.get("region") == catalog_region
    ]
    return sorted(
        games,
        key=lambda game: (
            bool(game.get("hasEsPrice")),
            str(game.get("title") or "").lower(),
            str(game.get("id") or ""),
        ),
    )


def default_state() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "campaignId": "ebay-ps4-regional-v1",
        "platformSlug": "ps4",
        "marketplaceId": "EBAY_ES",
        "destinationCountry": "ES",
        "status": "ready",
        "currentRegion": "PAL España",
        "updatedAt": None,
        "lastRun": None,
        "regions": {},
        "totals": {},
        "log": [],
    }


def _clean_ids(values: Any, valid_ids: set[str]) -> list[str]:
    if not isinstance(values, list):
        return []
    return [value for value in dict.fromkeys(str(item) for item in values) if value in valid_ids]


def reconcile_state(state: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    state = {**default_state(), **(state or {})}
    regions = state.get("regions") if isinstance(state.get("regions"), dict) else {}
    state["regions"] = regions

    for key, label, catalog_region in REGION_ORDER:
        games = campaign_games(catalog, catalog_region)
        valid_ids = {str(game["id"]) for game in games}
        current = regions.get(key) if isinstance(regions.get(key), dict) else {}
        completed = _clean_ids(current.get("completedCatalogIds"), valid_ids)
        matched = _clean_ids(current.get("matchedCatalogIds"), valid_ids)
        no_match = _clean_ids(current.get("noMatchCatalogIds"), valid_ids)
        deferred = _clean_ids(current.get("deferredCatalogIds"), valid_ids)
        failures = current.get("failureAttempts") if isinstance(current.get("failureAttempts"), dict) else {}
        failures = {
            str(catalog_id): max(1, int(attempts))
            for catalog_id, attempts in failures.items()
            if str(catalog_id) in valid_ids
        }
        completed_set = set(completed)
        deferred_set = set(deferred)
        pending = len(valid_ids - completed_set - deferred_set)
        regions[key] = {
            **current,
            "key": key,
            "label": label,
            "catalogRegion": catalog_region,
            "total": len(games),
            "completed": len(completed),
            "matched": len(matched),
            "noMatch": len(no_match),
            "deferred": len(deferred),
            "pending": pending,
            "completedCatalogIds": completed,
            "matchedCatalogIds": matched,
            "noMatchCatalogIds": no_match,
            "deferredCatalogIds": deferred,
            "failureAttempts": failures,
        }

    region_rows = [regions[key] for key, _, _ in REGION_ORDER]
    state["totals"] = {
        "catalogGames": sum(row["total"] for row in region_rows),
        "completed": sum(row["completed"] for row in region_rows),
        "matched": sum(row["matched"] for row in region_rows),
        "noMatch": sum(row["noMatch"] for row in region_rows),
        "deferred": sum(row["deferred"] for row in region_rows),
        "pending": sum(row["pending"] for row in region_rows),
    }
    next_row = next((row for row in region_rows if row["pending"] > 0), None)
    state["currentRegion"] = next_row["catalogRegion"] if next_row else None
    if not next_row:
        state["status"] = "completed_with_errors" if state["totals"]["deferred"] else "completed"
    return state


def select_batch(state: dict[str, Any], catalog: list[dict[str, Any]], batch_size: int) -> tuple[dict[str, Any] | None, list[str]]:
    for key, _, catalog_region in REGION_ORDER:
        region = state["regions"][key]
        completed = set(region["completedCatalogIds"])
        deferred = set(region["deferredCatalogIds"])
        pending = [
            str(game["id"])
            for game in campaign_games(catalog, catalog_region)
            if str(game["id"]) not in completed and str(game["id"]) not in deferred
        ]
        if pending:
            return region, pending[:batch_size]
    return None, []


def _append_unique(target: list[str], values: list[str]) -> list[str]:
    seen = set(target)
    for value in values:
        if value not in seen:
            target.append(value)
            seen.add(value)
    return target


def record_result(
    state: dict[str, Any],
    region_key: str,
    *,
    selected: list[str],
    processed: list[str],
    matched: list[str],
    failed: list[str],
    listings_added: int,
    retry_limit: int,
    systemic_error: str | None = None,
) -> dict[str, Any]:
    at = now_iso()
    region = state["regions"][region_key]
    processed = [catalog_id for catalog_id in processed if catalog_id in selected]
    matched = [catalog_id for catalog_id in matched if catalog_id in processed]
    no_match = [catalog_id for catalog_id in processed if catalog_id not in set(matched)]
    region["completedCatalogIds"] = _append_unique(region["completedCatalogIds"], processed)
    region["matchedCatalogIds"] = _append_unique(region["matchedCatalogIds"], matched)
    region["noMatchCatalogIds"] = _append_unique(region["noMatchCatalogIds"], no_match)
    for catalog_id in processed:
        region["failureAttempts"].pop(catalog_id, None)

    deferred_now: list[str] = []
    if not systemic_error:
        for catalog_id in failed:
            attempts = int(region["failureAttempts"].get(catalog_id, 0)) + 1
            region["failureAttempts"][catalog_id] = attempts
            if attempts >= retry_limit:
                deferred_now.append(catalog_id)
                region["failureAttempts"].pop(catalog_id, None)
        region["deferredCatalogIds"] = _append_unique(region["deferredCatalogIds"], deferred_now)

    level = "error" if systemic_error else "info"
    message = systemic_error or (
        f"{region['label']}: {len(processed)}/{len(selected)} consultados, "
        f"{len(matched)} con evidencias, {listings_added} anuncios aceptados, "
        f"{len(failed)} fallos, {len(deferred_now)} aplazados."
    )
    log = state.get("log") if isinstance(state.get("log"), list) else []
    log.append({"at": at, "level": level, "message": message, "region": region["catalogRegion"]})
    state["log"] = log[-40:]
    state["lastRun"] = {
        "at": at,
        "region": region["catalogRegion"],
        "selected": len(selected),
        "processed": len(processed),
        "matched": len(matched),
        "listingsAdded": listings_added,
        "failed": len(failed),
        "systemicError": systemic_error,
    }
    state["updatedAt"] = at
    state["status"] = "blocked" if systemic_error else "running"
    return state


def run_command(command: list[str]) -> int:
    print("+", " ".join(command), flush=True)
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def write_github_output(state: dict[str, Any]) -> None:
    output = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not output:
        return
    last_run = state.get("lastRun") or {}
    with Path(output).open("a", encoding="utf-8") as handle:
        handle.write(f"status={state.get('status', 'unknown')}\n")
        handle.write(f"region={last_run.get('region') or state.get('currentRegion') or ''}\n")
        handle.write(f"processed={last_run.get('processed', 0)}\n")
        handle.write(f"matched={last_run.get('matched', 0)}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Campaña regional eBay para todo PS4")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--per-game", type=int, default=8)
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--retry-limit", type=int, default=3)
    parser.add_argument("--destination-postal-code", default="28001")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    batch_size = min(250, max(1, args.batch_size))
    catalog = load_json(CATALOG_FILE, [])
    state = reconcile_state(load_json(STATE_FILE, default_state()), catalog)
    region, selected = select_batch(state, catalog, batch_size)
    if not region or not selected:
        state = reconcile_state(state, catalog)
        if not args.dry_run:
            state["updatedAt"] = now_iso()
            save_json(STATE_FILE, state)
        write_github_output(state)
        print(f"Campaña {state['status']}: no quedan variantes PS4 pendientes.")
        return

    print(
        f"Siguiente lote: {region['label']} · {len(selected)} juegos · "
        f"pendientes antes de ejecutar: {region['pending']}"
    )
    if args.dry_run:
        for catalog_id in selected[:20]:
            print(f"  - {catalog_id}")
        if len(selected) > 20:
            print(f"  ... y {len(selected) - 20} más")
        return

    validate_runtime_environment()

    with tempfile.TemporaryDirectory(prefix="region-atlas-ebay-ps4-") as temp_dir:
        temp = Path(temp_dir)
        ids_file = temp / "catalog-ids.json"
        ingest_file = temp / "ingest.json"
        report_file = temp / "report.json"
        save_json(ids_file, selected)

        collector = [
            sys.executable,
            str(ROOT / "scripts" / "collect_ebay_es.py"),
            "--platform", "ps4",
            "--region", region["catalogRegion"],
            "--active",
            "--limit", str(len(selected)),
            "--per-game", str(max(1, args.per_game)),
            "--delay", str(max(0.0, args.delay)),
            "--destination-postal-code", args.destination_postal_code,
            "--catalog-ids-file", str(ids_file),
            "--output", str(ingest_file),
            "--report-output", str(report_file),
        ]
        collector_code = run_command(collector)
        report = load_json(report_file, {}) if report_file.exists() else {}
        processed = [str(value) for value in report.get("catalogIdsProcessed") or []]
        failed = [str(value) for value in report.get("catalogIdsFailed") or []]
        matched = [str(value) for value in report.get("catalogIdsWithListings") or []]
        listings_added = int(report.get("listingsAdded") or 0)

        systemic_error: str | None = None
        if collector_code != 0:
            systemic_error = f"El collector terminó con código {collector_code}; el lote no se aplicó."
        elif not processed and failed and len(failed) >= len(selected):
            systemic_error = "Todas las consultas del lote fallaron; se conserva el mismo lote para reintentar."

        if not systemic_error and ingest_file.exists() and listings_added > 0:
            sync_command = [
                sys.executable,
                str(ROOT / "scripts" / "sync_es_prices.py"),
                "--platform", "ps4",
                "--region", region["catalogRegion"],
                "--input", str(ingest_file),
                "--catalog-ids-file", str(ids_file),
                "--no-advance-rotation",
            ]
            sync_code = run_command(sync_command)
            if sync_code != 0:
                systemic_error = f"El sync terminó con código {sync_code}; no se marca el lote como completado."

        if systemic_error:
            processed = []
            matched = []
            failed = selected

        state = record_result(
            state,
            region["key"],
            selected=selected,
            processed=processed,
            matched=matched,
            failed=failed,
            listings_added=listings_added,
            retry_limit=max(1, args.retry_limit),
            systemic_error=systemic_error,
        )
        state = reconcile_state(state, load_json(CATALOG_FILE, []))
        if systemic_error:
            state["status"] = "blocked"
        save_json(STATE_FILE, state)
        write_github_output(state)
        if systemic_error:
            raise SystemExit(systemic_error)

    print(
        f"Lote completado: {state['lastRun']['processed']} juegos · "
        f"pendientes campaña: {state['totals']['pending']}"
    )


if __name__ == "__main__":
    main()
