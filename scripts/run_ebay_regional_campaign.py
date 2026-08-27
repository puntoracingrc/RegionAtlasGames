#!/usr/bin/env python3
"""Campaña eBay reanudable para todas las plataformas y regiones del catálogo."""

from __future__ import annotations

import argparse
import math
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.ebay_cover_candidates import empty_cover_queue, merge_cover_candidates  # noqa: E402
from collectors.ebay_region_policy import ebay_regional_policy  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
PLATFORMS_FILE = ROOT / "data" / "platforms.json"
STATE_DIR = ROOT / "data" / "ebay-regional-campaigns"
GLOBAL_STATE_FILE = STATE_DIR / "global.json"
COVER_CANDIDATES_FILE = STATE_DIR / "cover-candidates.json"

DEFAULT_BATCH_SIZE = 50
RUNS_PER_DAY = 4

LEGACY_REGION_KEYS = {
    "pal espana": "pal_es",
    "pal uk eng": "pal_uk",
    "usa": "usa",
    "japon": "japon",
    "japan": "japan_alias",
}


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def region_key(catalog_region: str) -> str:
    normalized = _normalize(catalog_region)
    return LEGACY_REGION_KEYS.get(normalized) or re.sub(r"[^a-z0-9]+", "_", normalized).strip("_") or "unknown"


def region_priority(catalog_region: str) -> tuple[int, str]:
    region = _normalize(catalog_region)
    if region in {"pal espana", "espana"}:
        rank = 0
    elif any(marker in region for marker in ("multi", "pal europa", "pal europe")):
        rank = 1
    elif any(marker in region for marker in ("uk", "eng", "reino unido")):
        rank = 2
    elif any(marker in region for marker in ("alemania", "germany", "usk")):
        rank = 3
    elif any(marker in region for marker in ("francia", "france")):
        rank = 4
    elif any(marker in region for marker in ("italia", "italy")):
        rank = 5
    elif "australia" in region:
        rank = 6
    elif any(marker in region for marker in ("usa", "ntsc u", "estados unidos")):
        rank = 7
    elif any(marker in region for marker in ("japon", "japan", "ntsc j")):
        rank = 8
    else:
        rank = 50
    return rank, region


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
            "Falta OPENAI_API_KEY; la campaña exige validar la edición antes de publicar precios."
        )


def campaign_games(
    catalog: list[dict[str, Any]],
    catalog_region: str,
    platform_slug: str = "ps4",
) -> list[dict[str, Any]]:
    games = [
        game
        for game in catalog
        if game.get("platformSlug") == platform_slug
        and game.get("listingStatus") != "excluded"
        and game.get("region") == catalog_region
    ]
    return sorted(
        games,
        key=lambda game: (
            bool(game.get("hasEsPrice")),
            str(game.get("title") or "").casefold(),
            str(game.get("id") or ""),
        ),
    )


def platform_regions(catalog: list[dict[str, Any]], platform_slug: str) -> list[str]:
    regions = {
        str(game.get("region") or "").strip()
        for game in catalog
        if game.get("platformSlug") == platform_slug
        and game.get("listingStatus") != "excluded"
        and str(game.get("region") or "").strip()
    }
    return sorted(regions, key=region_priority)


def platform_order(catalog: list[dict[str, Any]]) -> tuple[list[str], dict[str, str]]:
    configured = load_json(PLATFORMS_FILE, [])
    names = {
        str(platform.get("slug")): str(platform.get("name") or platform.get("shortName") or platform.get("slug"))
        for platform in configured
        if platform.get("slug")
    }
    active = {
        str(game.get("platformSlug"))
        for game in catalog
        if game.get("platformSlug") and game.get("listingStatus") != "excluded"
    }
    configured_order = [
        str(platform.get("slug"))
        for platform in configured
        if platform.get("slug") in active
    ]
    extras = sorted(active - set(configured_order))
    order = configured_order + extras
    # PS4 ya está en marcha: termina su recorrido antes de saltar de plataforma.
    if "ps4" in order:
        order = ["ps4", *[slug for slug in order if slug != "ps4"]]
    for slug in extras:
        names.setdefault(slug, slug)
    return order, names


def default_state(platform_slug: str = "ps4", platform_name: str | None = None) -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "campaignId": "ebay-global-regional-v1",
        "platformSlug": platform_slug,
        "platformName": platform_name or platform_slug,
        "marketplaceId": "EBAY_ES",
        "destinationCountry": "ES",
        "status": "ready",
        "currentRegion": None,
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


