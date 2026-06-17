#!/usr/bin/env bash
# Retoma metadatos PS4 + huecos + descripciones (secuencial: un solo writer a game-details.json).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/relauch-details-pipeline.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

run_step() {
  local label="$1"
  local logfile="$2"
  shift 2
  log "=== $label ==="
  set +o pipefail
  "$@" 2>&1 | tee -a "$logfile"
  local rc=${PIPESTATUS[0]}
  set -o pipefail
  if [ "$rc" -ne 0 ]; then
    log "$label falló (exit $rc, continúa)"
  fi
}

run_step "1/3 enrich_game_details (PS4)" "$LOG_DIR/ps4-enrich-details.log" \
  env PYTHONUNBUFFERED=1 python3 scripts/enrich_game_details.py --platforms ps4

run_step "2/3 enrich_details_gaps" "$LOG_DIR/details-gaps.log" \
  env PYTHONUNBUFFERED=1 python3 scripts/enrich_details_gaps.py --fetch-gaps

run_step "3/3 generate_game_descriptions" "$LOG_DIR/generate-descriptions.log" \
  env PYTHONUNBUFFERED=1 python3 scripts/generate_game_descriptions.py --with-details-only

log "=== Pipeline metadatos/descripciones completado ==="
