#!/usr/bin/env python3
"""Estado puro del barrido Wallapop PAL ejecutado por el PC worker.

Este modulo no hace peticiones de red. Selecciona lotes acotados, conserva el
cursor y decide cuando una respuesta obliga a esperar o detener la campaña.
"""

from __future__ import annotations

import html as html_lib
import math
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

SCHEMA_VERSION = 1
ENGINE = "wallapop_pal_catalog_v1"
CONTROL_MODE = "wallapop_pal_control_v1"
TARGET_REGION = "PAL España"
PLATFORM_ORDER = ("ps4", "ps5", "ps3", "ps2", "ps1")
MAX_BATCH_SIZE = 20
DEFAULT_BATCH_SIZE = 20
MIN_PAUSE_MINUTES = 10
DEFAULT_PAUSE_MINUTES = 10
DEFAULT_JITTER_MINUTES = 3
MAX_JITTER_MINUTES = 10
MAX_PAUSE_MINUTES = 24 * 60
MAX_CONSECUTIVE_ERRORS = 3
ERROR_BACKOFF_MINUTES = 60
MAX_READY_ARTIFACTS = 500
BLOCK_RE = re.compile(
    r"(?:\b403\b|\b429\b|captcha|access denied|rate[ -]?limit|demasiadas peticiones|bloquead[oa])",
    re.IGNORECASE,
)


