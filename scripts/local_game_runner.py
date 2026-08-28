#!/usr/bin/env python3
"""Runner local para GAME España.

Uso en el Mac:
  LOCAL_GAME_RUNNER_TOKEN=... python3 scripts/local_game_runner.py --once

El Mac NO abre puertos. Solo pregunta a Region Atlas si hay jobs GAME pendientes,
ejecuta collect_game_es.py desde la conexión local y sube resultado/log.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "https://www.regionatlas.games"
DEFAULT_WORKER_PUBLIC_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker"


def load_local_env() -> None:
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def request_json(base_url: str, path: str, token: str, payload: dict[str, Any], *, timeout: int = 30) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "RegionAtlasGamesLocalGameRunner/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def fetch_public_json(url: str, *, timeout: int = 30) -> dict[str, Any] | None:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "RegionAtlasGamesLocalGameRunner/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", errors="ignore"))
    except (urllib.error.URLError, json.JSONDecodeError):
        return None


def fetch_public_text(url: str, *, timeout: int = 30) -> str | None:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/plain,*/*",
            "User-Agent": "RegionAtlasGamesLocalGameRunner/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="ignore")
    except urllib.error.URLError:
        return None


def download_recent_results(job: dict[str, Any], recent_dir: Path) -> int:
    skip_days = int(job.get("skipRecentDays") or 0)
    if skip_days <= 0:
        return 0
    worker_base = os.environ.get("PRICE_WORKER_PUBLIC_URL", DEFAULT_WORKER_PUBLIC_URL).rstrip("/")
    queue = fetch_public_json(f"{worker_base}/app/data/admin/local-game-runner-jobs.json")
    jobs = queue.get("jobs") if isinstance(queue, dict) else []
    if not isinstance(jobs, list):
        return 0

    recent_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    current_id = str(job.get("id") or "")
    cutoff = datetime.now(timezone.utc) - timedelta(days=skip_days)
    for item in jobs[:80]:
        if not isinstance(item, dict) or str(item.get("id") or "") == current_id:
            continue
        if item.get("status") != "done" or not item.get("resultPath"):
            continue
        if str(item.get("jobType") or "api_collect") != str(job.get("jobType") or "api_collect"):
            continue
        if item.get("platformSlug") != job.get("platformSlug") or item.get("offerType") != job.get("offerType"):
            continue
        finished_at = str(item.get("finishedAt") or item.get("updatedAt") or "").strip()
        if finished_at:
            try:
                if datetime.fromisoformat(finished_at.replace("Z", "+00:00")) < cutoff:
                    continue
            except ValueError:
                continue
        result_path = str(item["resultPath"]).lstrip("/")
        url = f"{worker_base}/{result_path}"
        payload = fetch_public_json(url)
        if not payload:
            continue
        out = recent_dir / f"{item.get('id') or downloaded}.json"
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        downloaded += 1
    return downloaded


def collect_game(job: dict[str, Any]) -> tuple[bool, dict[str, Any] | None, str, str | None]:
    with tempfile.TemporaryDirectory(prefix="region-atlas-game-") as tmp:
        tmp_path = Path(tmp)
        output = tmp_path / f"{job['id']}.json"
        recent_dir = tmp_path / "recent"
        recent_downloaded = download_recent_results(job, recent_dir)
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "collect_game_es.py"),
            "--platform",
            str(job["platformSlug"]),
            "--offer-type",
            str(job["offerType"]),
            "--limit",
            str(int(job.get("limit") or 20)),
            "--start-page",
            str(int(job.get("startPage") or 0)),
            "--max-pages",
            str(int(job.get("maxPages") or 1)),
            "--skip-recent-days",
            str(int(job.get("skipRecentDays") or 0)),
            "--recent-dir",
            str(recent_dir),
            "--output",
            str(output),
            "--no-ai",
        ]
        env = os.environ.copy()
        env.setdefault("REGION_VISION_DISABLED", "1")
        proc = subprocess.run(cmd, cwd=ROOT, env=env, text=True, capture_output=True, timeout=180)
        prefix = f"Resultados recientes descargados para evitar repetidos: {recent_downloaded}\n" if int(job.get("skipRecentDays") or 0) > 0 else ""
        log = "\n".join(part for part in [prefix + proc.stdout, proc.stderr] if part).strip()
        if proc.returncode != 0:
            return False, None, log, f"collect_game_es terminó con código {proc.returncode}"
        if not output.exists():
            return False, None, log, "collect_game_es no generó archivo de resultado"
        result = json.loads(output.read_text())
        local_copy_dir = ROOT / "data" / "price-ingest" / "local-game"
        local_copy_dir.mkdir(parents=True, exist_ok=True)
        (local_copy_dir / f"{job['id']}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return True, result, log, None


def discover_game_releases(job: dict[str, Any]) -> tuple[bool, dict[str, Any] | None, str, str | None]:
    with tempfile.TemporaryDirectory(prefix="region-atlas-game-releases-") as tmp:
        tmp_path = Path(tmp)
        output = tmp_path / f"{job['id']}.json"
        recent_dir = tmp_path / "recent"
        recent_downloaded = download_recent_results(job, recent_dir)
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "discover_game_releases.py"),
            "--platform",
            str(job["platformSlug"]),
            "--limit",
            str(int(job.get("limit") or 80)),
            "--max-pages",
            str(int(job.get("maxPages") or 4)),
            "--repeat-stop-count",
            str(int(job.get("repeatStopCount") or 3)),
            "--recent-dir",
            str(recent_dir),
            "--output",
            str(output),
        ]
        proc = subprocess.run(cmd, cwd=ROOT, env=os.environ.copy(), text=True, capture_output=True, timeout=300)
        prefix = f"Resultados anteriores descargados para no repetir candidatos: {recent_downloaded}\n"
        log = "\n".join(part for part in [prefix + proc.stdout, proc.stderr] if part).strip()
        if proc.returncode != 0:
            return False, None, log, f"discover_game_releases terminó con código {proc.returncode}"
        if not output.exists():
            return False, None, log, "discover_game_releases no generó archivo de resultado"
        result = json.loads(output.read_text())
        local_copy_dir = ROOT / "data" / "catalog-discovery" / "local-game"
        local_copy_dir.mkdir(parents=True, exist_ok=True)
        (local_copy_dir / f"{job['id']}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return True, result, log, None


def import_game_paste(job: dict[str, Any]) -> tuple[bool, dict[str, Any] | None, str, str | None]:
    pasted_text_path = str(job.get("pastedTextPath") or "").lstrip("/")
    if not pasted_text_path:
        return False, None, "", "El job de pegado no tiene archivo de texto asociado"
    worker_base = os.environ.get("PRICE_WORKER_PUBLIC_URL", DEFAULT_WORKER_PUBLIC_URL).rstrip("/")
    pasted_text = fetch_public_text(f"{worker_base}/{pasted_text_path}", timeout=60)
    if not pasted_text:
        return False, None, "", "No se pudo descargar el texto pegado desde el worker"

    with tempfile.TemporaryDirectory(prefix="region-atlas-game-paste-") as tmp:
        tmp_path = Path(tmp)
        input_file = tmp_path / f"{job['id']}.txt"
        output = tmp_path / f"{job['id']}.json"
        input_file.write_text(pasted_text, encoding="utf-8")
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "import_game_paste.py"),
            "--platform",
            str(job["platformSlug"]),
            "--offer-type",
            str(job["offerType"]),
            "--input",
            str(input_file),
            "--output",
            str(output),
            "--no-ai",
        ]
        env = os.environ.copy()
        env.setdefault("REGION_VISION_DISABLED", "1")
        proc = subprocess.run(cmd, cwd=ROOT, env=env, text=True, capture_output=True, timeout=600)
        log = "\n".join(part for part in [proc.stdout, proc.stderr] if part).strip()
        if proc.returncode != 0:
            return False, None, log, f"import_game_paste terminó con código {proc.returncode}"
        if not output.exists():
            return False, None, log, "import_game_paste no generó archivo de resultado"
        result = json.loads(output.read_text())
        local_copy_dir = ROOT / "data" / "price-ingest" / "local-game"
        local_copy_dir.mkdir(parents=True, exist_ok=True)
        (local_copy_dir / f"{job['id']}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return True, result, log, None


def run_once(base_url: str, token: str, runner_id: str) -> bool:
    next_job = request_json(base_url, "/api/price-local-runner/next", token, {"runnerId": runner_id})
    if not next_job.get("ok"):
        raise RuntimeError(next_job.get("error") or "No se pudo consultar cola")
    job = next_job.get("job")
    if not job:
        print("Sin jobs GAME pendientes.")
        return False

    job_type = str(job.get("jobType") or "api_collect")
    print(f"Job recibido: {job['id']} · {job['platformSlug']} · {job['offerType']} · {job_type} · límite {job.get('limit')}")
    if job_type == "manual_paste":
        ok, result, log, error = import_game_paste(job)
    elif job_type == "catalog_discovery":
        ok, result, log, error = discover_game_releases(job)
    else:
        ok, result, log, error = collect_game(job)
    complete = request_json(
        base_url,
        "/api/price-local-runner/complete",
        token,
        {
            "jobId": job["id"],
            "runnerId": runner_id,
            "ok": ok,
            "result": result,
            "log": log,
            "error": error,
        },
        timeout=60,
    )
    if not complete.get("ok"):
        raise RuntimeError(complete.get("error") or "No se pudo completar job")
    print(f"Job completado: {job['id']} · estado {'OK' if ok else 'ERROR'}")
    return True


def main() -> int:
    load_local_env()
    parser = argparse.ArgumentParser(description="Runner local GAME España para Region Atlas")
    parser.add_argument("--base-url", default=os.environ.get("REGION_ATLAS_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--token", default=os.environ.get("LOCAL_GAME_RUNNER_TOKEN", ""))
    parser.add_argument("--runner-id", default=os.environ.get("LOCAL_GAME_RUNNER_ID", "mac-local-game-runner"))
    parser.add_argument("--once", action="store_true", help="Procesa como máximo un job y sale.")
    parser.add_argument("--interval", type=int, default=120, help="Segundos entre consultas si no usas --once.")
    args = parser.parse_args()
    if not args.token:
        raise SystemExit("Falta LOCAL_GAME_RUNNER_TOKEN.")

    while True:
        try:
            run_once(args.base_url, args.token, args.runner_id)
        except urllib.error.HTTPError as exc:
            print(f"HTTP {exc.code}: {exc.read().decode('utf-8', errors='ignore')[:500]}")
            if args.once:
                return 1
        except Exception as exc:
            print(f"ERROR runner: {exc}")
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(max(15, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
