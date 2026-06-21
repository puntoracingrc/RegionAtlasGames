#!/bin/bash
set -u

BASE="${REGION_ATLAS_HOSTING_BASE:-/homepages/43/d424401959/htdocs}"
PUBLIC="$BASE/MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/price-worker"
APP="$PUBLIC/app"
CRON_DIR="$PUBLIC/cron"
LOG="$CRON_DIR/price-rotation.log"
LOCK="$CRON_DIR/price-rotation.lock"
ATTEMPTS="$CRON_DIR/price-rotation-attempts.json"
WORKER_USER="${USER:-$(id -un)}"
STALE_SECONDS="${PRICE_ROTATION_STALE_SECONDS:-21600}"

mkdir -p "$CRON_DIR"
cd "$APP" || exit 1

record_attempt() {
  local status="$1"
  local message="$2"
  local exit_code="${3:-}"
  local step="unknown"
  if [ -f data/price-sync-state.json ]; then
    step=$(python3 - <<'PY' 2>/dev/null || echo unknown
import json
try:
    print(json.load(open("data/price-sync-state.json")).get("nextPlatformSlug") or "unknown")
except Exception:
    print("unknown")
PY
)
  fi
  ATTEMPTS_PATH="$ATTEMPTS" STATUS="$status" MESSAGE="$message" EXIT_CODE="$exit_code" STEP="$step" python3 - <<'PY'
import json, os, pathlib, time, uuid
path = pathlib.Path(os.environ["ATTEMPTS_PATH"])
try:
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"version": 1, "attempts": []}
except Exception:
    data = {"version": 1, "attempts": []}
entry = {
    "id": f"hosting-{int(time.time())}-{uuid.uuid4().hex[:6]}",
    "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "status": os.environ.get("STATUS", "error"),
    "step": os.environ.get("STEP") or None,
    "label": "Hosting externo",
    "message": os.environ.get("MESSAGE") or None,
    "exitCode": int(os.environ["EXIT_CODE"]) if os.environ.get("EXIT_CODE") else None,
    "userAgent": "1and1-hosting-cron",
}
data["attempts"] = [entry] + [x for x in data.get("attempts", []) if x.get("id") != entry["id"]]
data["attempts"] = data["attempts"][:50]
data["updatedAt"] = entry["at"]
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

active_price_pids() {
  pgrep -u "$WORKER_USER" -f "scripts/(admin_price_collect|daily_price_ingest|collect_)" 2>/dev/null || true
}

clear_stale_price_processes() {
  local active=0
  local stale=0
  local pid
  for pid in $(active_price_pids); do
    local age
    age=$(ps -p "$pid" -o etimes= 2>/dev/null | tr -d ' ')
    if [ -z "$age" ]; then
      continue
    fi
    if [ "$age" -gt "$STALE_SECONDS" ]; then
      echo "Proceso antiguo $pid (${age}s) superó ${STALE_SECONDS}s; se corta para liberar la rueda." >> "$LOG"
      kill -TERM "$pid" 2>/dev/null || true
      stale=$((stale + 1))
    else
      active=$((active + 1))
    fi
  done
  if [ "$stale" -gt 0 ]; then
    sleep 5
  fi
  return "$active"
}

{
  echo ""
  echo "=== Price rotation hosting $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
} >> "$LOG"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "Otra recolección sigue en marcha; salto este intento." >> "$LOG"
  record_attempt "skipped" "Otra recolección sigue en marcha; no se lanza doble." ""
  exit 0
fi

if ! clear_stale_price_processes; then
  echo "Ya hay una recolección manual/automática reciente en marcha; salto este intento." >> "$LOG"
  record_attempt "skipped" "Ya hay una recolección manual/automática reciente en marcha; no se lanza doble." ""
  exit 0
fi

record_attempt "started" "Rueda lanzada desde hosting externo." ""
export PRICE_WORKER_DAILY="${PRICE_WORKER_DAILY:-1}"
export PRICE_COLLECT_TRIGGER="automatic"
export DAILY_RETAIL_GAME_LIMIT="${DAILY_RETAIL_GAME_LIMIT:-120}"
export DAILY_WALLAPOP_GAME_LIMIT="${DAILY_WALLAPOP_GAME_LIMIT:-50}"
export DAILY_COLLECTOR_TIMEOUT_SEC="${DAILY_COLLECTOR_TIMEOUT_SEC:-2400}"

PYTHONUNBUFFERED=1 python3 -u scripts/daily_price_ingest.py >> "$LOG" 2>&1
code=$?
if [ "$code" -eq 0 ]; then
  record_attempt "done" "Rueda terminada correctamente desde hosting externo." "$code"
else
  record_attempt "error" "La rueda falló en hosting externo. Mira price-rotation.log." "$code"
fi
exit "$code"