class WallapopCampaignControlError(ValueError):
    """La orden remota no cumple el contrato acotado del robot."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_at(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


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


def _bounded_int(
    value: Any,
    *,
    name: str,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    raw = default if value is None else value
    if isinstance(raw, bool):
        raise WallapopCampaignControlError(f"{name} debe ser un numero entero.")
    try:
        number = float(raw)
    except (TypeError, ValueError) as exc:
        raise WallapopCampaignControlError(f"{name} debe ser un numero entero.") from exc
    if not math.isfinite(number) or not number.is_integer():
        raise WallapopCampaignControlError(f"{name} debe ser un numero entero.")
    integer = int(number)
    if integer < minimum or integer > maximum:
        raise WallapopCampaignControlError(
            f"{name} debe estar entre {minimum} y {maximum}."
        )
    return integer


def normalize_control_request(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WallapopCampaignControlError("La orden Wallapop debe ser un objeto.")
    allowed = {
        "schemaVersion",
        "mode",
        "requestId",
        "requestedAt",
        "action",
        "batchSize",
        "pauseMinutes",
        "jitterMinutes",
        "platforms",
    }
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise WallapopCampaignControlError(
            f"Campos Wallapop no permitidos: {', '.join(unknown)}"
        )
    if value.get("schemaVersion") != SCHEMA_VERSION:
        raise WallapopCampaignControlError("Version de orden Wallapop no permitida.")
    if value.get("mode") != CONTROL_MODE:
        raise WallapopCampaignControlError("Modo de control Wallapop no permitido.")
    action = str(value.get("action") or "").strip().lower()
    if action not in {"enable", "disable", "restart"}:
        raise WallapopCampaignControlError("Accion Wallapop no permitida.")

    raw_platforms = value.get("platforms", list(PLATFORM_ORDER))
    if not isinstance(raw_platforms, list):
        raise WallapopCampaignControlError("Las plataformas deben ser una lista.")
    requested = [str(item).strip().lower() for item in raw_platforms if str(item).strip()]
    unknown_platforms = sorted(set(requested) - set(PLATFORM_ORDER))
    if unknown_platforms:
        raise WallapopCampaignControlError(
            f"Plataformas Wallapop no permitidas: {', '.join(unknown_platforms)}"
        )
    platforms = [slug for slug in PLATFORM_ORDER if slug in set(requested)]
    if action != "disable" and not platforms:
        raise WallapopCampaignControlError("El robot necesita al menos una plataforma.")

    return {
        "enabled": action in {"enable", "restart"},
        "resetCycle": action == "restart",
        "action": action,
        "requestId": str(value.get("requestId") or "").strip()[:160] or None,
        "requestedAt": str(value.get("requestedAt") or "").strip()[:80] or None,
        "platforms": platforms or list(PLATFORM_ORDER),
        "batchSize": _bounded_int(
            value.get("batchSize"),
            name="batchSize",
            default=DEFAULT_BATCH_SIZE,
            minimum=1,
            maximum=MAX_BATCH_SIZE,
        ),
        "pauseMinutes": _bounded_int(
            value.get("pauseMinutes"),
            name="pauseMinutes",
            default=DEFAULT_PAUSE_MINUTES,
            minimum=MIN_PAUSE_MINUTES,
            maximum=MAX_PAUSE_MINUTES,
        ),
        "jitterMinutes": _bounded_int(
            value.get("jitterMinutes"),
            name="jitterMinutes",
            default=DEFAULT_JITTER_MINUTES,
            minimum=0,
            maximum=MAX_JITTER_MINUTES,
        ),
    }


def effective_settings(control: Any) -> dict[str, Any]:
    raw = control if isinstance(control, dict) else {}
    try:
        normalized = normalize_control_request(
            {
                "schemaVersion": SCHEMA_VERSION,
                "mode": CONTROL_MODE,
                "action": "enable" if raw.get("enabled") is True else "disable",
                "platforms": raw.get("platforms", list(PLATFORM_ORDER)),
                "batchSize": raw.get("batchSize", DEFAULT_BATCH_SIZE),
                "pauseMinutes": raw.get("pauseMinutes", DEFAULT_PAUSE_MINUTES),
                "jitterMinutes": raw.get("jitterMinutes", DEFAULT_JITTER_MINUTES),
            }
        )
    except WallapopCampaignControlError:
        normalized = {
            "enabled": False,
            "resetCycle": False,
            "action": "disable",
            "requestId": None,
            "requestedAt": None,
            "platforms": list(PLATFORM_ORDER),
            "batchSize": DEFAULT_BATCH_SIZE,
            "pauseMinutes": DEFAULT_PAUSE_MINUTES,
            "jitterMinutes": DEFAULT_JITTER_MINUTES,
        }
    normalized.pop("resetCycle", None)
    normalized.pop("action", None)
    normalized.pop("requestId", None)
    normalized.pop("requestedAt", None)
    return normalized


def new_state(settings: dict[str, Any], *, moment: datetime | None = None) -> dict[str, Any]:
    now = moment or utc_now()
    platforms = list(settings.get("platforms") or PLATFORM_ORDER)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "engine": ENGINE,
        "campaignId": now.strftime("%Y%m%dT%H%M%SZ"),
        "status": "running" if settings.get("enabled") else "disabled",
        "startedAt": iso_at(now) if settings.get("enabled") else None,
        "updatedAt": iso_at(now),
        "completedAt": None,
        "nextRunAt": iso_at(now) if settings.get("enabled") else None,
        "platforms": platforms,
        "platformIndex": 0,
        "completedPlatforms": [],
        "processedCatalogIds": [],
        "activeBatch": None,
        "lastBatch": None,
        "readyArtifacts": [],
        "lastError": None,
        "consecutiveErrors": 0,
        "lastAction": "campaign_started" if settings.get("enabled") else "disabled",
    }


def _title_sort_key(game: dict[str, Any]) -> tuple[str, str]:
    title = unicodedata.normalize("NFKD", str(game.get("title") or ""))
    title = "".join(char for char in title if not unicodedata.combining(char)).casefold()
    return (title, str(game.get("id") or ""))


def _display_title(value: Any) -> str:
    title = str(value or "")
    for _ in range(5):
        decoded = html_lib.unescape(title)
        if decoded == title:
            break
        title = decoded
    return title.strip()


def eligible_games(catalog: list[dict[str, Any]], platform_slug: str) -> list[dict[str, Any]]:
    return sorted(
        (
            game
            for game in catalog
            if isinstance(game, dict)
            and str(game.get("platformSlug") or "") == platform_slug
            and str(game.get("region") or "") == TARGET_REGION
            and str(game.get("listingStatus") or "listed") != "excluded"
            and str(game.get("id") or "").strip()
        ),
        key=_title_sort_key,
    )


def campaign_progress(
    state: dict[str, Any],
    catalog: list[dict[str, Any]],
) -> dict[str, Any]:
    platforms = list(state.get("platforms") or PLATFORM_ORDER)
    totals = {slug: len(eligible_games(catalog, slug)) for slug in platforms}
    processed = set(str(item) for item in state.get("processedCatalogIds") or [])
    done_by_platform = {
        slug: sum(1 for game in eligible_games(catalog, slug) if str(game.get("id")) in processed)
        for slug in platforms
    }
    return {
        "processedGames": sum(done_by_platform.values()),
        "totalGames": sum(totals.values()),
        "completedPlatforms": len(state.get("completedPlatforms") or []),
        "totalPlatforms": len(platforms),
        "byPlatform": {
            slug: {"processed": done_by_platform[slug], "total": totals[slug]}
            for slug in platforms
        },
    }


def state_is_due(state: dict[str, Any], *, moment: datetime | None = None) -> bool:
    due = parse_iso(str(state.get("nextRunAt") or ""))
    return due is None or due <= (moment or utc_now())


def select_next_batch(
    state: dict[str, Any],
    catalog: list[dict[str, Any]],
    settings: dict[str, Any],
    *,
    moment: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    now = moment or utc_now()
    if not settings.get("enabled"):
        state["status"] = "stopping" if state.get("activeBatch") else "disabled"
        state["nextRunAt"] = None
        state["lastAction"] = "stop_requested" if state.get("activeBatch") else "disabled"
        state["updatedAt"] = iso_at(now)
        return state, None
    if state.get("activeBatch") or state.get("status") == "blocked" or not state_is_due(state, moment=now):
        return state, None

    platforms = list(settings.get("platforms") or PLATFORM_ORDER)
    completed = set(str(item) for item in state.get("completedPlatforms") or [])
    processed = set(str(item) for item in state.get("processedCatalogIds") or [])
    start_index = max(0, min(int(state.get("platformIndex") or 0), len(platforms)))
    for index in range(start_index, len(platforms)):
        platform_slug = platforms[index]
        remaining = [
            game for game in eligible_games(catalog, platform_slug)
            if str(game.get("id")) not in processed
        ]
        if not remaining:
            completed.add(platform_slug)
            state["completedPlatforms"] = [slug for slug in platforms if slug in completed]
            state["platformIndex"] = index + 1
            continue
        limit = min(MAX_BATCH_SIZE, max(1, int(settings.get("batchSize") or DEFAULT_BATCH_SIZE)))
        selected = remaining[:limit]
        batch = {
            "platformSlug": platform_slug,
            "catalogIds": [str(game["id"]) for game in selected],
            "titles": [_display_title(game.get("title") or game["id"]) for game in selected],
        }
        state["status"] = "queueing"
        state["platformIndex"] = index
        state["lastAction"] = "batch_selected"
        state["updatedAt"] = iso_at(now)
        return state, batch

    state["status"] = "complete"
    state["completedAt"] = iso_at(now)
    state["nextRunAt"] = None
    state["lastAction"] = "campaign_completed"
    state["updatedAt"] = iso_at(now)
    return state, None


def mark_batch_queued(
    state: dict[str, Any],
    batch: dict[str, Any],
    job_id: str,
    *,
    moment: datetime | None = None,
) -> dict[str, Any]:
    now = moment or utc_now()
    state["activeBatch"] = {
        **batch,
        "jobId": job_id,
        "queuedAt": iso_at(now),
    }
    state["status"] = "batch_queued"
    state["nextRunAt"] = None
    state["lastAction"] = "batch_queued"
    state["updatedAt"] = iso_at(now)
    return state


def is_blocking_job(job: dict[str, Any]) -> bool:
    if job.get("blocked") is True:
        return True
    text = "\n".join(
        str(job.get(key) or "")
        for key in ("error", "logTail", "blockReason")
    )
    return bool(BLOCK_RE.search(text))


def reconcile_active_batch(
    state: dict[str, Any],
    job: dict[str, Any] | None,
    settings: dict[str, Any],
    *,
    jitter_minutes: int = 0,
    moment: datetime | None = None,
) -> dict[str, Any]:
    active = state.get("activeBatch")
    if not isinstance(active, dict):
        return state
    now = moment or utc_now()
    if not job or str(job.get("status") or "") in {"pending", "running", "queued"}:
        state["status"] = "stopping" if not settings.get("enabled") else "batch_running"
        state["lastAction"] = "waiting_active_batch"
        state["updatedAt"] = iso_at(now)
        return state

    status = str(job.get("status") or "error")
    state["activeBatch"] = None
    if status == "done" and int(job.get("exitCode") or 0) == 0:
        processed = list(dict.fromkeys([
            *(str(item) for item in state.get("processedCatalogIds") or []),
            *(str(item) for item in active.get("catalogIds") or []),
        ]))
        state["processedCatalogIds"] = processed
        state["consecutiveErrors"] = 0
        state["lastError"] = None
        state["lastBatch"] = {
            "jobId": active.get("jobId"),
            "platformSlug": active.get("platformSlug"),
            "catalogIds": active.get("catalogIds") or [],
            "titles": active.get("titles") or [],
            "finishedAt": str(job.get("finishedAt") or iso_at(now)),
            "verifiedCatalogIds": job.get("verifiedCatalogIds") or [],
            "pricedCatalogIds": job.get("pricedCatalogIds") or [],
            "reviewQueueItems": int(job.get("reviewQueueItems") or 0),
            "collectorStats": job.get("collectorStats") if isinstance(job.get("collectorStats"), dict) else {},
            "searchDiagnostics": (
                job.get("searchDiagnostics")[:MAX_BATCH_SIZE]
                if isinstance(job.get("searchDiagnostics"), list)
                else []
            ),
        }
        verified_ids = [str(item) for item in job.get("verifiedCatalogIds") or [] if str(item)]
        result_path = str(job.get("resultPath") or "")
        ingest_path = str(job.get("ingestResultPath") or "")
        if verified_ids and result_path and ingest_path:
            artifact = {
                "jobId": str(active.get("jobId") or ""),
                "platformSlug": str(active.get("platformSlug") or ""),
                "finishedAt": str(job.get("finishedAt") or iso_at(now)),
                "searchedCatalogIds": [str(item) for item in active.get("catalogIds") or []],
                "resultCatalogIds": [str(item) for item in job.get("resultCatalogIds") or []],
                "verifiedCatalogIds": verified_ids,
                "resultPath": result_path,
                "ingestResultPath": ingest_path,
            }
            ready = [
                item
                for item in state.get("readyArtifacts") or []
                if isinstance(item, dict) and item.get("jobId") != artifact["jobId"]
            ]
            state["readyArtifacts"] = [*ready, artifact][-MAX_READY_ARTIFACTS:]
        if settings.get("enabled"):
            pause = max(MIN_PAUSE_MINUTES, int(settings.get("pauseMinutes") or DEFAULT_PAUSE_MINUTES))
            jitter = max(0, min(int(jitter_minutes), MAX_JITTER_MINUTES))
            state["status"] = "waiting"
            state["nextRunAt"] = iso_at(now + timedelta(minutes=pause + jitter))
            state["lastAction"] = "batch_completed_waiting"
        else:
            state["status"] = "disabled"
            state["nextRunAt"] = None
            state["lastAction"] = "batch_completed_then_disabled"
        state["updatedAt"] = iso_at(now)
        return state

    error = str(job.get("error") or "La tanda Wallapop termino con error.")
    consecutive = int(state.get("consecutiveErrors") or 0) + 1
    blocked = is_blocking_job(job) or consecutive >= MAX_CONSECUTIVE_ERRORS
    state["consecutiveErrors"] = consecutive
    state["lastError"] = {
        "at": iso_at(now),
        "jobId": active.get("jobId"),
        "platformSlug": active.get("platformSlug"),
        "message": error,
        "blocked": blocked,
    }
    state["lastBatch"] = {
        "jobId": active.get("jobId"),
        "platformSlug": active.get("platformSlug"),
        "catalogIds": active.get("catalogIds") or [],
        "titles": active.get("titles") or [],
        "finishedAt": str(job.get("finishedAt") or iso_at(now)),
        "error": error,
    }
    if blocked:
        state["status"] = "blocked"
        state["nextRunAt"] = None
        state["lastAction"] = "blocked_without_retry"
    elif settings.get("enabled"):
        state["status"] = "backoff"
        state["nextRunAt"] = iso_at(now + timedelta(minutes=ERROR_BACKOFF_MINUTES))
        state["lastAction"] = "error_backoff"
    else:
        state["status"] = "disabled"
        state["nextRunAt"] = None
        state["lastAction"] = "error_then_disabled"
    state["updatedAt"] = iso_at(now)
    return state


def public_state(
    state: dict[str, Any],
    settings: dict[str, Any],
    catalog: list[dict[str, Any]],
) -> dict[str, Any]:
    active = state.get("activeBatch") if isinstance(state.get("activeBatch"), dict) else None
    last_batch = state.get("lastBatch") if isinstance(state.get("lastBatch"), dict) else None
    ready_artifacts = [
        item for item in state.get("readyArtifacts") or [] if isinstance(item, dict)
    ]
    changed_catalog_ids = list(dict.fromkeys(
        str(catalog_id)
        for artifact in ready_artifacts
        for catalog_id in artifact.get("verifiedCatalogIds") or []
        if str(catalog_id)
    ))
    return {
        "schemaVersion": SCHEMA_VERSION,
        "engine": ENGINE,
        "enabled": bool(settings.get("enabled")),
        "status": str(state.get("status") or "disabled"),
        "campaignId": state.get("campaignId"),
        "startedAt": state.get("startedAt"),
        "updatedAt": state.get("updatedAt"),
        "completedAt": state.get("completedAt"),
        "nextRunAt": state.get("nextRunAt"),
        "lastAction": state.get("lastAction"),
        "settings": {
            "platforms": list(settings.get("platforms") or PLATFORM_ORDER),
            "targetRegion": TARGET_REGION,
            "batchSize": min(MAX_BATCH_SIZE, int(settings.get("batchSize") or DEFAULT_BATCH_SIZE)),
            "maxBatchSize": MAX_BATCH_SIZE,
            "pauseMinutes": max(MIN_PAUSE_MINUTES, int(settings.get("pauseMinutes") or DEFAULT_PAUSE_MINUTES)),
            "jitterMinutes": max(0, int(settings.get("jitterMinutes") or DEFAULT_JITTER_MINUTES)),
            "autoPublish": True,
        },
        "progress": campaign_progress(state, catalog),
        "activeBatch": active,
        "lastBatch": last_batch,
        "priceResults": {
            "changedGames": len(changed_catalog_ids),
            "changedCatalogIds": changed_catalog_ids,
            "batchesWithChanges": len(ready_artifacts),
        },
        "readyArtifactCount": len(ready_artifacts),
        "lastError": state.get("lastError") if isinstance(state.get("lastError"), dict) else None,
        "consecutiveErrors": int(state.get("consecutiveErrors") or 0),
    }


__all__ = [
    "CONTROL_MODE",
    "DEFAULT_BATCH_SIZE",
    "DEFAULT_JITTER_MINUTES",
    "DEFAULT_PAUSE_MINUTES",
    "ENGINE",
    "MAX_BATCH_SIZE",
    "MAX_READY_ARTIFACTS",
    "MIN_PAUSE_MINUTES",
    "PLATFORM_ORDER",
    "TARGET_REGION",
    "WallapopCampaignControlError",
    "campaign_progress",
    "effective_settings",
    "eligible_games",
    "is_blocking_job",
    "mark_batch_queued",
    "new_state",
    "normalize_control_request",
    "public_state",
    "reconcile_active_batch",
    "select_next_batch",
]
