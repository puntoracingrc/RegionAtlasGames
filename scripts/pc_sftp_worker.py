#!/usr/bin/env python3
"""Worker saliente para ejecutar jobs de Region Atlas desde este PC.

El PC no abre puertos: hace polling por SFTP sobre la cola publica del worker,
ejecuta los mismos scripts Python del repo y sube estado/logs/resultados.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import random
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pc_worker_update import (
    DEFAULT_PRODUCTION_RELEASE_URL,
    WorkerUpdateError,
    apply_update_request,
    fetch_production_release,
    load_runtime_control,
    worker_git_health,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PUBLIC_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker"
RUN_DIR = ROOT / "data" / "worker-runtime"
LOG_DIR = RUN_DIR / "logs"
STATUS_DIR = RUN_DIR / "status"
RESULTS_DIR = RUN_DIR / "results"
TODOCONSOLAS_WEEKLY_DIR = RUN_DIR / "todoconsolas-weekly"
TODOCONSOLAS_WEEKLY_STATE = TODOCONSOLAS_WEEKLY_DIR / "state.json"
TODOCONSOLAS_WEEKLY_CAMPAIGNS = TODOCONSOLAS_WEEKLY_DIR / "campaigns"
TODOCONSOLAS_WEEKLY_DISABLED_MARKER = TODOCONSOLAS_WEEKLY_DIR / "disabled-status.lock"
WALLAPOP_PAL_DIR = RUN_DIR / "wallapop-pal"
WALLAPOP_PAL_STATE = WALLAPOP_PAL_DIR / "state.json"
PC_RUNTIME_CONTROL = RUN_DIR / "pc-control.json"
PC_WORKER_HEALTH_MARKER = RUN_DIR / "pc-worker-health.lock"
PC_AUTO_UPDATE_STATE = RUN_DIR / "pc-auto-update.json"
WORKER_RESTART_EXIT_CODE = 75


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_env_file(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        clean_key = key.strip()
        clean_value = value.strip().strip('"').strip("'")
        if override:
            os.environ[clean_key] = clean_value
        else:
            os.environ.setdefault(clean_key, clean_value)


def load_local_env() -> None:
    load_env_file(ROOT / ".env.local")
    load_env_file(ROOT / ".env.worker", override=True)


@dataclass(frozen=True)
class WorkerConfig:
    host: str
    port: int
    username: str
    password: str
    remote_root: str
    public_url: str
    runner_id: str


def derive_remote_root() -> str:
    explicit = os.environ.get("PRICE_WORKER_REMOTE_DIR", "").strip()
    if explicit:
        return explicit.strip("/")
    covers_root = os.environ.get("COVERS_FTP_REMOTE_ROOT", "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers").strip("/")
    if covers_root.lower().endswith("/covers"):
        return covers_root[:-len("/covers")] + "/price-worker"
    return f"{covers_root}/price-worker"


def load_config() -> WorkerConfig:
    host = (
        os.environ.get("PRICE_WORKER_SFTP_HOST")
        or os.environ.get("COVERS_FTP_HOST")
        or os.environ.get("PRICE_WORKER_SSH_HOST")
        or ""
    ).strip()
    username = (
        os.environ.get("PRICE_WORKER_SFTP_USER")
        or os.environ.get("COVERS_FTP_USER")
        or os.environ.get("PRICE_WORKER_SSH_USER")
        or ""
    ).strip()
    password = (
        os.environ.get("PRICE_WORKER_SFTP_PASSWORD")
        or os.environ.get("COVERS_FTP_PASSWORD")
        or os.environ.get("PRICE_WORKER_SSH_PASSWORD")
        or ""
    ).strip()
    port = int(
        os.environ.get("PRICE_WORKER_SFTP_PORT")
        or os.environ.get("COVERS_FTP_PORT")
        or os.environ.get("PRICE_WORKER_SSH_PORT")
        or "22"
    )
    if not host or not username or not password:
        raise SystemExit("Faltan credenciales SFTP: configura PRICE_WORKER_SFTP_HOST/USER/PASSWORD en .env.worker.")
    return WorkerConfig(
        host=host,
        port=port,
        username=username,
        password=password,
        remote_root=derive_remote_root(),
        public_url=os.environ.get("PRICE_WORKER_PUBLIC_URL", DEFAULT_PUBLIC_URL).rstrip("/"),
        runner_id=os.environ.get("REGION_ATLAS_PC_WORKER_ID", "windows-pc-worker").strip() or "windows-pc-worker",
    )


class SftpQueue:
    def __init__(self, config: WorkerConfig) -> None:
        try:
            import paramiko  # type: ignore
        except ModuleNotFoundError as exc:
            raise SystemExit("Falta paramiko. Ejecuta: py -m pip install paramiko") from exc
        self._paramiko = paramiko
        self.config = config
        self.client: Any | None = None
        self.sftp: Any | None = None

    def __enter__(self) -> "SftpQueue":
        self.client = self._paramiko.SSHClient()
        self.client.set_missing_host_key_policy(self._paramiko.AutoAddPolicy())
        self.client.connect(
            self.config.host,
            port=self.config.port,
            username=self.config.username,
            password=self.config.password,
            timeout=30,
            banner_timeout=30,
            auth_timeout=30,
        )
        self.sftp = self.client.open_sftp()
        return self

    def __exit__(self, *_exc: object) -> None:
        if self.sftp is not None:
            self.sftp.close()
        if self.client is not None:
            self.client.close()

    def remote(self, *parts: str) -> str:
        return posixpath.join(self.config.remote_root.strip("/"), *[part.strip("/") for part in parts if part])

    def mkdir_p(self, remote_dir: str) -> None:
        current = ""
        for part in remote_dir.strip("/").split("/"):
            current = f"{current}/{part}" if current else part
            try:
                self.sftp.stat(current)
            except OSError:
                self.sftp.mkdir(current)

    def exists(self, remote_path: str) -> bool:
        try:
            self.sftp.stat(remote_path)
            return True
        except OSError:
            return False

    def list_json(self, remote_dir: str) -> list[str]:
        try:
            return sorted(name for name in self.sftp.listdir(remote_dir) if name.endswith(".json"))
        except OSError:
            self.mkdir_p(remote_dir)
            return []

    def read_json(self, remote_path: str) -> dict[str, Any]:
        with self.sftp.open(remote_path, "r") as handle:
            return json.loads(handle.read().decode("utf-8"))

    def download(self, remote_path: str, local_path: Path) -> None:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        self.sftp.get(remote_path, str(local_path))

    def upload_bytes(self, remote_path: str, payload: bytes) -> None:
        self.mkdir_p(posixpath.dirname(remote_path))
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(payload)
            tmp_path = Path(tmp.name)
        try:
            self.sftp.put(str(tmp_path), remote_path)
        finally:
            tmp_path.unlink(missing_ok=True)

    def upload_file(self, remote_path: str, local_path: Path) -> None:
        self.mkdir_p(posixpath.dirname(remote_path))
        self.sftp.put(str(local_path), remote_path)

    def rename(self, source: str, target: str) -> bool:
        self.mkdir_p(posixpath.dirname(target))
        try:
            self.sftp.rename(source, target)
            return True
        except OSError:
            return False


def json_bytes(payload: dict[str, Any]) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def json_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def tail(path: Path, limit: int = 80000) -> str:
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="ignore")
    return text[-limit:]


def command_base_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("PYTHONLEGACYWINDOWSSTDIO", "0")
    env.setdefault("PRICE_WORKER_DAILY", "1")
    env.setdefault("REGION_VISION_DISABLED", "1")
    return env


def env_enabled(name: str) -> bool:
    return os.environ.get(name, "0").strip().lower() in {"1", "true", "yes", "on"}


def effective_todoconsolas_weekly_config() -> dict[str, Any]:
    control = load_runtime_control(PC_RUNTIME_CONTROL)
    remote = control.get("todoConsolasWeekly") if isinstance(control.get("todoConsolasWeekly"), dict) else None
    hard_disabled = env_enabled("PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED")
    if remote is not None and not hard_disabled:
        return {
            "enabled": bool(remote.get("enabled")),
            "platforms": ",".join(str(item) for item in remote.get("platforms") or []),
            "pagesPerRun": str(remote.get("pagesPerRun") or 1),
            "delaySeconds": str(remote.get("delaySeconds") or 8),
            "jitterSeconds": str(remote.get("jitterSeconds") or 3),
            "backoffHours": str(remote.get("backoffHours") or 24),
            "intervalDays": str(remote.get("intervalDays") or 7),
            "source": "admin_control",
        }
    return {
        "enabled": env_enabled("PRICE_PC_TODOCONSOLAS_WEEKLY_ENABLED") and not hard_disabled,
        "platforms": os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_PLATFORMS", "").strip(),
        "pagesPerRun": os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_PAGES_PER_RUN", "2"),
        "delaySeconds": os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_DELAY_SECONDS", "6"),
        "jitterSeconds": os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_JITTER_SECONDS", "2"),
        "backoffHours": os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_BACKOFF_HOURS", "24"),
        "intervalDays": os.environ.get("PRICE_PC_TODOCONSOLAS_WEEKLY_INTERVAL_DAYS", "7"),
        "source": "local_env",
    }


def effective_wallapop_pal_config() -> dict[str, Any]:
    from wallapop_pal_campaign import effective_settings

    control = load_runtime_control(PC_RUNTIME_CONTROL)
    remote = control.get("wallapopPalCampaign")
    settings = effective_settings(remote if isinstance(remote, dict) else {})
    if env_enabled("PRICE_PC_WALLAPOP_PAL_HARD_DISABLED"):
        settings["enabled"] = False
        settings["source"] = "hard_stop"
    else:
        settings["source"] = "admin_control" if isinstance(remote, dict) else "default_off"
    return settings


def run_logged(cmd: list[str], log_path: Path, env: dict[str, str], timeout: int | None = None) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8", errors="ignore") as log:
        log.write(f"\n=== {' '.join(cmd)} · {now_iso()} ===\n")
        log.flush()
        proc = subprocess.run(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        log.write(f"\n=== exit {proc.returncode} · {now_iso()} ===\n")
        return proc.returncode


def build_admin_collect_args(job: dict[str, Any], status_file: Path) -> list[str]:
    args = [sys.executable, str(ROOT / "scripts" / "admin_price_collect.py"), "--status-file", str(status_file)]
    mode = job.get("mode")
    if mode == "catalog":
        args.extend(["--catalog-id", str(job.get("catalogId") or "")])
    elif mode == "wallapop_batch":
        args.extend(
            [
                "--catalog-ids-json",
                json.dumps(job.get("catalogIds") or [], ensure_ascii=False),
            ]
        )
    elif mode == "platform":
        args.extend(["--platform", str(job.get("platformSlug") or "")])
        if str(job.get("region") or "").strip():
            args.extend(["--region", str(job["region"])])
        if job.get("advanceRotation"):
            args.append("--advance-rotation")
    else:
        args.extend(["--targets-json", json.dumps(job.get("targets") or [], ensure_ascii=False)])
    return args


def process_price_request(queue: SftpQueue, request_name: str) -> bool:
    request_path = queue.remote("jobs", "requests", request_name)
    job_id = request_name.removesuffix(".json")
    running_path = queue.remote("jobs", "running", request_name)
    done_path = queue.remote("jobs", "done", request_name)
    status_remote = queue.remote("jobs", f"{job_id}.json")
    log_remote = queue.remote("logs", f"{job_id}.log")
    if not queue.rename(request_path, running_path):
        return False

    job = queue.read_json(running_path)
    started_at = job.get("startedAt") or now_iso()
    status = {
        "jobId": job_id,
        "status": "running",
        "catalogId": job.get("catalogId"),
        "catalogIds": job.get("catalogIds"),
        "source": job.get("source"),
        "platformSlug": job.get("platformSlug"),
        "region": job.get("region"),
        "targets": job.get("targets"),
        "estimateMinutes": job.get("estimateMinutes"),
        "trigger": job.get("trigger") or "manual",
        "campaignId": job.get("campaignId"),
        "startedAt": started_at,
        "updatedAt": now_iso(),
        "runnerId": queue.config.runner_id,
    }
    status_file = STATUS_DIR / f"{job_id}.json"
    log_file = LOG_DIR / f"{job_id}.log"
    status_file.parent.mkdir(parents=True, exist_ok=True)
    status_file.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(status))

    # Las decisiones humanas son memoria operativa del clasificador. Descarga
    # la cola vigente antes de recolectar para no aprender de una copia antigua.
    local_review_queue = ROOT / "data" / "admin" / "price-review-queue.json"
    remote_review_queue = queue.remote("app", "data", "admin", "price-review-queue.json")
    if queue.exists(remote_review_queue):
        queue.download(remote_review_queue, local_review_queue)

    env = command_base_env()
    env["PRICE_COLLECT_TRIGGER"] = "automatic" if job.get("trigger") == "automatic" else "manual"
    if job.get("mode") == "wallapop_batch":
        # Esta tanda usa todas las imágenes del anuncio cuando el texto no basta.
        # Los jobs heredados conservan el modo ligero del PC.
        env.pop("REGION_VISION_DISABLED", None)
        env["DAILY_USE_CACHE"] = "0"
        env.setdefault("INGEST_WALLAPOP_PER_GAME_PAGES", "1")
        env.setdefault("WALLAPOP_DETAIL_LIMIT_PER_GAME", "6")
        env.setdefault("WALLAPOP_REQUEST_DELAY", "1.5")
    git_health = worker_git_health(ROOT)
    if job.get("mode") == "wallapop_batch" and git_health.get("clean") is not True:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        log_file.write_text(
            "Tanda Wallapop cancelada: el checkout del PC no estaba limpio antes de empezar.\n",
            encoding="utf-8",
        )
        code = 2
        status["error"] = "El PC tiene cambios locales; la tanda no se ejecuta sobre un catálogo incierto."
        status_file.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        code = run_logged(build_admin_collect_args(job, status_file), log_file, env)
    try:
        final_status = json.loads(status_file.read_text(encoding="utf-8"))
    except Exception:
        final_status = status
    final_status.update(
        {
            "jobId": job_id,
            "status": "done" if code == 0 else "error",
            "exitCode": code,
            "finishedAt": final_status.get("finishedAt") or now_iso(),
            "updatedAt": now_iso(),
            "runnerId": queue.config.runner_id,
        }
    )
    if code != 0 and not final_status.get("error"):
        final_status["error"] = f"Worker PC termino con codigo {code}."
    if code != 0 and job.get("mode") == "wallapop_batch":
        from wallapop_pal_campaign import is_blocking_job

        log_tail = tail(log_file)
        if is_blocking_job({"error": final_status.get("error"), "logTail": log_tail}):
            final_status["blocked"] = True
            final_status["blockReason"] = "Wallapop devolvio una señal de bloqueo; no se reintentara automaticamente."
            final_status["error"] = final_status.get("error") or final_status["blockReason"]
    if code == 0 and job.get("mode") == "wallapop_batch":
        local_result_raw = str(final_status.get("resultLocalPath") or "").strip()
        local_result = (ROOT / local_result_raw).resolve() if local_result_raw else None
        allowed_root = (RESULTS_DIR / job_id).resolve()
        ingest_raw = str(final_status.get("ingestPath") or "").strip()
        local_ingest = (ROOT / ingest_raw).resolve() if ingest_raw else None
        expected_ingest_name = f"{job.get('platformSlug')}-wallapop-batch-{job_id}.json"
        if (
            local_result is None
            or local_result.parent != allowed_root
            or local_result.name != "catalog-price-results.json"
            or not local_result.exists()
            or local_ingest is None
            or local_ingest.parent != (ROOT / "data" / "price-ingest").resolve()
            or local_ingest.name != expected_ingest_name
            or not local_ingest.exists()
        ):
            code = 1
            final_status["status"] = "error"
            final_status["exitCode"] = 1
            final_status["error"] = "La tanda terminó sin un artefacto de precios limitado y verificable."
        else:
            result_remote = queue.remote("results", job_id, "catalog-price-results.json")
            ingest_remote = queue.remote("results", job_id, "wallapop-ingest.json")
            queue.upload_file(result_remote, local_result)
            queue.upload_file(ingest_remote, local_ingest)
            final_status["resultPath"] = f"results/{job_id}/catalog-price-results.json"
            final_status["ingestResultPath"] = f"results/{job_id}/wallapop-ingest.json"
        final_status.pop("resultLocalPath", None)
        final_status.pop("ingestPath", None)
    if code == 0 and local_review_queue.exists():
        try:
            final_status["reviewQueueItems"] = upload_price_review_queue_verified(queue)
        except Exception as exc:  # noqa: BLE001
            final_status["reviewQueueSyncError"] = str(exc)
    status_file.write_text(json.dumps(final_status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(final_status))
    queue.upload_file(log_remote, log_file)
    queue.rename(running_path, done_path)
    return True


def process_import_request(queue: SftpQueue, request_name: str) -> bool:
    request_path = queue.remote("jobs", "import-requests", request_name)
    import_id = request_name.removesuffix(".json")
    running_path = queue.remote("jobs", "import-running", request_name)
    done_path = queue.remote("jobs", "import-done", request_name)
    if not queue.rename(request_path, running_path):
        return False
    request = queue.read_json(running_path)
    platform = str(request.get("platformSlug") or "")
    result_path = str(request.get("resultPath") or "").removeprefix("/").removeprefix("app/")
    local_input = RESULTS_DIR / import_id / Path(result_path).name
    log_file = LOG_DIR / f"import-{import_id}.log"
    try:
        queue.download(queue.remote("app", result_path), local_input)
    except OSError:
        queue.download(queue.remote(result_path), local_input)

    env = command_base_env()
    code = run_logged(
        [
            sys.executable,
            str(ROOT / "scripts" / "sync_es_prices.py"),
            "--platform",
            platform,
            "--input",
            str(local_input),
            "--no-advance-rotation",
            "--no-vision",
        ],
        log_file,
        env,
        timeout=3600,
    )
    upload_price_review_queue(queue)
    update_local_game_queue_import(queue, import_id, code, tail(log_file, 12000))
    queue.upload_file(queue.remote("logs", f"import-{import_id}.log"), log_file)
    queue.rename(running_path, done_path)
    return True


def process_catalog_entity_audit_request(
    queue: SftpQueue,
    review_id: str,
    running_path: str,
    done_path: str,
    status_remote: str,
    log_remote: str,
    request: dict[str, Any],
) -> bool:
    local_dir = RESULTS_DIR / "catalog-entity-audit" / review_id
    input_dir = local_dir / "input"
    output_file = local_dir / "catalog-html-entity-audit.json"
    status_file = STATUS_DIR / f"review-{review_id}.json"
    log_file = LOG_DIR / f"review-{review_id}.log"
    local_dir.mkdir(parents=True, exist_ok=True)
    input_dir.mkdir(parents=True, exist_ok=True)

    status = {
        "jobId": review_id,
        "jobType": "catalog_entity_audit",
        "status": "running",
        "startedAt": now_iso(),
        "updatedAt": now_iso(),
        "runnerId": queue.config.runner_id,
        "message": "Auditoría de entidades del catálogo ejecutándose en PC.",
    }
    status_file.write_text(json_text(status), encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(status))
    queue.upload_bytes(queue.remote("app", "data", "admin", "catalog-html-entity-audit-status.json"), json_bytes(status))

    downloads = [
        ("catalog.json", queue.remote("app", "data", "catalog.json"), ROOT / "data" / "catalog.json"),
        ("game-details.json", queue.remote("app", "data", "game-details.json"), ROOT / "data" / "game-details.json"),
        (
            "price-review-queue.json",
            queue.remote("app", "data", "admin", "price-review-queue.json"),
            ROOT / "data" / "admin" / "price-review-queue.json",
        ),
    ]
    for filename, remote_path, fallback_path in downloads:
        target = input_dir / filename
        try:
            queue.download(remote_path, target)
        except OSError:
            target.parent.mkdir(parents=True, exist_ok=True)
            if fallback_path.exists():
                target.write_bytes(fallback_path.read_bytes())
            elif filename == "price-review-queue.json":
                target.write_text('{"schemaVersion":1,"updatedAt":"","items":[],"decisions":[]}\n', encoding="utf-8")
            else:
                target.write_text("{}\n" if filename == "game-details.json" else "[]\n", encoding="utf-8")

    env = command_base_env()
    code = run_logged(
        [
            sys.executable,
            str(ROOT / "scripts" / "audit_catalog_html_entities.py"),
            "--catalog",
            str(input_dir / "catalog.json"),
            "--details",
            str(input_dir / "game-details.json"),
            "--price-review",
            str(input_dir / "price-review-queue.json"),
            "--output",
            str(output_file),
        ],
        log_file,
        env,
        timeout=1800,
    )
    summary: dict[str, Any] = {}
    if output_file.exists():
        try:
            summary = json.loads(output_file.read_text(encoding="utf-8")).get("summary") or {}
        except Exception:
            summary = {}
        queue.upload_file(queue.remote("app", "data", "admin", "catalog-html-entity-audit.json"), output_file)

    final_status = {
        **status,
        "status": "done" if code == 0 else "error",
        "exitCode": code,
        "finishedAt": now_iso(),
        "updatedAt": now_iso(),
        "summary": summary,
        "requestedAt": request.get("requestedAt"),
        "logTail": tail(log_file, 12000),
        "reportPath": "app/data/admin/catalog-html-entity-audit.json",
    }
    if code != 0:
        final_status["error"] = "Auditoría de entidades del catálogo terminó con error."
    status_file.write_text(json_text(final_status), encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(final_status))
    queue.upload_bytes(queue.remote("app", "data", "admin", "catalog-html-entity-audit-status.json"), json_bytes(final_status))
    queue.upload_file(log_remote, log_file)
    queue.rename(running_path, done_path)
    return True


def process_catalog_entity_migration_plan_request(
    queue: SftpQueue,
    review_id: str,
    running_path: str,
    done_path: str,
    status_remote: str,
    log_remote: str,
    request: dict[str, Any],
) -> bool:
    local_dir = RESULTS_DIR / "catalog-entity-plan" / review_id
    input_dir = local_dir / "input"
    output_file = local_dir / "catalog-entity-migration-plan.json"
    status_file = STATUS_DIR / f"review-{review_id}.json"
    log_file = LOG_DIR / f"review-{review_id}.log"
    local_dir.mkdir(parents=True, exist_ok=True)
    input_dir.mkdir(parents=True, exist_ok=True)

    status = {
        "jobId": review_id,
        "jobType": "catalog_entity_migration_plan",
        "status": "running",
        "startedAt": now_iso(),
        "updatedAt": now_iso(),
        "runnerId": queue.config.runner_id,
        "message": "Plan de limpieza del catálogo ejecutándose en PC.",
    }
    status_file.write_text(json_text(status), encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(status))
    queue.upload_bytes(queue.remote("app", "data", "admin", "catalog-entity-migration-plan-status.json"), json_bytes(status))

    downloads = [
        ("catalog.json", queue.remote("app", "data", "catalog.json"), ROOT / "data" / "catalog.json"),
        ("game-details.json", queue.remote("app", "data", "game-details.json"), ROOT / "data" / "game-details.json"),
        (
            "price-review-queue.json",
            queue.remote("app", "data", "admin", "price-review-queue.json"),
            ROOT / "data" / "admin" / "price-review-queue.json",
        ),
    ]
    for filename, remote_path, fallback_path in downloads:
        target = input_dir / filename
        try:
            queue.download(remote_path, target)
        except OSError:
            target.parent.mkdir(parents=True, exist_ok=True)
            if fallback_path.exists():
                target.write_bytes(fallback_path.read_bytes())
            elif filename == "price-review-queue.json":
                target.write_text('{"schemaVersion":1,"updatedAt":"","items":[],"decisions":[]}\n', encoding="utf-8")
            else:
                target.write_text("{}\n" if filename == "game-details.json" else "[]\n", encoding="utf-8")

    env = command_base_env()
    target = str(request.get("target") or "percent27")
    code = run_logged(
        [
            sys.executable,
            str(ROOT / "scripts" / "plan_catalog_entity_migration.py"),
            "--catalog",
            str(input_dir / "catalog.json"),
            "--details",
            str(input_dir / "game-details.json"),
            "--price-review",
            str(input_dir / "price-review-queue.json"),
            "--output",
            str(output_file),
            "--target",
            target,
        ],
        log_file,
        env,
        timeout=1800,
    )
    summary: dict[str, Any] = {}
    if output_file.exists():
        try:
            summary = json.loads(output_file.read_text(encoding="utf-8")).get("summary") or {}
        except Exception:
            summary = {}
        queue.upload_file(queue.remote("app", "data", "admin", "catalog-entity-migration-plan.json"), output_file)

    final_status = {
        **status,
        "status": "done" if code == 0 else "error",
        "exitCode": code,
        "finishedAt": now_iso(),
        "updatedAt": now_iso(),
        "summary": summary,
        "requestedAt": request.get("requestedAt"),
        "logTail": tail(log_file, 12000),
        "reportPath": "app/data/admin/catalog-entity-migration-plan.json",
    }
    if code != 0:
        final_status["error"] = "Plan de limpieza del catálogo terminó con error."
    status_file.write_text(json_text(final_status), encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(final_status))
    queue.upload_bytes(queue.remote("app", "data", "admin", "catalog-entity-migration-plan-status.json"), json_bytes(final_status))
    queue.upload_file(log_remote, log_file)
    queue.rename(running_path, done_path)
    return True


def process_review_request(queue: SftpQueue, request_name: str) -> bool:
    request_path = queue.remote("jobs", "review-requests", request_name)
    review_id = request_name.removesuffix(".json")
    running_path = queue.remote("jobs", "review-running", request_name)
    done_path = queue.remote("jobs", "review-done", request_name)
    status_remote = queue.remote("jobs", f"review-{review_id}.json")
    log_remote = queue.remote("logs", f"review-{review_id}.log")
    if not queue.rename(request_path, running_path):
        return False

    local_dir = RESULTS_DIR / "review-vision" / review_id
    local_request = local_dir / "request.json"
    local_queue = ROOT / "data" / "admin" / "price-review-queue.json"
    status_file = STATUS_DIR / f"review-{review_id}.json"
    log_file = LOG_DIR / f"review-{review_id}.log"
    local_dir.mkdir(parents=True, exist_ok=True)
    queue.download(running_path, local_request)
    request = json.loads(local_request.read_text(encoding="utf-8"))
    if request.get("jobType") == "catalog_entity_audit":
        return process_catalog_entity_audit_request(
            queue,
            review_id,
            running_path,
            done_path,
            status_remote,
            log_remote,
            request,
        )
    if request.get("jobType") == "catalog_entity_migration_plan":
        return process_catalog_entity_migration_plan_request(
            queue,
            review_id,
            running_path,
            done_path,
            status_remote,
            log_remote,
            request,
        )
    job_type = str(request.get("jobType") or "price_review_vision")
    if job_type not in {"price_review_vision", "price_review_images"}:
        error_status = {
            "jobId": review_id,
            "jobType": job_type,
            "status": "error",
            "finishedAt": now_iso(),
            "updatedAt": now_iso(),
            "error": f"Tipo de job de revisión no permitido: {job_type}",
        }
        queue.upload_bytes(status_remote, json_bytes(error_status))
        queue.rename(running_path, done_path)
        return True
    try:
        queue.download(queue.remote("app", "data", "admin", "price-review-queue.json"), local_queue)
    except OSError:
        local_queue.parent.mkdir(parents=True, exist_ok=True)
        if not local_queue.exists():
            local_queue.write_text('{"schemaVersion":1,"updatedAt":"","items":[],"decisions":[]}\n', encoding="utf-8")

    status = {
        "jobId": review_id,
        "status": "running",
        "jobType": job_type,
        "platformSlug": request.get("platformSlug"),
        "source": request.get("source"),
        "query": request.get("query"),
        "triageBucket": request.get("triageBucket"),
        "visionLimit": request.get("visionLimit"),
        "mediaLimit": request.get("mediaLimit"),
        "captureOnly": request.get("captureOnly") is True,
        "startedAt": now_iso(),
        "updatedAt": now_iso(),
        "runnerId": queue.config.runner_id,
    }
    status_file.write_text(json_text(status), encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(status))

    env = command_base_env()
    code = run_logged(
        [
            sys.executable,
            str(ROOT / "scripts" / "auto_price_review_vision.py"),
            "--request",
            str(local_request),
            "--queue",
            str(local_queue),
            "--status-file",
            str(status_file),
        ],
        log_file,
        env,
        timeout=7200,
    )
    try:
        final_status = json.loads(status_file.read_text(encoding="utf-8"))
    except Exception:
        final_status = status
    final_status.update(
        {
            "jobId": review_id,
            "jobType": job_type,
            "status": "done" if code == 0 else "error",
            "exitCode": code,
            "finishedAt": final_status.get("finishedAt") or now_iso(),
            "updatedAt": now_iso(),
            "runnerId": queue.config.runner_id,
            "logTail": tail(log_file, 12000),
        }
    )
    if code != 0 and not final_status.get("error"):
        label = "Captura de portadas PC" if job_type == "price_review_images" else "Auto-revisión IA PC"
        final_status["error"] = f"{label} terminó con código {code}."
    status_file.write_text(json_text(final_status), encoding="utf-8")
    upload_price_review_queue(queue)
    queue.upload_bytes(status_remote, json_bytes(final_status))
    queue.upload_file(log_remote, log_file)
    queue.rename(running_path, done_path)
    return True


def upload_price_review_queue(queue: SftpQueue) -> None:
    review_file = ROOT / "data" / "admin" / "price-review-queue.json"
    if not review_file.exists():
        return
    queue.upload_file(queue.remote("app", "data", "admin", "price-review-queue.json"), review_file)


def upload_price_review_queue_verified(queue: SftpQueue) -> int:
    from collectors.price_review_queue import merge_price_review_queue_documents

    review_file = ROOT / "data" / "admin" / "price-review-queue.json"
    if not review_file.exists():
        raise RuntimeError(f"No existe la cola local: {review_file}")
    remote_path = queue.remote("app", "data", "admin", "price-review-queue.json")
    local_payload = json.loads(review_file.read_text(encoding="utf-8"))
    if queue.exists(remote_path):
        remote_payload = queue.read_json(remote_path)
    else:
        remote_payload = {"items": [], "decisions": []}
    merged_payload = merge_price_review_queue_documents(remote_payload, local_payload)
    review_file.write_text(json_text(merged_payload), encoding="utf-8")
    queue.upload_file(remote_path, review_file)
    verified_payload = queue.read_json(remote_path)
    if verified_payload != merged_payload:
        raise RuntimeError("La lectura posterior no coincide con la cola local subida.")
    return len(merged_payload.get("items") or [])


def update_local_game_queue_import(queue: SftpQueue, import_id: str, code: int, log_tail: str) -> None:
    remote_path = queue.remote("app", "data", "admin", "local-game-runner-jobs.json")
    try:
        data = queue.read_json(remote_path)
    except Exception:
        data = {"schemaVersion": 1, "jobs": []}
    now = now_iso()
    for job in data.get("jobs", []):
        if job.get("id") == import_id:
            job["updatedAt"] = now
            job["importedAt"] = now if code == 0 else job.get("importedAt")
            job["importStatus"] = "imported" if code == 0 else "error"
            job["importError"] = None if code == 0 else f"sync_es_prices termino con codigo {code}"
            job["importLogTail"] = log_tail
            break
    data["updatedAt"] = now
    queue.upload_bytes(remote_path, json_bytes(data))


def run_daily_rotation(queue: SftpQueue) -> bool:
    lock_path = RUN_DIR / "daily.lock"
    interval_minutes = int(os.environ.get("PRICE_PC_DAILY_INTERVAL_MINUTES", "180"))
    if lock_path.exists():
        age = time.time() - lock_path.stat().st_mtime
        if age < interval_minutes * 60:
            return False
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.write_text(now_iso(), encoding="utf-8")
    log_file = LOG_DIR / "price-rotation.log"
    attempts_remote = queue.remote("cron", "price-rotation-attempts.json")
    env = command_base_env()
    env["PRICE_COLLECT_TRIGGER"] = "automatic"
    env.setdefault("DAILY_RETAIL_GAME_LIMIT", os.environ.get("PRICE_WORKER_DAILY_RETAIL_GAME_LIMIT", "120"))
    env.setdefault("DAILY_WALLAPOP_GAME_LIMIT", "50")
    env.setdefault("DAILY_COLLECTOR_TIMEOUT_SEC", "2400")
    started = {
        "id": f"pc-{int(time.time())}",
        "at": now_iso(),
        "status": "started",
        "label": queue.config.runner_id,
        "message": "Rueda lanzada desde PC worker.",
    }
    queue.upload_bytes(attempts_remote, json_bytes({"version": 1, "updatedAt": started["at"], "attempts": [started]}))
    code = run_logged([sys.executable, str(ROOT / "scripts" / "daily_price_ingest.py")], log_file, env, timeout=7200)
    finished = {
        **started,
        "at": now_iso(),
        "status": "done" if code == 0 else "error",
        "message": "Rueda terminada desde PC worker." if code == 0 else "La rueda fallo en PC worker.",
        "exitCode": code,
    }
    queue.upload_bytes(attempts_remote, json_bytes({"version": 1, "updatedAt": finished["at"], "attempts": [finished]}))
    queue.upload_file(queue.remote("cron", "price-rotation.log"), log_file)
    return True


def _upload_todoconsolas_weekly_artifacts(queue: SftpQueue, state: dict[str, Any]) -> None:
    campaign_id = str(state.get("campaignId") or "").strip()
    if not campaign_id:
        return
    local_campaign = TODOCONSOLAS_WEEKLY_CAMPAIGNS / campaign_id
    remote_campaign = queue.remote("cron", "todoconsolas-weekly", campaign_id)
    for filename in ("summary.json", "ready-for-git.json"):
        local_path = local_campaign / filename
        if local_path.exists():
            queue.upload_file(posixpath.join(remote_campaign, filename), local_path)
    for local_path in sorted((local_campaign / "ingest").glob("*.json")):
        queue.upload_file(posixpath.join(remote_campaign, "ingest", local_path.name), local_path)


def run_todoconsolas_weekly(queue: SftpQueue, settings: dict[str, Any]) -> bool:
    from collect_todoconsolas_weekly import state_needs_slice

    state = {}
    if TODOCONSOLAS_WEEKLY_STATE.exists():
        try:
            state = json.loads(TODOCONSOLAS_WEEKLY_STATE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            state = {}
    if not state_needs_slice(state):
        return False

    log_file = LOG_DIR / "todoconsolas-weekly.log"
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "collect_todoconsolas_weekly.py"),
        "--state",
        str(TODOCONSOLAS_WEEKLY_STATE),
        "--output-root",
        str(TODOCONSOLAS_WEEKLY_CAMPAIGNS),
        "--interval-days",
        str(settings["intervalDays"]),
        "--pages-per-run",
        str(settings["pagesPerRun"]),
        "--delay",
        str(settings["delaySeconds"]),
        "--jitter",
        str(settings["jitterSeconds"]),
        "--backoff-hours",
        str(settings["backoffHours"]),
    ]
    platforms = str(settings.get("platforms") or "").strip()
    if platforms:
        cmd.extend(["--platforms", platforms])
    code = run_logged(cmd, log_file, command_base_env(), timeout=900)

    try:
        state = json.loads(TODOCONSOLAS_WEEKLY_STATE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        state = {
            "schemaVersion": 1,
            "engine": "todoconsolas_weekly_public_categories",
            "status": "error",
            "lastError": {"at": now_iso(), "message": f"El proceso terminó con código {code} sin estado legible."},
        }
    status = {
        **state,
        "enabled": True,
        "runnerId": queue.config.runner_id,
        "hostname": socket.gethostname(),
        "workerCheckedAt": now_iso(),
        "exitCode": code,
    }
    queue.upload_bytes(queue.remote("cron", "todoconsolas-weekly-status.json"), json_bytes(status))
    queue.upload_file(queue.remote("cron", "todoconsolas-weekly.log"), log_file)
    _upload_todoconsolas_weekly_artifacts(queue, state)
    if code == 0:
        upload_price_review_queue_verified(queue)
    return True


def publish_todoconsolas_weekly_disabled_status(queue: SftpQueue) -> None:
    if TODOCONSOLAS_WEEKLY_DISABLED_MARKER.exists():
        age = time.time() - TODOCONSOLAS_WEEKLY_DISABLED_MARKER.stat().st_mtime
        if age < 60 * 60:
            return
    previous: dict[str, Any] = {}
    if TODOCONSOLAS_WEEKLY_STATE.exists():
        try:
            previous = json.loads(TODOCONSOLAS_WEEKLY_STATE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}
    checked_at = now_iso()
    status = {
        **previous,
        "schemaVersion": 1,
        "engine": "todoconsolas_weekly_public_categories",
        "enabled": False,
        "status": "disabled",
        "previousStatus": previous.get("status"),
        "runnerId": queue.config.runner_id,
        "hostname": socket.gethostname(),
        "workerCheckedAt": checked_at,
        "updatedAt": checked_at,
    }
    queue.upload_bytes(queue.remote("cron", "todoconsolas-weekly-status.json"), json_bytes(status))
    TODOCONSOLAS_WEEKLY_DISABLED_MARKER.parent.mkdir(parents=True, exist_ok=True)
    TODOCONSOLAS_WEEKLY_DISABLED_MARKER.write_text(checked_at, encoding="utf-8")


def _write_local_json(path: Path, payload: dict[str, Any]) -> None:
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


def _load_wallapop_state(settings: dict[str, Any]) -> dict[str, Any]:
    from wallapop_pal_campaign import ENGINE, new_state

    if WALLAPOP_PAL_STATE.exists():
        try:
            state = json.loads(WALLAPOP_PAL_STATE.read_text(encoding="utf-8"))
            if isinstance(state, dict) and state.get("engine") == ENGINE:
                return state
        except (OSError, json.JSONDecodeError):
            pass
    return new_state(settings)


def _wallapop_catalog() -> list[dict[str, Any]]:
    try:
        value = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _publish_wallapop_status(
    queue: SftpQueue,
    state: dict[str, Any],
    settings: dict[str, Any],
    catalog: list[dict[str, Any]],
) -> None:
    from wallapop_pal_campaign import public_state

    status = {
        **public_state(state, settings, catalog),
        "runnerId": queue.config.runner_id,
        "hostname": socket.gethostname(),
        "workerCheckedAt": now_iso(),
    }
    queue.upload_bytes(queue.remote("cron", "wallapop-pal-status.json"), json_bytes(status))
    artifact_manifest = {
        "schemaVersion": 1,
        "engine": status.get("engine"),
        "updatedAt": status.get("updatedAt"),
        "artifacts": [
            item for item in state.get("readyArtifacts") or []
            if isinstance(item, dict)
        ],
    }
    queue.upload_bytes(
        queue.remote("cron", "wallapop-pal-artifacts.json"),
        json_bytes(artifact_manifest),
    )


def _queue_wallapop_batch(
    queue: SftpQueue,
    state: dict[str, Any],
    batch: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    from wallapop_pal_campaign import MAX_BATCH_SIZE, mark_batch_queued

    catalog_ids = [str(item) for item in batch.get("catalogIds") or []]
    if not catalog_ids or len(catalog_ids) > MAX_BATCH_SIZE:
        raise RuntimeError("El coordinador Wallapop intento crear una tanda fuera del limite de 20.")
    timestamp = int(time.time())
    job_id = f"wallapop-pal-{timestamp}-{uuid.uuid4().hex[:6]}"
    started_at = now_iso()
    job = {
        "jobId": job_id,
        "status": "pending",
        "mode": "wallapop_batch",
        "catalogIds": catalog_ids,
        "platformSlug": batch.get("platformSlug"),
        "region": "PAL España",
        "source": "wallapop",
        "estimateMinutes": max(10, len(catalog_ids) * 2),
        "advanceRotation": False,
        "trigger": "automatic",
        "campaignId": state.get("campaignId"),
        "startedAt": started_at,
        "updatedAt": started_at,
        "runner": "sftp_queue",
    }
    running = {
        "jobId": job_id,
        "status": "running",
        "catalogIds": catalog_ids,
        "platformSlug": batch.get("platformSlug"),
        "region": "PAL España",
        "source": "wallapop",
        "estimateMinutes": job["estimateMinutes"],
        "trigger": "automatic",
        "campaignId": state.get("campaignId"),
        "startedAt": started_at,
        "updatedAt": started_at,
        "logTail": "Tanda creada por el robot Wallapop PAL; esperando al PC worker.",
    }
    queue.upload_bytes(queue.remote("jobs", f"{job_id}.json"), json_bytes(running))
    queue.upload_bytes(queue.remote("jobs", "requests", f"{job_id}.json"), json_bytes(job))
    return job_id, mark_batch_queued(state, batch, job_id)


def run_wallapop_pal_campaign(queue: SftpQueue, settings: dict[str, Any]) -> bool:
    from wallapop_pal_campaign import (
        reconcile_active_batch,
        select_next_batch,
    )

    catalog = _wallapop_catalog()
    state = _load_wallapop_state(settings)
    active = state.get("activeBatch") if isinstance(state.get("activeBatch"), dict) else None
    if active:
        job_id = str(active.get("jobId") or "")
        job: dict[str, Any] | None = None
        if job_id:
            try:
                job = queue.read_json(queue.remote("jobs", f"{job_id}.json"))
            except (OSError, json.JSONDecodeError):
                job = None
        state = reconcile_active_batch(
            state,
            job,
            settings,
            jitter_minutes=random.randint(0, int(settings.get("jitterMinutes") or 0)),
        )
        _write_local_json(WALLAPOP_PAL_STATE, state)
        _publish_wallapop_status(queue, state, settings, catalog)
        if state.get("activeBatch"):
            return False

    state, batch = select_next_batch(state, catalog, settings)
    if batch is not None:
        _, state = _queue_wallapop_batch(queue, state, batch)
        queued = True
    else:
        queued = False
    _write_local_json(WALLAPOP_PAL_STATE, state)
    _publish_wallapop_status(queue, state, settings, catalog)
    return queued


def process_wallapop_control_request(queue: SftpQueue, request_name: str) -> bool:
    from wallapop_pal_campaign import (
        WallapopCampaignControlError,
        effective_settings,
        new_state,
        normalize_control_request,
    )

    request_path = queue.remote("jobs", "wallapop-control-requests", request_name)
    running_path = queue.remote("jobs", "wallapop-control-running", request_name)
    done_path = queue.remote("jobs", "wallapop-control-done", request_name)
    failed_path = queue.remote("jobs", "wallapop-control-failed", request_name)
    public_path = queue.remote("cron", "wallapop-pal-control-status.json")
    request_id = request_name.removesuffix(".json")
    if not queue.rename(request_path, running_path):
        return False
    started_at = now_iso()
    try:
        request = queue.read_json(running_path)
        normalized = normalize_control_request(request)
        current_state = _load_wallapop_state(effective_wallapop_pal_config())
        if normalized.get("resetCycle") and current_state.get("activeBatch"):
            raise WallapopCampaignControlError(
                "No se puede reiniciar el ciclo mientras hay una tanda en marcha; apagalo y espera a que termine."
            )
        if normalized.get("action") == "disable" and isinstance(current_state.get("activeBatch"), dict):
            active = current_state["activeBatch"]
            job_id = str(active.get("jobId") or "")
            queued_path = queue.remote("jobs", "requests", f"{job_id}.json")
            cancelled_path = queue.remote("jobs", "cancelled", f"{job_id}.json")
            if job_id and queue.exists(queued_path) and queue.rename(queued_path, cancelled_path):
                cancelled_at = now_iso()
                current_state["activeBatch"] = None
                current_state["status"] = "disabled"
                current_state["nextRunAt"] = None
                current_state["lastAction"] = "queued_batch_cancelled"
                current_state["updatedAt"] = cancelled_at
                current_state["lastBatch"] = {
                    "jobId": job_id,
                    "platformSlug": active.get("platformSlug"),
                    "catalogIds": active.get("catalogIds") or [],
                    "titles": active.get("titles") or [],
                    "finishedAt": cancelled_at,
                    "error": "Tanda cancelada antes de empezar desde el admin.",
                }
                queue.upload_bytes(
                    queue.remote("jobs", f"{job_id}.json"),
                    json_bytes(
                        {
                            "jobId": job_id,
                            "status": "error",
                            "catalogIds": active.get("catalogIds") or [],
                            "platformSlug": active.get("platformSlug"),
                            "source": "wallapop",
                            "trigger": "automatic",
                            "finishedAt": cancelled_at,
                            "updatedAt": cancelled_at,
                            "error": "Tanda cancelada antes de empezar desde el admin.",
                        }
                    ),
                )
            elif job_id:
                current_state["status"] = "stopping"
                current_state["nextRunAt"] = None
                current_state["lastAction"] = "stop_requested_during_batch"
                current_state["updatedAt"] = now_iso()

        stored_settings = {
            "enabled": normalized["enabled"],
            "platforms": normalized["platforms"],
            "batchSize": normalized["batchSize"],
            "pauseMinutes": normalized["pauseMinutes"],
            "jitterMinutes": normalized["jitterMinutes"],
            "updatedAt": now_iso(),
            "updatedBy": normalized.get("requestId") or request_id,
        }
        control = load_runtime_control(PC_RUNTIME_CONTROL)
        control.update(
            {
                "schemaVersion": 1,
                "wallapopPalCampaign": stored_settings,
            }
        )
        _write_local_json(PC_RUNTIME_CONTROL, control)
        settings = effective_settings(stored_settings)
        if normalized.get("resetCycle"):
            ready_artifacts = [
                item for item in current_state.get("readyArtifacts") or []
                if isinstance(item, dict)
            ]
            current_state = new_state(settings)
            current_state["readyArtifacts"] = ready_artifacts
        elif settings.get("enabled") and current_state.get("status") == "disabled":
            current_state["status"] = "running"
            current_state["nextRunAt"] = now_iso()
            current_state["lastAction"] = "enabled_from_admin"
            current_state["updatedAt"] = now_iso()
        _write_local_json(WALLAPOP_PAL_STATE, current_state)
        catalog = _wallapop_catalog()
        _publish_wallapop_status(queue, current_state, settings, catalog)
        status = {
            "ok": True,
            "status": "configured",
            "requestId": normalized.get("requestId") or request_id,
            "action": normalized.get("action"),
            "enabled": settings.get("enabled"),
            "batchSize": settings.get("batchSize"),
            "pauseMinutes": settings.get("pauseMinutes"),
            "startedAt": started_at,
            "finishedAt": now_iso(),
            "runnerId": queue.config.runner_id,
            "hostname": socket.gethostname(),
        }
        queue.upload_bytes(public_path, json_bytes(status))
        queue.rename(running_path, done_path)
        return True
    except (WallapopCampaignControlError, OSError, json.JSONDecodeError, ValueError) as exc:
        status = {
            "ok": False,
            "status": "error",
            "requestId": request_id,
            "startedAt": started_at,
            "finishedAt": now_iso(),
            "runnerId": queue.config.runner_id,
            "hostname": socket.gethostname(),
            "error": str(exc),
        }
        queue.upload_bytes(public_path, json_bytes(status))
        queue.rename(running_path, failed_path)
        return True


def _supported_todoconsolas_platforms() -> set[str]:
    from collectors.tcns_client import supported_platform_slugs

    return set(supported_platform_slugs())


def clear_pc_worker_health_marker() -> None:
    try:
        PC_WORKER_HEALTH_MARKER.unlink(missing_ok=True)
    except OSError:
        pass


def process_worker_update_request(queue: SftpQueue, request_name: str) -> int:
    safe_id = "".join(character for character in request_name.removesuffix(".json") if character.isalnum() or character in "-_")
    request_id = safe_id or uuid.uuid4().hex
    request_path = queue.remote("jobs", "worker-update-requests", request_name)
    running_path = queue.remote("jobs", "worker-update-running", request_name)
    done_path = queue.remote("jobs", "worker-update-done", request_name)
    failed_path = queue.remote("jobs", "worker-update-failed", request_name)
    result_path = queue.remote("jobs", "worker-update-results", f"{request_id}.json")
    public_status_path = queue.remote("cron", "pc-worker-update-status.json")
    if not queue.rename(request_path, running_path):
        return 0

    started_at = now_iso()
    try:
        request = queue.read_json(running_path)
        result = apply_update_request(
            ROOT,
            request,
            control_path=PC_RUNTIME_CONTROL,
            allowed_platforms=_supported_todoconsolas_platforms(),
        )
        status = {
            **result,
            "requestId": request_id,
            "runnerId": queue.config.runner_id,
            "hostname": socket.gethostname(),
            "startedAt": started_at,
            "finishedAt": now_iso(),
        }
        queue.upload_bytes(result_path, json_bytes(status))
        queue.upload_bytes(public_status_path, json_bytes(status))
        queue.rename(running_path, done_path)
        if result.get("restartRequired"):
            clear_pc_worker_health_marker()
            return WORKER_RESTART_EXIT_CODE
        return 1
    except (WorkerUpdateError, OSError, json.JSONDecodeError, ValueError) as exc:
        status = {
            "ok": False,
            "status": "error",
            "requestId": request_id,
            "runnerId": queue.config.runner_id,
            "hostname": socket.gethostname(),
            "startedAt": started_at,
            "finishedAt": now_iso(),
            "error": str(exc),
        }
        queue.upload_bytes(result_path, json_bytes(status))
        queue.upload_bytes(public_status_path, json_bytes(status))
        queue.rename(running_path, failed_path)
        return 1


def pc_auto_update_enabled() -> bool:
    return os.environ.get("PRICE_PC_AUTO_UPDATE_ENABLED", "1").strip().lower() in {
        "1", "true", "yes", "on",
    }


def pc_auto_update_interval_seconds() -> int:
    try:
        value = int(os.environ.get("PRICE_PC_AUTO_UPDATE_INTERVAL_SECONDS", "600"))
    except ValueError:
        value = 600
    return max(300, min(value, 24 * 60 * 60))


def load_pc_auto_update_state() -> dict[str, Any]:
    if not PC_AUTO_UPDATE_STATE.exists():
        return {}
    try:
        value = json.loads(PC_AUTO_UPDATE_STATE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def maybe_auto_update_worker(queue: SftpQueue) -> int:
    if not pc_auto_update_enabled():
        return 0
    previous = load_pc_auto_update_state()
    last_checked = parse_iso(str(previous.get("checkedAt") or ""))
    if last_checked and time.time() - last_checked < pc_auto_update_interval_seconds():
        return 0

    checked_at = now_iso()
    public_status_path = queue.remote("cron", "pc-worker-auto-update-status.json")
    try:
        release = fetch_production_release(
            os.environ.get("PRICE_PC_PRODUCTION_RELEASE_URL", DEFAULT_PRODUCTION_RELEASE_URL).strip()
            or DEFAULT_PRODUCTION_RELEASE_URL,
        )
        health = worker_git_health(ROOT)
        current_sha = str(health.get("commitSha") or "")
        target_sha = release["commitSha"]
        if current_sha == target_sha and health.get("branch") == "main" and health.get("clean") is True:
            status = {
                "ok": True,
                "status": "already_current",
                "checkedAt": checked_at,
                "beforeSha": current_sha,
                "afterSha": current_sha,
                "targetSha": target_sha,
                "automatic": True,
            }
            _write_local_json(PC_AUTO_UPDATE_STATE, status)
            queue.upload_bytes(public_status_path, json_bytes(status))
            return 0

        request_id = f"auto-update-{int(time.time())}"
        result = apply_update_request(
            ROOT,
            {
                "schemaVersion": 1,
                "mode": "git_fast_forward_main_v1",
                "requestId": request_id,
                "targetSha": target_sha,
                "requestedAt": checked_at,
                "repository": "puntoracingrc/RegionAtlasGames",
                "branch": "main",
            },
            control_path=PC_RUNTIME_CONTROL,
            allowed_platforms=_supported_todoconsolas_platforms(),
        )
        status = {
            **result,
            "requestId": request_id,
            "targetSha": target_sha,
            "checkedAt": checked_at,
            "finishedAt": now_iso(),
            "automatic": True,
            "runnerId": queue.config.runner_id,
            "hostname": socket.gethostname(),
        }
        _write_local_json(PC_AUTO_UPDATE_STATE, status)
        queue.upload_bytes(public_status_path, json_bytes(status))
        queue.upload_bytes(queue.remote("cron", "pc-worker-update-status.json"), json_bytes(status))
        if result.get("restartRequired"):
            clear_pc_worker_health_marker()
            return WORKER_RESTART_EXIT_CODE
        return 0
    except (WorkerUpdateError, OSError, json.JSONDecodeError, ValueError) as exc:
        status = {
            "ok": False,
            "status": "error",
            "checkedAt": checked_at,
            "automatic": True,
            "error": str(exc),
        }
        _write_local_json(PC_AUTO_UPDATE_STATE, status)
        queue.upload_bytes(public_status_path, json_bytes(status))
        return 0


def publish_pc_worker_health(queue: SftpQueue, *, force: bool = False) -> None:
    if not force and PC_WORKER_HEALTH_MARKER.exists():
        age = time.time() - PC_WORKER_HEALTH_MARKER.stat().st_mtime
        if age < 5 * 60:
            return
    checked_at = now_iso()
    payload = {
        "schemaVersion": 1,
        "runnerId": queue.config.runner_id,
        "hostname": socket.gethostname(),
        "checkedAt": checked_at,
        "git": worker_git_health(ROOT),
        "todoConsolasWeekly": effective_todoconsolas_weekly_config(),
        "wallapopPalCampaign": effective_wallapop_pal_config(),
        "autoUpdate": {
            "enabled": pc_auto_update_enabled(),
            "intervalSeconds": pc_auto_update_interval_seconds(),
            **load_pc_auto_update_state(),
        },
    }
    queue.upload_bytes(queue.remote("cron", "pc-worker-health.json"), json_bytes(payload))
    PC_WORKER_HEALTH_MARKER.parent.mkdir(parents=True, exist_ok=True)
    PC_WORKER_HEALTH_MARKER.write_text(checked_at, encoding="utf-8")


def run_local_game_once() -> bool:
    if not os.environ.get("LOCAL_GAME_RUNNER_TOKEN", "").strip():
        return False
    log_file = LOG_DIR / "local-game-runner.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(ROOT / "scripts" / "local_game_runner.py"), "--once"]
    with log_file.open("a", encoding="utf-8", errors="ignore") as log:
        log.write(f"\n=== {' '.join(cmd)} · {now_iso()} ===\n")
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            env=command_base_env(),
            text=True,
            capture_output=True,
            timeout=900,
        )
        output = "\n".join(part for part in [proc.stdout, proc.stderr] if part)
        log.write(output)
        log.write(f"\n=== exit {proc.returncode} · {now_iso()} ===\n")
    return proc.returncode == 0 and "Job recibido:" in output


def parse_iso(value: str | None) -> float | None:
    if not value:
        return None
    try:
        clean = value.replace("Z", "+00:00")
        return datetime.fromisoformat(clean).timestamp()
    except ValueError:
        return None


def make_lock_payload(config: WorkerConfig, ttl_seconds: int) -> dict[str, Any]:
    started = datetime.now(timezone.utc).replace(microsecond=0)
    expires = datetime.fromtimestamp(started.timestamp() + ttl_seconds, timezone.utc).replace(microsecond=0)
    return {
        "lockId": uuid.uuid4().hex,
        "runnerId": config.runner_id,
        "hostname": socket.gethostname(),
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "expiresAt": expires.isoformat().replace("+00:00", "Z"),
    }


def summarize_request(name: str, payload: dict[str, Any]) -> str:
    mode = payload.get("mode") or payload.get("jobType") or "unknown"
    bits = [name, f"mode={mode}"]
    for key in ("platformSlug", "region", "catalogId", "offerType", "trigger"):
        value = payload.get(key)
        if value:
            bits.append(f"{key}={value}")
    targets = payload.get("targets")
    if isinstance(targets, list):
        bits.append(f"targets={len(targets)}")
    catalog_ids = payload.get("catalogIds")
    if isinstance(catalog_ids, list):
        bits.append(f"catalogIds={len(catalog_ids)}")
    return " · ".join(bits)


def dry_run_list(config: WorkerConfig) -> int:
    with SftpQueue(config) as queue:
        lock_path = queue.remote("jobs", "queue.lock")
        print(f"Worker root: {config.remote_root}")
        print(f"Runner: {config.runner_id} @ {socket.gethostname()}")
        if queue.exists(lock_path):
            try:
                lock = queue.read_json(lock_path)
            except Exception as exc:
                lock = {}
                print(f"Lock: stale/invalid · unreadable={exc}")
            if lock:
                expires_at = parse_iso(str(lock.get("expiresAt") or ""))
                status = "active" if expires_at and expires_at > time.time() else "stale"
                print(
                    "Lock: "
                    f"{status} · runnerId={lock.get('runnerId')} · hostname={lock.get('hostname')} · "
                    f"startedAt={lock.get('startedAt')} · expiresAt={lock.get('expiresAt')}"
                )
        else:
            print("Lock: none")

        import_dir = queue.remote("jobs", "import-requests")
        request_dir = queue.remote("jobs", "requests")
        update_dir = queue.remote("jobs", "worker-update-requests")
        import_requests = queue.list_json(import_dir)
        review_dir = queue.remote("jobs", "review-requests")
        review_requests = queue.list_json(review_dir)
        price_requests = queue.list_json(request_dir)
        update_requests = queue.list_json(update_dir)

        print(f"Worker update requests pending: {len(update_requests)}")
        for name in update_requests:
            try:
                request = queue.read_json(posixpath.join(update_dir, name))
                print(
                    "  would update: "
                    f"{name} · mode={request.get('mode')} · target={str(request.get('targetSha') or '')[:12]}"
                )
            except Exception as exc:
                print(f"  would update: {name} · unreadable={exc}")

        print(f"Import requests pending: {len(import_requests)}")
        for name in import_requests:
            try:
                print(f"  would import: {summarize_request(name, queue.read_json(posixpath.join(import_dir, name)))}")
            except Exception as exc:
                print(f"  would import: {name} · unreadable={exc}")

        print(f"Review requests pending: {len(review_requests)}")
        for name in review_requests:
            try:
                print(f"  would review: {summarize_request(name, queue.read_json(posixpath.join(review_dir, name)))}")
            except Exception as exc:
                print(f"  would review: {name} · unreadable={exc}")

        print(f"Price requests pending: {len(price_requests)}")
        for name in price_requests:
            try:
                print(f"  would run: {summarize_request(name, queue.read_json(posixpath.join(request_dir, name)))}")
            except Exception as exc:
                print(f"  would run: {name} · unreadable={exc}")

        if os.environ.get("LOCAL_GAME_RUNNER_TOKEN", "").strip():
            print("GAME local runner: token configured, not queried in dry-run to avoid claiming API jobs.")
        else:
            print("GAME local runner: disabled, LOCAL_GAME_RUNNER_TOKEN is not set.")
        weekly_config = effective_todoconsolas_weekly_config()
        weekly_state: dict[str, Any] = {}
        if TODOCONSOLAS_WEEKLY_STATE.exists():
            try:
                weekly_state = json.loads(TODOCONSOLAS_WEEKLY_STATE.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                weekly_state = {"status": "invalid_state"}
        print(
            "TodoConsolas weekly: "
            f"{'enabled' if weekly_config['enabled'] else 'disabled'} · "
            f"source={weekly_config['source']} · platforms={weekly_config['platforms'] or 'all'} · "
            f"status={weekly_state.get('status') or 'not_started'} · "
            f"campaign={weekly_state.get('campaignId') or 'none'}"
        )
        git_health = worker_git_health(ROOT)
        print(
            "Worker git: "
            f"commit={str(git_health.get('commitSha') or 'unknown')[:12]} · "
            f"branch={git_health.get('branch') or 'unknown'} · clean={git_health.get('clean')}"
        )
    return 0


class SftpLock:
    def __init__(self, queue: SftpQueue, ttl_seconds: int) -> None:
        self.queue = queue
        self.ttl_seconds = ttl_seconds
        self.path = queue.remote("jobs", "queue.lock")
        self.payload: dict[str, Any] | None = None

    def __enter__(self) -> "SftpLock":
        self.payload = make_lock_payload(self.queue.config, self.ttl_seconds)
        if self._try_create():
            return self

        existing = self._read_existing()
        expires_at = parse_iso(str(existing.get("expiresAt") or ""))
        if expires_at and expires_at > time.time():
            raise RuntimeError(
                f"Cola bloqueada por {existing.get('runnerId') or 'otro runner'} hasta {existing.get('expiresAt')}"
            )

        stamp = now_iso().replace(":", "").replace("-", "")
        stale_path = self.queue.remote("jobs", "locks", "stale", f"{stamp}-{existing.get('runnerId') or 'unknown'}.json")
        if not self.queue.rename(self.path, stale_path):
            raise RuntimeError("No se pudo reclamar queue.lock caducado.")
        if not self._try_create():
            raise RuntimeError("Otro runner reclamó la cola antes que este PC.")
        return self

    def __exit__(self, *_exc: object) -> None:
        if not self.payload:
            return
        try:
            current = self.queue.read_json(self.path)
        except Exception:
            return
        if current.get("lockId") != self.payload.get("lockId"):
            return
        stamp = now_iso().replace(":", "").replace("-", "")
        released_path = self.queue.remote("jobs", "locks", "released", f"{stamp}-{self.payload['runnerId']}.json")
        self.queue.rename(self.path, released_path)

    def _try_create(self) -> bool:
        assert self.payload is not None
        if self.queue.exists(self.path):
            return False
        try:
            self.queue.upload_bytes(self.path, json_bytes(self.payload))
            current = self.queue.read_json(self.path)
            return current.get("lockId") == self.payload.get("lockId")
        except OSError:
            return False

    def _read_existing(self) -> dict[str, Any]:
        try:
            return self.queue.read_json(self.path)
        except Exception:
            return {}


def run_once(config: WorkerConfig, *, daily: bool) -> int:
    with SftpQueue(config) as queue:
        lock_ttl = int(os.environ.get("PRICE_PC_LOCK_TTL_SECONDS", "21600"))
        try:
            with SftpLock(queue, lock_ttl):
                update_requests = queue.list_json(queue.remote("jobs", "worker-update-requests"))
                if update_requests:
                    return process_worker_update_request(queue, update_requests[0])
                wallapop_control_requests = queue.list_json(
                    queue.remote("jobs", "wallapop-control-requests")
                )
                if wallapop_control_requests:
                    return 1 if process_wallapop_control_request(
                        queue,
                        wallapop_control_requests[0],
                    ) else 0
                auto_update = maybe_auto_update_worker(queue)
                if auto_update == WORKER_RESTART_EXIT_CODE:
                    return auto_update
                publish_pc_worker_health(queue)
                if run_local_game_once():
                    return 1
                import_requests = queue.list_json(queue.remote("jobs", "import-requests"))
                if import_requests:
                    process_import_request(queue, import_requests[0])
                    return 1
                review_requests = queue.list_json(queue.remote("jobs", "review-requests"))
                if review_requests:
                    process_review_request(queue, review_requests[0])
                    return 1
                requests = queue.list_json(queue.remote("jobs", "requests"))
                if requests:
                    process_price_request(queue, requests[0])
                    return 1
                weekly_config = effective_todoconsolas_weekly_config()
                if daily and weekly_config["enabled"]:
                    if run_todoconsolas_weekly(queue, weekly_config):
                        return 1
                elif daily:
                    publish_todoconsolas_weekly_disabled_status(queue)
                wallapop_settings = effective_wallapop_pal_config()
                if daily and run_wallapop_pal_campaign(queue, wallapop_settings):
                    return 1
                if daily and env_enabled("PRICE_PC_LEGACY_ROTATION_ENABLED"):
                    return 1 if run_daily_rotation(queue) else 0
        except RuntimeError as exc:
            print(f"{now_iso()} {exc}")
            return 0
    return 0


def install_hint() -> None:
    print("Worker listo. Cola SFTP:", derive_remote_root())
    print("Para dejarlo permanente: powershell -ExecutionPolicy Bypass -File scripts\\worker\\install-region-atlas-worker.ps1")


def main() -> int:
    load_local_env()
    parser = argparse.ArgumentParser(description="Region Atlas PC SFTP worker")
    parser.add_argument("--once", action="store_true", help="Procesa como maximo un job y sale.")
    parser.add_argument("--daemon", action="store_true", help="Mantiene polling continuo. Sin esto, solo hace una pasada.")
    parser.add_argument("--interval", type=int, default=None, help="Segundos entre consultas; implica modo daemon.")
    parser.add_argument(
        "--daily",
        action="store_true",
        help="Permite motores dedicados. La rueda general solo arranca con PRICE_PC_LEGACY_ROTATION_ENABLED=1.",
    )
    parser.add_argument("--check", action="store_true", help="Verifica configuracion/conexion y sale.")
    parser.add_argument(
        "--upload-review-queue",
        action="store_true",
        help="Sube la cola local de revisión y verifica su lectura remota.",
    )
    parser.add_argument("--dry-run", "--list", action="store_true", help="Lista jobs pendientes y acciones sin mover ni ejecutar nada.")
    args = parser.parse_args()
    config = load_config()
    if args.dry_run:
        return dry_run_list(config)
    if args.check:
        with SftpQueue(config) as queue:
            queue.mkdir_p(queue.remote("jobs", "requests"))
            queue.mkdir_p(queue.remote("logs"))
        install_hint()
        return 0
    if args.upload_review_queue:
        with SftpQueue(config) as queue:
            uploaded = upload_price_review_queue_verified(queue)
        print(f"Cola de revisión subida y verificada: {uploaded} elementos.")
        return 0
    interval = args.interval if args.interval is not None else int(os.environ.get("PRICE_PC_WORKER_INTERVAL", "120"))
    daemon = args.daemon or args.interval is not None

    while True:
        try:
            processed = run_once(config, daily=args.daily)
            if processed == WORKER_RESTART_EXIT_CODE:
                print(f"{now_iso()} Worker actualizado; reinicio controlado solicitado.")
                return WORKER_RESTART_EXIT_CODE
            if processed == 0:
                print(f"{now_iso()} Sin jobs pendientes.")
        except Exception as exc:
            print(f"{now_iso()} ERROR worker PC: {exc}", file=sys.stderr)
            if args.once:
                return 1
        if args.once or not daemon:
            return 0
        time.sleep(max(15, interval))


if __name__ == "__main__":
    raise SystemExit(main())
