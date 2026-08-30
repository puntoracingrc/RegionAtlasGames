#!/usr/bin/env python3
"""Actualizacion segura y control limitado del worker externo de Region Atlas."""

from __future__ import annotations

import json
import math
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

UPDATE_MODE = "git_fast_forward_main_v1"
CONTROL_SCHEMA_VERSION = 1
EXPECTED_GITHUB_REPOSITORY = "github.com/puntoracingrc/regionatlasgames"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


class WorkerUpdateError(RuntimeError):
    """Parada segura de una solicitud de actualizacion no valida."""


def _run_git(
    repo: Path,
    *args: str,
    timeout: int = 180,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise WorkerUpdateError(f"No se pudo ejecutar git {' '.join(args)}: {exc}") from exc
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "error sin detalle").strip()[-1200:]
        raise WorkerUpdateError(f"git {' '.join(args)} fallo: {detail}")
    return result


def normalize_github_origin(value: str) -> str | None:
    clean = value.strip().rstrip("/")
    patterns = (
        r"^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$",
        r"^ssh://git@github\.com/([^/]+)/([^/]+?)(?:\.git)?$",
        r"^git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$",
    )
    for pattern in patterns:
        match = re.match(pattern, clean, flags=re.IGNORECASE)
        if match:
            return f"github.com/{match.group(1).lower()}/{match.group(2).lower()}"
    return None


def validate_target_sha(value: Any) -> str:
    sha = str(value or "").strip().lower()
    if not SHA_RE.fullmatch(sha):
        raise WorkerUpdateError("La solicitud no contiene un commit SHA completo y valido.")
    return sha


def normalize_weekly_control(
    value: Any,
    *,
    allowed_platforms: set[str],
) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise WorkerUpdateError("La configuracion semanal debe ser un objeto.")
    allowed_keys = {
        "enabled",
        "platforms",
        "pagesPerRun",
        "delaySeconds",
        "jitterSeconds",
        "backoffHours",
        "intervalDays",
    }
    unknown_keys = sorted(set(value) - allowed_keys)
    if unknown_keys:
        raise WorkerUpdateError(f"Campos semanales no permitidos: {', '.join(unknown_keys)}")

    enabled = value.get("enabled")
    if not isinstance(enabled, bool):
        raise WorkerUpdateError("enabled debe ser true o false.")

    raw_platforms = value.get("platforms") or []
    if not isinstance(raw_platforms, list):
        raise WorkerUpdateError("Las plataformas del piloto deben ser una lista.")
    platforms = sorted({str(item).strip().lower() for item in raw_platforms if str(item).strip()})
    unknown = sorted(set(platforms) - allowed_platforms)
    if unknown:
        raise WorkerUpdateError(f"Plataformas no permitidas: {', '.join(unknown)}")
    if enabled and not platforms:
        raise WorkerUpdateError("Un piloto activo necesita al menos una plataforma.")

    def bounded_number(name: str, default: float, minimum: float, maximum: float) -> float:
        raw = value.get(name, default)
        try:
            number = float(raw)
        except (TypeError, ValueError) as exc:
            raise WorkerUpdateError(f"{name} no es numerico.") from exc
        if not math.isfinite(number) or number < minimum or number > maximum:
            raise WorkerUpdateError(f"{name} debe estar entre {minimum:g} y {maximum:g}.")
        return number

    pages_per_run = int(bounded_number("pagesPerRun", 1, 1, 2))
    if float(value.get("pagesPerRun", pages_per_run)) != pages_per_run:
        raise WorkerUpdateError("pagesPerRun debe ser un numero entero.")

    interval_days = int(bounded_number("intervalDays", 7, 1, 30))
    if float(value.get("intervalDays", interval_days)) != interval_days:
        raise WorkerUpdateError("intervalDays debe ser un numero entero.")

    return {
        "enabled": enabled,
        "platforms": platforms,
        "pagesPerRun": pages_per_run,
        "delaySeconds": bounded_number("delaySeconds", 8, 5, 30),
        "jitterSeconds": bounded_number("jitterSeconds", 3, 0, 5),
        "backoffHours": bounded_number("backoffHours", 24, 24, 168),
        "intervalDays": interval_days,
    }


