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
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "https://www.regionatlas.games"


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


def collect_game(job: dict[str, Any]) -> tuple[bool, dict[str, Any] | None, str, str | None]:
    with tempfile.TemporaryDirectory(prefix="region-atlas-game-") as tmp:
        output = Path(tmp) / f"{job['id']}.json"
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "collect_game_es.py"),
            "--platform",
            str(job["platformSlug"]),
            "--offer-type",
            str(job["offerType"]),
            "--limit",
            str(int(job.get("limit") or 20)),
            "--max-pages",
            str(int(job.get("maxPages") or 1)),
            "--output",
            str(output),
            "--no-ai",
        ]
        env = os.environ.copy()
        env.setdefault("REGION_VISION_DISABLED", "1")
        proc = subprocess.run(cmd, cwd=ROOT, env=env, text=True, capture_output=True, timeout=180)
        log = "\n".join(part for part in [proc.stdout, proc.stderr] if part).strip()
        if proc.returncode != 0:
            return False, None, log, f"collect_game_es terminó con código {proc.returncode}"
        if not output.exists():
            return False, None, log, "collect_game_es no generó archivo de resultado"
        return True, json.loads(output.read_text()), log, None


def run_once(base_url: str, token: str, runner_id: str) -> bool:
    next_job = request_json(base_url, "/api/price-local-runner/next", token, {"runnerId": runner_id})
    if not next_job.get("ok"):
        raise RuntimeError(next_job.get("error") or "No se pudo consultar cola")
    job = next_job.get("job")
    if not job:
        print("Sin jobs GAME pendientes.")
        return False

    print(f"Job recibido: {job['id']} · {job['platformSlug']} · {job['offerType']} · límite {job.get('limit')}")
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
