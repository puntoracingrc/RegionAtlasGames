#!/usr/bin/env python3
"""Barrido semanal, prudente y reanudable de categorías TodoConsolas.

Cada ejecución procesa una ventana pequeña de una sola categoría. Los precios
exactos quedan en lotes para Git y las dudas entran en la cola de revisión; este
script nunca modifica el catálogo publicado.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collect_todoconsolas_category_pilot import (  # noqa: E402
    MAX_PAGES_PER_RUN,
    collect_category_pages,
    is_preowned_product,
)
from collectors.common import load_json, now_iso, save_json  # noqa: E402
from collectors.price_review_queue import record_price_review_candidates  # noqa: E402
from collectors.tcns_client import (  # noqa: E402
    TodoConsolasRequestError,
    supported_platform_slugs,
    tcns_category_paths_for_platform,
)
from collectors.tcns_review_triage import (  # noqa: E402
    TcnsTriageDecision,
    approved_tcns_ingest_row,
    build_tcns_triage_index,
    review_tcns_ingest_row,
    triage_tcns_product,
)

SOURCE = "todoconsolas"
SCHEMA_VERSION = 1
DEFAULT_STATE_PATH = ROOT / "data" / "worker-runtime" / "todoconsolas-weekly" / "state.json"
DEFAULT_OUTPUT_ROOT = ROOT / "data" / "worker-runtime" / "todoconsolas-weekly" / "campaigns"
PRIORITY_PLATFORMS = ("ps4", "ps5", "switch2")
REVIEW_PRIORITY = {
    "price_anomaly": 0,
    "manual_match": 1,
    "regional_variant": 2,
    "missing_region": 3,
    "catalog_gap": 4,
}


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_at(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def selected_platforms(value: str | None = None) -> list[str]:
    available = supported_platform_slugs()
    if not value:
        requested = available
    else:
        requested = [part.strip().lower() for part in value.split(",") if part.strip()]
    unknown = sorted(set(requested) - set(available))
    if unknown:
        raise ValueError(f"Plataformas TodoConsolas no configuradas: {', '.join(unknown)}")
    rank = {slug: index for index, slug in enumerate(PRIORITY_PLATFORMS)}
    return sorted(set(requested), key=lambda slug: (rank.get(slug, len(rank)), slug))


def build_campaign_units(platforms: list[str]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for platform_slug in platforms:
        for category_path in tcns_category_paths_for_platform(platform_slug):
            unit = grouped.setdefault(
                category_path,
                {
                    "id": category_path,
                    "categoryPath": category_path,
                    "platformSlugs": [],
                    "status": "pending",
                    "nextPage": 1,
                    "lastPage": None,
                    "pagesProcessed": 0,
                    "productsRead": 0,
                    "preownedConsidered": 0,
                    "exactListings": 0,
                    "reviewListings": 0,
                },
            )
            unit["platformSlugs"].append(platform_slug)
    return list(grouped.values())


def _campaign_id(moment: datetime) -> str:
    return moment.strftime("%Y%m%dT%H%M%SZ")


def new_campaign_state(
    platforms: list[str],
    *,
    interval_days: int,
    pages_per_run: int,
    delay_seconds: float,
    jitter_seconds: float,
    moment: datetime | None = None,
) -> dict[str, Any]:
    started = moment or utc_now()
    units = build_campaign_units(platforms)
    if not units:
        raise ValueError("No hay categorías TodoConsolas configuradas")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "engine": "todoconsolas_weekly_public_categories",
        "campaignId": _campaign_id(started),
        "status": "running",
        "startedAt": iso_at(started),
        "updatedAt": iso_at(started),
        "completedAt": None,
        "nextDueAt": None,
        "blockedUntil": None,
        "lastError": None,
        "lastAction": "campaign_started",
        "settings": {
            "intervalDays": interval_days,
            "pagesPerRun": pages_per_run,
            "delaySeconds": delay_seconds,
            "jitterSeconds": jitter_seconds,
            "publishMode": "git_review_required",
            "productPagesVisited": False,
            "internalSearchUsed": False,
        },
        "platforms": platforms,
        "units": units,
        "progress": campaign_progress(units),
    }


def campaign_progress(units: list[dict[str, Any]]) -> dict[str, int]:
    known_pages = sum(int(unit.get("lastPage") or 0) for unit in units)
    return {
        "unitsCompleted": sum(1 for unit in units if unit.get("status") == "complete"),
        "unitsTotal": len(units),
        "pagesProcessed": sum(int(unit.get("pagesProcessed") or 0) for unit in units),
        "knownPagesTotal": known_pages,
        "productsRead": sum(int(unit.get("productsRead") or 0) for unit in units),
        "preownedConsidered": sum(int(unit.get("preownedConsidered") or 0) for unit in units),
        "exactListings": sum(int(unit.get("exactListings") or 0) for unit in units),
        "reviewListings": sum(int(unit.get("reviewListings") or 0) for unit in units),
    }


def state_needs_slice(state: dict[str, Any] | None, *, moment: datetime | None = None) -> bool:
    if not state or not state.get("campaignId"):
        return True
    current = moment or utc_now()
    status = str(state.get("status") or "")
    if status == "running":
        return True
    if status == "backoff":
        blocked_until = parse_iso(str(state.get("blockedUntil") or ""))
        return blocked_until is None or blocked_until <= current
    if status in {"ready_for_git", "complete", "waiting"}:
        next_due = parse_iso(str(state.get("nextDueAt") or ""))
        return next_due is None or next_due <= current
    return True


def empty_ingest(platform_slug: str, collected_at: str) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "platformSlug": platform_slug,
        "collectedAt": collected_at,
        "source": SOURCE,
        "searchMode": "weekly_public_category_exact",
        "listings": [],
        "regionalCandidates": [],
        "cex": [],
        "jgo": [],
        "chollo": [],
        "kaoto": [],
        "tcns": [],
        "tc": [],
        "sourceStats": {SOURCE: {"auto_approved": 0, "manual_review": 0}},
    }


def merge_campaign_ingest(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    approved: dict[str, dict[str, Any]] = {}
    for row in [*(existing.get("tcns") or []), *(incoming.get("tcns") or [])]:
        if not isinstance(row, dict):
            continue
        catalog_id = str(row.get("catalogId") or "").strip()
        if not catalog_id:
            continue
        previous = approved.get(catalog_id)
        price = float(row.get("retailPriceEur") or row.get("priceEur"))
        previous_price = float(previous.get("retailPriceEur") or previous.get("priceEur")) if previous else None
        if previous is None or price < previous_price:
            approved[catalog_id] = row

    reviews: dict[str, dict[str, Any]] = {}
    for row in [*(existing.get("regionalCandidates") or []), *(incoming.get("regionalCandidates") or [])]:
        if not isinstance(row, dict):
            continue
        key = str(row.get("productUrl") or row.get("externalId") or row.get("title") or "").strip()
        if key:
            reviews[key] = row

    merged = {**existing, **incoming}
    merged["collectedAt"] = existing.get("collectedAt") or incoming.get("collectedAt")
    merged["updatedAt"] = incoming.get("updatedAt") or now_iso()
    merged["tcns"] = sorted(approved.values(), key=lambda row: str(row.get("catalogId") or ""))
    merged["regionalCandidates"] = sorted(
        reviews.values(),
        key=lambda row: str(row.get("productUrl") or row.get("title") or ""),
    )
    merged["sourceStats"] = {
        SOURCE: {
            "auto_approved": len(merged["tcns"]),
            "manual_review": len(merged["regionalCandidates"]),
        }
    }
    return merged


def _best_review(
    decisions: list[tuple[str, TcnsTriageDecision]],
) -> tuple[str, TcnsTriageDecision]:
    return min(
        decisions,
        key=lambda item: (
            REVIEW_PRIORITY.get(item[1].bucket, 99),
            0 if item[1].catalog_id else 1,
            item[0],
        ),
    )


def classify_products(
    products: list[dict[str, Any]],
    platform_slugs: list[str],
    index: Any,
    collected_at: str,
) -> tuple[dict[str, dict[str, list[dict[str, Any]]]], Counter[str]]:
    rows = {
        platform_slug: {"tcns": [], "regionalCandidates": []}
        for platform_slug in platform_slugs
    }
    counts: Counter[str] = Counter()
    for product in products:
        decisions = [
            (platform_slug, triage_tcns_product(product, platform_slug, index))
            for platform_slug in platform_slugs
        ]
        exact = [item for item in decisions if item[1].bucket == "safe_exact"]
        if len(exact) == 1:
            platform_slug, decision = exact[0]
            rows[platform_slug]["tcns"].append(
                approved_tcns_ingest_row(product, decision, index, collected_at)
            )
            counts["safe_exact"] += 1
            continue
        if len(exact) > 1:
            platform_slug = exact[0][0]
            decision = TcnsTriageDecision("manual_match", "catalog_match_not_unique")
        else:
            platform_slug, decision = _best_review(decisions)
        rows[platform_slug]["regionalCandidates"].append(
            review_tcns_ingest_row(product, decision, index, collected_at)
        )
        counts[decision.bucket] += 1
    return rows, counts


def _campaign_dir(output_root: Path, campaign_id: str) -> Path:
    return output_root / campaign_id


def _save_platform_rows(
    campaign_dir: Path,
    platform_slug: str,
    collected_at: str,
    platform_rows: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    ingest_path = campaign_dir / "ingest" / f"todoconsolas-{platform_slug}.json"
    incoming = empty_ingest(platform_slug, collected_at)
    incoming["updatedAt"] = now_iso()
    incoming["tcns"] = platform_rows["tcns"]
    incoming["regionalCandidates"] = platform_rows["regionalCandidates"]
    existing = load_json(ingest_path, {}) if ingest_path.exists() else {}
    merged = merge_campaign_ingest(existing, incoming)
    save_json(ingest_path, merged)
    record_price_review_candidates(merged, platform_slug)
    return merged


def _campaign_ingests(campaign_dir: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    entries: list[tuple[str, Path, dict[str, Any]]] = []
    for path in sorted((campaign_dir / "ingest").glob("todoconsolas-*.json")):
        payload = load_json(path, {})
        platform_slug = str(payload.get("platformSlug") or "").strip()
        if platform_slug:
            entries.append((platform_slug, path, payload))
    return entries


def write_campaign_summary(state: dict[str, Any], output_root: Path) -> dict[str, Any]:
    campaign_id = str(state["campaignId"])
    campaign_dir = _campaign_dir(output_root, campaign_id)
    ingests = _campaign_ingests(campaign_dir)
    platforms: dict[str, Any] = {}
    exact_total = 0
    review_total = 0
    for platform_slug, path, payload in ingests:
        exact_rows = payload.get("tcns") or []
        review_rows = payload.get("regionalCandidates") or []
        exact_total += len(exact_rows)
        review_total += len(review_rows)
        platforms[platform_slug] = {
            "ingestPath": str(path.relative_to(campaign_dir)),
            "exactListings": len(exact_rows),
            "reviewListings": len(review_rows),
            "catalogIds": sorted(
                str(row.get("catalogId"))
                for row in exact_rows
                if isinstance(row, dict) and row.get("catalogId")
            ),
        }
    summary = {
        "schemaVersion": SCHEMA_VERSION,
        "source": SOURCE,
        "campaignId": campaign_id,
        "status": state.get("status"),
        "startedAt": state.get("startedAt"),
        "updatedAt": state.get("updatedAt"),
        "completedAt": state.get("completedAt"),
        "nextDueAt": state.get("nextDueAt"),
        "progress": state.get("progress") or {},
        "totals": {
            "exactListings": exact_total,
            "reviewListings": review_total,
            "platformsWithResults": len(platforms),
        },
        "platforms": platforms,
        "publication": {
            "mode": "git_review_required",
            "catalogChanged": False,
            "instructions": "Validar los lotes y publicar exclusivamente mediante rama, PR, checks y producción verificada.",
        },
    }
    save_json(campaign_dir / "summary.json", summary)
    if state.get("status") == "ready_for_git":
        ready = {
            **summary,
            "artifact": "ready_for_git",
            "checksRequired": [
                "sync_es_prices --dry-run",
                "diff limitado a precios TodoConsolas exactos",
                "tests y build",
                "PR, main CI y Production Domain",
            ],
        }
        save_json(campaign_dir / "ready-for-git.json", ready)
    return summary


def _next_unit(state: dict[str, Any]) -> dict[str, Any] | None:
    return next((unit for unit in state.get("units") or [] if unit.get("status") != "complete"), None)


def _backoff_until(exc: TodoConsolasRequestError, hours: float, moment: datetime) -> datetime:
    try:
        retry_seconds = max(0, int(str(exc.retry_after or "0")))
    except ValueError:
        retry_seconds = 0
    return moment + max(timedelta(hours=max(1.0, hours)), timedelta(seconds=retry_seconds))


def run_slice(
    *,
    state_path: Path = DEFAULT_STATE_PATH,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
    platforms_value: str | None = None,
    interval_days: int = 7,
    pages_per_run: int = 2,
    delay_seconds: float = 6.0,
    jitter_seconds: float = 2.0,
    backoff_hours: float = 24.0,
    force_due: bool = False,
) -> dict[str, Any]:
    if interval_days < 1:
        raise ValueError("El intervalo semanal debe ser de al menos un día")
    pages_per_run = max(1, min(int(pages_per_run), MAX_PAGES_PER_RUN))
    delay_seconds = max(5.0, float(delay_seconds))
    jitter_seconds = max(0.0, min(float(jitter_seconds), 5.0))
    moment = utc_now()
    state = load_json(state_path, {}) if state_path.exists() else {}

    if state and not force_due and not state_needs_slice(state, moment=moment):
        state["lastAction"] = "waiting_for_next_campaign" if state.get("status") != "backoff" else "backoff_wait"
        state["updatedAt"] = iso_at(moment)
        save_json(state_path, state)
        write_campaign_summary(state, output_root)
        return state

    start_new = not state or not state.get("campaignId") or str(state.get("status") or "") in {
        "ready_for_git",
        "complete",
        "waiting",
    }
    if force_due and state.get("status") == "backoff":
        state["blockedUntil"] = None
        state["status"] = "running"
    if start_new:
        state = new_campaign_state(
            selected_platforms(platforms_value),
            interval_days=interval_days,
            pages_per_run=pages_per_run,
            delay_seconds=delay_seconds,
            jitter_seconds=jitter_seconds,
            moment=moment,
        )
    elif state.get("status") == "backoff":
        state["status"] = "running"
        state["blockedUntil"] = None

    unit = _next_unit(state)
    if unit is None:
        state["status"] = "ready_for_git"
        state["completedAt"] = state.get("completedAt") or iso_at(moment)
        state["nextDueAt"] = iso_at(moment + timedelta(days=interval_days))
        state["lastAction"] = "campaign_completed"
        state["updatedAt"] = iso_at(moment)
        state["progress"] = campaign_progress(state.get("units") or [])
        save_json(state_path, state)
        write_campaign_summary(state, output_root)
        return state

    category_path = str(unit["categoryPath"])
    start_page = int(unit.get("nextPage") or 1)
    platform_slugs = [str(value) for value in unit.get("platformSlugs") or []]
    try:
        products, pages = collect_category_pages(
            [category_path],
            start_page=start_page,
            max_pages=pages_per_run,
            delay_seconds=delay_seconds,
            jitter_seconds=jitter_seconds,
        )
    except TodoConsolasRequestError as exc:
        blocked_until = _backoff_until(exc, backoff_hours, moment)
        state.update(
            {
                "status": "backoff",
                "blockedUntil": iso_at(blocked_until),
                "lastError": {
                    "at": iso_at(moment),
                    "categoryPath": category_path,
                    "page": start_page,
                    "statusCode": exc.status_code,
                    "message": str(exc),
                },
                "lastAction": "blocked_without_retry",
                "updatedAt": iso_at(moment),
            }
        )
        save_json(state_path, state)
        write_campaign_summary(state, output_root)
        return state

    preowned = [product for product in products if is_preowned_product(product)]
    catalog = load_json(ROOT / "data" / "catalog.json", [])
    details = load_json(ROOT / "data" / "game-details.json", {})
    platform_set = set(platform_slugs)
    relevant_catalog = [
        game
        for game in catalog
        if isinstance(game, dict) and str(game.get("platformSlug") or "") in platform_set
    ]
    index = build_tcns_triage_index(relevant_catalog, details if isinstance(details, dict) else {})
    collected_at = now_iso()
    classified, triage_counts = classify_products(preowned, platform_slugs, index, collected_at)
    campaign_dir = _campaign_dir(output_root, str(state["campaignId"]))
    merged_ingests: dict[str, dict[str, Any]] = {}
    for platform_slug, platform_rows in classified.items():
        if not platform_rows["tcns"] and not platform_rows["regionalCandidates"]:
            continue
        merged_ingests[platform_slug] = _save_platform_rows(
            campaign_dir,
            platform_slug,
            str(state.get("startedAt") or collected_at),
            platform_rows,
        )

    fetched_pages = [int(page.get("page") or 0) for page in pages]
    last_pages = [int(page.get("lastPage") or 1) for page in pages]
    last_fetched = max(fetched_pages, default=start_page - 1)
    last_page = max(last_pages, default=int(unit.get("lastPage") or start_page))
    unit["lastPage"] = last_page
    unit["nextPage"] = last_fetched + 1
    unit["pagesProcessed"] = int(unit.get("pagesProcessed") or 0) + len(pages)
    unit["productsRead"] = int(unit.get("productsRead") or 0) + len(products)
    unit["preownedConsidered"] = int(unit.get("preownedConsidered") or 0) + len(preowned)
    unit["exactListings"] = int(unit.get("exactListings") or 0) + int(triage_counts.get("safe_exact", 0))
    unit["reviewListings"] = int(unit.get("reviewListings") or 0) + sum(
        int(value) for bucket, value in triage_counts.items() if bucket != "safe_exact"
    )
    if last_fetched >= last_page:
        unit["status"] = "complete"
        unit["completedAt"] = collected_at
    else:
        unit["status"] = "running"
    unit["updatedAt"] = collected_at

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "campaignId": state["campaignId"],
        "collectedAt": collected_at,
        "categoryPath": category_path,
        "platformSlugs": platform_slugs,
        "pages": pages,
        "productsRead": len(products),
        "preownedConsidered": len(preowned),
        "triage": dict(sorted(triage_counts.items())),
        "ingests": {
            platform_slug: {
                "exactListings": len(payload.get("tcns") or []),
                "reviewListings": len(payload.get("regionalCandidates") or []),
            }
            for platform_slug, payload in merged_ingests.items()
        },
    }
    report_name = f"{category_path}-p{start_page}-{collected_at.replace(':', '').replace('-', '')}.json"
    save_json(campaign_dir / "slices" / report_name, report)

    state["status"] = "running"
    state["lastError"] = None
    state["lastAction"] = "slice_completed"
    state["lastSlice"] = report
    state["updatedAt"] = collected_at
    state["progress"] = campaign_progress(state.get("units") or [])
    if _next_unit(state) is None:
        state["status"] = "ready_for_git"
        state["completedAt"] = collected_at
        completed_moment = parse_iso(collected_at) or moment
        state["nextDueAt"] = iso_at(completed_moment + timedelta(days=interval_days))
        state["lastAction"] = "campaign_completed"
    save_json(state_path, state)
    write_campaign_summary(state, output_root)
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description="TodoConsolas weekly public-category collector")
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--platforms", help="Lista separada por comas; vacío usa todas las configuradas")
    parser.add_argument("--interval-days", type=int, default=7)
    parser.add_argument("--pages-per-run", type=int, default=2)
    parser.add_argument("--delay", type=float, default=6.0)
    parser.add_argument("--jitter", type=float, default=2.0)
    parser.add_argument("--backoff-hours", type=float, default=24.0)
    parser.add_argument("--force-due", action="store_true", help="Solo para operación manual consciente")
    args = parser.parse_args()
    try:
        state = run_slice(
            state_path=args.state,
            output_root=args.output_root,
            platforms_value=args.platforms,
            interval_days=args.interval_days,
            pages_per_run=args.pages_per_run,
            delay_seconds=args.delay,
            jitter_seconds=args.jitter,
            backoff_hours=args.backoff_hours,
            force_due=args.force_due,
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"PARADA SEGURA: {exc}", file=sys.stderr)
        return 2
    progress = state.get("progress") or {}
    print(
        f"TodoConsolas semanal: {state.get('status')} · campaña {state.get('campaignId')} · "
        f"categorías {progress.get('unitsCompleted', 0)}/{progress.get('unitsTotal', 0)} · "
        f"páginas {progress.get('pagesProcessed', 0)} · exactos {progress.get('exactListings', 0)} · "
        f"revisión {progress.get('reviewListings', 0)}"
    )
    if state.get("status") == "backoff":
        print(f"Pausa segura hasta {state.get('blockedUntil')}: {(state.get('lastError') or {}).get('message')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