def validate_update_request(
    request: dict[str, Any],
    *,
    allowed_platforms: set[str],
) -> dict[str, Any]:
    allowed_keys = {
        "schemaVersion",
        "mode",
        "requestId",
        "targetSha",
        "requestedAt",
        "repository",
        "branch",
        "weeklyControl",
    }
    unknown_keys = sorted(set(request) - allowed_keys)
    if unknown_keys:
        raise WorkerUpdateError(f"Campos de solicitud no permitidos: {', '.join(unknown_keys)}")
    if request.get("schemaVersion") != 1:
        raise WorkerUpdateError("Version de solicitud no permitida.")
    if request.get("mode") != UPDATE_MODE:
        raise WorkerUpdateError("Modo de actualizacion no permitido.")
    if request.get("repository") != "puntoracingrc/RegionAtlasGames":
        raise WorkerUpdateError("Repositorio solicitado no permitido.")
    if request.get("branch") != "main":
        raise WorkerUpdateError("Rama solicitada no permitida.")
    return {
        "requestId": str(request.get("requestId") or "").strip(),
        "targetSha": validate_target_sha(request.get("targetSha")),
        "requestedAt": str(request.get("requestedAt") or "").strip() or None,
        "weeklyControl": normalize_weekly_control(
            request.get("weeklyControl"),
            allowed_platforms=allowed_platforms,
        ),
    }


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
    ) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def load_runtime_control(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def worker_git_health(repo: Path) -> dict[str, Any]:
    try:
        sha = _run_git(repo, "rev-parse", "HEAD").stdout.strip().lower()
        branch = _run_git(repo, "branch", "--show-current").stdout.strip()
        origin = _run_git(repo, "remote", "get-url", "origin").stdout.strip()
        status = _run_git(repo, "status", "--porcelain").stdout
        return {
            "ok": True,
            "commitSha": sha if SHA_RE.fullmatch(sha) else None,
            "branch": branch or None,
            "clean": not bool(status.strip()),
            "origin": normalize_github_origin(origin),
            "updateCapability": UPDATE_MODE,
        }
    except WorkerUpdateError as exc:
        return {
            "ok": False,
            "commitSha": None,
            "branch": None,
            "clean": False,
            "origin": None,
            "updateCapability": UPDATE_MODE,
            "error": str(exc),
        }


def apply_update_request(
    repo: Path,
    request: dict[str, Any],
    *,
    control_path: Path,
    allowed_platforms: set[str],
) -> dict[str, Any]:
    normalized = validate_update_request(request, allowed_platforms=allowed_platforms)
    target_sha = normalized["targetSha"]

    branch = _run_git(repo, "branch", "--show-current").stdout.strip()
    if branch != "main":
        raise WorkerUpdateError(f"El worker debe estar en main; rama actual: {branch or 'detached'}.")
    origin = _run_git(repo, "remote", "get-url", "origin").stdout.strip()
    if normalize_github_origin(origin) != EXPECTED_GITHUB_REPOSITORY:
        raise WorkerUpdateError("El remoto origin no es el repositorio oficial de Region Atlas.")
    if _run_git(repo, "status", "--porcelain").stdout.strip():
        raise WorkerUpdateError("El checkout del PC tiene cambios locales; no se actualiza automaticamente.")

    before_sha = _run_git(repo, "rev-parse", "HEAD").stdout.strip().lower()
    _run_git(repo, "fetch", "--prune", "origin", "main", timeout=300)
    remote_sha = _run_git(repo, "rev-parse", "origin/main").stdout.strip().lower()
    if target_sha != remote_sha:
        raise WorkerUpdateError("El commit solicitado ya no coincide con origin/main; solicita una actualizacion nueva.")

    updated = before_sha != target_sha
    if updated:
        ancestor = _run_git(repo, "merge-base", "--is-ancestor", before_sha, target_sha, check=False)
        if ancestor.returncode != 0:
            raise WorkerUpdateError("La actualizacion no es fast-forward desde el commit actual.")
        _run_git(repo, "merge", "--ff-only", target_sha, timeout=300)
        after_sha = _run_git(repo, "rev-parse", "HEAD").stdout.strip().lower()
        if after_sha != target_sha:
            raise WorkerUpdateError("Git termino sin alcanzar el commit solicitado.")
    else:
        after_sha = before_sha

    weekly_control = normalized["weeklyControl"]
    previous_control = load_runtime_control(control_path)
    control_changed = False
    if weekly_control is not None:
        next_control = {
            **previous_control,
            "schemaVersion": CONTROL_SCHEMA_VERSION,
            "updatedBy": UPDATE_MODE,
            "targetSha": target_sha,
            "todoConsolasWeekly": weekly_control,
        }
        control_changed = previous_control != next_control
        if control_changed:
            _atomic_write_json(control_path, next_control)

    if updated:
        status = "updated"
    elif control_changed:
        status = "configured"
    else:
        status = "already_current"
    return {
        "ok": True,
        "status": status,
        "requestId": normalized["requestId"] or None,
        "requestedAt": normalized["requestedAt"],
        "beforeSha": before_sha,
        "afterSha": after_sha,
        "branch": branch,
        "updated": updated,
        "controlChanged": control_changed,
        "restartRequired": updated,
        "weeklyControl": weekly_control,
    }


__all__ = [
    "EXPECTED_GITHUB_REPOSITORY",
    "UPDATE_MODE",
    "WorkerUpdateError",
    "apply_update_request",
    "load_runtime_control",
    "normalize_github_origin",
    "normalize_weekly_control",
    "validate_target_sha",
    "validate_update_request",
    "worker_git_health",
]