def reconcile_state(
    state: dict[str, Any],
    catalog: list[dict[str, Any]],
    platform_slug: str = "ps4",
    platform_name: str | None = None,
) -> dict[str, Any]:
    state = {**default_state(platform_slug, platform_name), **(state or {})}
    state["schemaVersion"] = 2
    state["campaignId"] = "ebay-global-regional-v1"
    state["platformSlug"] = platform_slug
    state["platformName"] = platform_name or state.get("platformName") or platform_slug
    prior_regions = state.get("regions") if isinstance(state.get("regions"), dict) else {}
    regions: dict[str, Any] = {}

    for catalog_region in platform_regions(catalog, platform_slug):
        key = region_key(catalog_region)
        games = campaign_games(catalog, catalog_region, platform_slug)
        valid_ids = {str(game["id"]) for game in games}
        current = prior_regions.get(key) if isinstance(prior_regions.get(key), dict) else {}
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
        pending = len(valid_ids - set(completed) - set(deferred))
        policy = ebay_regional_policy(catalog_region)
        market_scope = (
            "multi_region"
            if policy.item_location_region
            else "country"
            if policy.item_location_country
            else "unrestricted"
        )
        regions[key] = {
            **current,
            "key": key,
            "label": catalog_region,
            "catalogRegion": catalog_region,
            "marketScope": market_scope,
            "originLabel": policy.origin_label,
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

    region_rows = list(regions.values())
    state["regions"] = regions
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
    elif state.get("status") in {"completed", "completed_with_errors"}:
        state["status"] = "ready"
    return state


def select_batch(
    state: dict[str, Any],
    catalog: list[dict[str, Any]],
    batch_size: int,
) -> tuple[dict[str, Any] | None, list[str]]:
    platform_slug = str(state.get("platformSlug") or "ps4")
    for catalog_region in platform_regions(catalog, platform_slug):
        region = state["regions"][region_key(catalog_region)]
        completed = set(region["completedCatalogIds"])
        deferred = set(region["deferredCatalogIds"])
        pending = [
            str(game["id"])
            for game in campaign_games(catalog, catalog_region, platform_slug)
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
    region_key_value: str,
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
    region = state["regions"][region_key_value]
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
        f"{state['platformName']} · {region['label']}: {len(processed)}/{len(selected)} consultados, "
        f"{len(matched)} con evidencias, {listings_added} anuncios aceptados, "
        f"{len(failed)} fallos, {len(deferred_now)} aplazados."
    )
    log = state.get("log") if isinstance(state.get("log"), list) else []
    log.append({
        "at": at,
        "level": level,
        "message": message,
        "platformSlug": state["platformSlug"],
        "region": region["catalogRegion"],
    })
    state["log"] = log[-40:]
    state["lastRun"] = {
        "at": at,
        "platformSlug": state["platformSlug"],
        "platformName": state["platformName"],
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


def state_path(platform_slug: str) -> Path:
    return STATE_DIR / f"{platform_slug}.json"


def load_platform_states(
    catalog: list[dict[str, Any]],
    order: list[str],
    names: dict[str, str],
) -> dict[str, dict[str, Any]]:
    return {
        slug: reconcile_state(
            load_json(state_path(slug), default_state(slug, names.get(slug))),
            catalog,
            slug,
            names.get(slug),
        )
        for slug in order
    }


def select_global_batch(
    states: dict[str, dict[str, Any]],
    catalog: list[dict[str, Any]],
    order: list[str],
    batch_size: int,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[str]]:
    for slug in order:
        region, selected = select_batch(states[slug], catalog, batch_size)
        if region and selected:
            return states[slug], region, selected
    return None, None, []


def build_global_state(
    states: dict[str, dict[str, Any]],
    order: list[str],
    *,
    batch_size: int,
    current: dict[str, Any] | None = None,
    last_entry: dict[str, Any] | None = None,
    cover_queue: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prior = current if isinstance(current, dict) else {}
    platform_rows: list[dict[str, Any]] = []
    for slug in order:
        state = states[slug]
        regions = [
            {
                key: row.get(key)
                for key in (
                    "key",
                    "label",
                    "catalogRegion",
                    "marketScope",
                    "originLabel",
                    "total",
                    "completed",
                    "matched",
                    "noMatch",
                    "deferred",
                    "pending",
                )
            }
            for row in state.get("regions", {}).values()
        ]
        platform_rows.append({
            "platformSlug": slug,
            "platformName": state.get("platformName") or slug,
            "status": state.get("status"),
            "currentRegion": state.get("currentRegion"),
            "updatedAt": state.get("updatedAt"),
            "totals": state.get("totals") or {},
            "regions": regions,
        })

    totals = {
        key: sum(int((row.get("totals") or {}).get(key) or 0) for row in platform_rows)
        for key in ("catalogGames", "completed", "matched", "noMatch", "deferred", "pending")
    }
    next_row = next((row for row in platform_rows if int((row.get("totals") or {}).get("pending") or 0) > 0), None)
    runs_remaining = math.ceil(totals["pending"] / batch_size) if totals["pending"] else 0
    log = prior.get("log") if isinstance(prior.get("log"), list) else []
    if not log:
        inherited = [entry for state in states.values() for entry in state.get("log", [])]
        log = sorted(inherited, key=lambda entry: str(entry.get("at") or ""))[-60:]
    if last_entry and not any(
        entry.get("at") == last_entry.get("at")
        and entry.get("platformSlug") == last_entry.get("platformSlug")
        and entry.get("region") == last_entry.get("region")
        for entry in log
    ):
        log = [*log, last_entry][-60:]

    last_run = prior.get("lastRun")
    if last_entry:
        platform_slug = str(last_entry.get("platformSlug") or "")
        last_run = states.get(platform_slug, {}).get("lastRun") or last_run

    blocked = bool(next_row and next_row.get("status") == "blocked")
    status = "blocked" if blocked else "running" if next_row else "completed_with_errors" if totals["deferred"] else "completed"
    return {
        "schemaVersion": 1,
        "campaignId": "ebay-global-regional-v1",
        "marketplaceId": "EBAY_ES",
        "destinationCountry": "ES",
        "schedule": {"hours": 6, "runsPerDay": RUNS_PER_DAY, "batchSize": batch_size},
        "status": status,
        "currentPlatform": next_row.get("platformSlug") if next_row else None,
        "currentPlatformName": next_row.get("platformName") if next_row else None,
        "currentRegion": next_row.get("currentRegion") if next_row else None,
        "updatedAt": last_entry.get("at") if last_entry else prior.get("updatedAt"),
        "lastRun": last_run,
        "totals": totals,
        "estimatedRunsRemaining": runs_remaining,
        "estimatedDaysRemaining": math.ceil(runs_remaining / RUNS_PER_DAY) if runs_remaining else 0,
        "platforms": platform_rows,
        "coverCandidates": (cover_queue or empty_cover_queue()).get("totals") or {},
        "log": log,
    }


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
        handle.write(f"platform={last_run.get('platformSlug') or state.get('currentPlatform') or ''}\n")
        handle.write(f"region={last_run.get('region') or state.get('currentRegion') or ''}\n")
        handle.write(f"processed={last_run.get('processed', 0)}\n")
        handle.write(f"matched={last_run.get('matched', 0)}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Campaña regional eBay para todo el catálogo")
    parser.add_argument("--platform", help="Limitar manualmente el siguiente lote a una plataforma")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--per-game", type=int, default=8)
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--retry-limit", type=int, default=3)
    parser.add_argument("--destination-postal-code", default="28001")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    batch_size = min(250, max(1, args.batch_size))
    catalog = load_json(CATALOG_FILE, [])
    order, names = platform_order(catalog)
    if args.platform:
        if args.platform not in order:
            raise SystemExit(f"Plataforma sin catálogo activo: {args.platform}")
        selection_order = [args.platform]
    else:
        selection_order = order

    states = load_platform_states(catalog, order, names)
    platform_state, region, selected = select_global_batch(states, catalog, selection_order, batch_size)
    cover_queue = load_json(COVER_CANDIDATES_FILE, empty_cover_queue())
    global_current = load_json(GLOBAL_STATE_FILE, {})
    global_state = build_global_state(
        states,
        order,
        batch_size=batch_size,
        current=global_current,
        cover_queue=cover_queue,
    )
    if not platform_state or not region or not selected:
        if not args.dry_run:
            global_state["updatedAt"] = now_iso()
            save_json(GLOBAL_STATE_FILE, global_state)
        write_github_output(global_state)
        print(f"Campaña {global_state['status']}: no quedan variantes pendientes en el alcance solicitado.")
        return

    print(
        f"Siguiente lote: {platform_state['platformName']} · {region['label']} · "
        f"{len(selected)} juegos · pendientes globales: {global_state['totals']['pending']}"
    )
    if args.dry_run:
        for catalog_id in selected[:20]:
            print(f"  - {catalog_id}")
        if len(selected) > 20:
            print(f"  ... y {len(selected) - 20} más")
        print(
            f"Primera vuelta estimada: {global_state['estimatedRunsRemaining']} lotes · "
            f"{global_state['estimatedDaysRemaining']} días a cuatro ejecuciones diarias."
        )
        return

    if region.get("marketScope") == "unrestricted":
        systemic_error = (
            f"La región {region['catalogRegion']} no tiene una política de origen segura; "
            "el lote queda bloqueado hasta mapearla."
        )
        platform_state = record_result(
            platform_state,
            region["key"],
            selected=selected,
            processed=[],
            matched=[],
            failed=selected,
            listings_added=0,
            retry_limit=max(1, args.retry_limit),
            systemic_error=systemic_error,
        )
        states[str(platform_state["platformSlug"])] = reconcile_state(
            platform_state,
            catalog,
            str(platform_state["platformSlug"]),
            str(platform_state["platformName"]),
        )
        states[str(platform_state["platformSlug"])]["status"] = "blocked"
        global_state = build_global_state(
            states,
            order,
            batch_size=batch_size,
            current=global_current,
            last_entry=platform_state["log"][-1],
            cover_queue=cover_queue,
        )
        save_json(state_path(str(platform_state["platformSlug"])), states[str(platform_state["platformSlug"])])
        save_json(GLOBAL_STATE_FILE, global_state)
        write_github_output(global_state)
        raise SystemExit(systemic_error)

    validate_runtime_environment()
    platform_slug = str(platform_state["platformSlug"])

    with tempfile.TemporaryDirectory(prefix=f"region-atlas-ebay-{platform_slug}-") as temp_dir:
        temp = Path(temp_dir)
        ids_file = temp / "catalog-ids.json"
        ingest_file = temp / "ingest.json"
        report_file = temp / "report.json"
        save_json(ids_file, selected)

        collector = [
            sys.executable,
            str(ROOT / "scripts" / "collect_ebay_es.py"),
            "--platform", platform_slug,
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
                "--platform", platform_slug,
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

        platform_state = record_result(
            platform_state,
            region["key"],
            selected=selected,
            processed=processed,
            matched=matched,
            failed=failed,
            listings_added=listings_added,
            retry_limit=max(1, args.retry_limit),
            systemic_error=systemic_error,
        )
        last_entry = platform_state["log"][-1]

        catalog_after = load_json(CATALOG_FILE, [])
        if not systemic_error and ingest_file.exists():
            ingest = load_json(ingest_file, {})
            cover_queue, covers_added = merge_cover_candidates(
                cover_queue,
                catalog_after,
                list(ingest.get("listings") or []),
                at=platform_state["lastRun"]["at"],
            )
            platform_state["lastRun"]["coverCandidatesAdded"] = covers_added
            last_entry["coverCandidatesAdded"] = covers_added

        states[platform_slug] = reconcile_state(
            platform_state,
            catalog_after,
            platform_slug,
            names.get(platform_slug),
        )
        if systemic_error:
            states[platform_slug]["status"] = "blocked"
        global_state = build_global_state(
            states,
            order,
            batch_size=batch_size,
            current=global_current,
            last_entry=last_entry,
            cover_queue=cover_queue,
        )
        save_json(state_path(platform_slug), states[platform_slug])
        save_json(COVER_CANDIDATES_FILE, cover_queue)
        save_json(GLOBAL_STATE_FILE, global_state)
        write_github_output(global_state)
        if systemic_error:
            raise SystemExit(systemic_error)

    print(
        f"Lote completado: {global_state['lastRun']['processed']} juegos · "
        f"pendientes globales: {global_state['totals']['pending']} · "
        f"candidatos de portada: {global_state['coverCandidates'].get('images', 0)}"
    )


if __name__ == "__main__":
    main()
