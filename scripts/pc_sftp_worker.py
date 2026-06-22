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

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PUBLIC_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker"
RUN_DIR = ROOT / "data" / "worker-runtime"
LOG_DIR = RUN_DIR / "logs"
STATUS_DIR = RUN_DIR / "status"
RESULTS_DIR = RUN_DIR / "results"


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
        "platformSlug": job.get("platformSlug"),
        "region": job.get("region"),
        "targets": job.get("targets"),
        "estimateMinutes": job.get("estimateMinutes"),
        "trigger": job.get("trigger") or "manual",
        "startedAt": started_at,
        "updatedAt": now_iso(),
        "runnerId": queue.config.runner_id,
    }
    status_file = STATUS_DIR / f"{job_id}.json"
    log_file = LOG_DIR / f"{job_id}.log"
    status_file.parent.mkdir(parents=True, exist_ok=True)
    status_file.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    queue.upload_bytes(status_remote, json_bytes(status))

    env = command_base_env()
    env["PRICE_COLLECT_TRIGGER"] = "automatic" if job.get("trigger") == "automatic" else "manual"
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
    update_local_game_queue_import(queue, import_id, code, tail(log_file, 12000))
    queue.upload_file(queue.remote("logs", f"import-{import_id}.log"), log_file)
    queue.rename(running_path, done_path)
    return True


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
        import_requests = queue.list_json(import_dir)
        price_requests = queue.list_json(request_dir)

        print(f"Import requests pending: {len(import_requests)}")
        for name in import_requests:
            try:
                print(f"  would import: {summarize_request(name, queue.read_json(posixpath.join(import_dir, name)))}")
            except Exception as exc:
                print(f"  would import: {name} · unreadable={exc}")

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
                if run_local_game_once():
                    return 1
                import_requests = queue.list_json(queue.remote("jobs", "import-requests"))
                if import_requests:
                    process_import_request(queue, import_requests[0])
                    return 1
                requests = queue.list_json(queue.remote("jobs", "requests"))
                if requests:
                    process_price_request(queue, requests[0])
                    return 1
                if daily and os.environ.get("PRICE_PC_DAILY_ENABLED", "0").lower() in {"1", "true", "yes"}:
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
    parser.add_argument("--daily", action="store_true", help="Permite ejecutar la rueda automatica si PRICE_PC_DAILY_ENABLED=1.")
    parser.add_argument("--check", action="store_true", help="Verifica configuracion/conexion y sale.")
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
    interval = args.interval if args.interval is not None else int(os.environ.get("PRICE_PC_WORKER_INTERVAL", "120"))
    daemon = args.daemon or args.interval is not None

    while True:
        try:
            processed = run_once(config, daily=args.daily)
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
