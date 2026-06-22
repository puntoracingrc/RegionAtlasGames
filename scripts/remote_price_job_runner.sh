#!/bin/bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/../app" ]; then
  PUBLIC="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [ -n "${REGION_ATLAS_PRICE_WORKER_PUBLIC:-}" ] && [ -d "$REGION_ATLAS_PRICE_WORKER_PUBLIC/app" ]; then
  PUBLIC="$REGION_ATLAS_PRICE_WORKER_PUBLIC"
else
  BASE="${REGION_ATLAS_HOSTING_BASE:-/homepages/43/d424401959/htdocs}"
  PUBLIC="$BASE/MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/price-worker"
fi
APP="$PUBLIC/app"
JOBS_DIR="$PUBLIC/jobs"
REQUESTS_DIR="$JOBS_DIR/requests"
IMPORT_REQUESTS_DIR="$JOBS_DIR/import-requests"
RUNNING_DIR="$JOBS_DIR/running"
DONE_DIR="$JOBS_DIR/done"
IMPORT_DONE_DIR="$JOBS_DIR/import-done"
LOG_DIR="$PUBLIC/logs"
LOCK="$JOBS_DIR/queue.lock"
WORKER_USER="${USER:-$(id -un)}"

mkdir -p "$REQUESTS_DIR" "$IMPORT_REQUESTS_DIR" "$RUNNING_DIR" "$DONE_DIR" "$IMPORT_DONE_DIR" "$LOG_DIR"
cd "$APP" || exit 1

active_price_pids() {
  pgrep -u "$WORKER_USER" -f "scripts/(admin_price_collect|daily_price_ingest|collect_)" 2>/dev/null || true
}

if [ -n "$(active_price_pids)" ]; then
  echo "Ya hay una recolección activa; no arranco jobs manuales ahora."
  exit 0
fi

exec 8>"$LOCK"
if ! flock -n 8; then
  echo "Otro runner de jobs está revisando la cola."
  exit 0
fi

import_request="$(find "$IMPORT_REQUESTS_DIR" -maxdepth 1 -type f -name '*.json' | sort | head -n 1)"
if [ -n "$import_request" ]; then
  import_id="$(basename "$import_request" .json)"
  import_done="$IMPORT_DONE_DIR/$import_id.json"
  import_log="$LOG_DIR/import-$import_id.log"
  echo "=== Import GAME local $import_id $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$import_log"
  platform="$(python3 - "$import_request" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('platformSlug') or '')
PY
)"
  result_path="$(python3 - "$import_request" <<'PY'
import json, sys
print((json.load(open(sys.argv[1], encoding='utf-8')).get('resultPath') or '').removeprefix('app/'))
PY
)"
  PYTHONUNBUFFERED=1 venv/bin/python -u scripts/sync_es_prices.py --platform "$platform" --input "$result_path" --no-advance-rotation --no-vision >> "$import_log" 2>&1
  import_code=$?
  python3 - "$APP/data/admin/local-game-runner-jobs.json" "$import_id" "$import_log" "$import_code" <<'PY'
import json, pathlib, sys, time
queue_path = pathlib.Path(sys.argv[1])
job_id = sys.argv[2]
log_path = pathlib.Path(sys.argv[3])
code = int(sys.argv[4])
try:
    data = json.loads(queue_path.read_text(encoding='utf-8'))
except Exception:
    data = {'schemaVersion': 1, 'jobs': []}
tail = log_path.read_text(encoding='utf-8', errors='ignore')[-12000:] if log_path.exists() else ''
now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
for job in data.get('jobs', []):
    if job.get('id') == job_id:
        job['updatedAt'] = now
        job['importedAt'] = now if code == 0 else job.get('importedAt')
        job['importStatus'] = 'imported' if code == 0 else 'error'
        job['importError'] = None if code == 0 else f'sync_es_prices terminó con código {code}'
        job['importLogTail'] = tail
        break
data['updatedAt'] = now
queue_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
  mv "$import_request" "$import_done"
  exit "$import_code"
fi

request="$(find "$REQUESTS_DIR" -maxdepth 1 -type f -name '*.json' | sort | head -n 1)"
if [ -z "$request" ]; then
  echo "Sin jobs manuales pendientes."
  exit 0
fi

job_id="$(basename "$request" .json)"
running="$RUNNING_DIR/$job_id.json"
done="$DONE_DIR/$job_id.json"
log="$LOG_DIR/$job_id.log"
status="$JOBS_DIR/$job_id.json"

mv "$request" "$running"

python3 - "$running" "$status" <<'PY'
import json, pathlib, sys, time
request_path = pathlib.Path(sys.argv[1])
status_path = pathlib.Path(sys.argv[2])
job = json.loads(request_path.read_text(encoding="utf-8"))
job.update({"status": "running", "startedAt": job.get("startedAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
status_path.write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

args=("scripts/admin_price_collect.py" "--status-file" "$status")
mode="$(python3 - "$running" <<'PY'
import json, sys
job=json.load(open(sys.argv[1], encoding='utf-8'))
print(job.get('mode') or '')
PY
)"

if [ "$mode" = "catalog" ]; then
  value="$(python3 - "$running" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('catalogId') or '')
PY
)"
  args+=("--catalog-id" "$value")
elif [ "$mode" = "platform" ]; then
  platform="$(python3 - "$running" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('platformSlug') or '')
PY
)"
  region="$(python3 - "$running" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('region') or '')
PY
)"
  advance="$(python3 - "$running" <<'PY'
import json, sys
print('1' if json.load(open(sys.argv[1], encoding='utf-8')).get('advanceRotation') else '0')
PY
)"
  args+=("--platform" "$platform")
  if [ -n "$region" ]; then args+=("--region" "$region"); fi
  if [ "$advance" = "1" ]; then args+=("--advance-rotation"); fi
else
  targets="$(python3 - "$running" <<'PY'
import json, sys
print(json.dumps(json.load(open(sys.argv[1], encoding='utf-8')).get('targets') or [], ensure_ascii=False))
PY
)"
  args+=("--targets-json" "$targets")
fi

trigger="$(python3 - "$running" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8')).get('trigger') or 'manual')
PY
)"

{
  echo "=== Price manual job $job_id $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Comando: ${args[*]}"
} >> "$log"

export PRICE_COLLECT_TRIGGER="$trigger"
PYTHONUNBUFFERED=1 venv/bin/python -u "${args[@]}" >> "$log" 2>&1
code=$?

python3 - "$running" "$status" "$code" <<'PY'
import json, pathlib, sys, time
running = pathlib.Path(sys.argv[1])
status_path = pathlib.Path(sys.argv[2])
code = int(sys.argv[3])
try:
    job = json.loads(status_path.read_text(encoding="utf-8"))
except Exception:
    job = json.loads(running.read_text(encoding="utf-8"))
job["status"] = "done" if code == 0 else "error"
job["exitCode"] = code
job["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
job["updatedAt"] = job["finishedAt"]
if code != 0 and not job.get("error"):
    job["error"] = f"Worker remoto terminó con código {code}."
status_path.write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
mv "$running" "$done"
exit "$code"
