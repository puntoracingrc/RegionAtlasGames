#!/usr/bin/env bash
# Espera a que termine el pipeline de metadatos (PriceCharting + descripciones)
# y lanza SerialStation (--gaps-only) para CUSA/SLES/… en juegos PS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p "$LOG_DIR"
QUEUE_LOG="$LOG_DIR/serialstation-queue.log"
SS_LOG="$LOG_DIR/enrich-serialstation.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$QUEUE_LOG"
}

wait_for_cmd() {
  local pattern="$1"
  local label="$2"
  while pgrep -f "$pattern" >/dev/null 2>&1; do
    log "Esperando $label…"
    sleep 120
  done
}

log "Cola SerialStation iniciada — esperando pipeline actual"
wait_for_cmd "enrich_game_details.py --no-wikidata" "Fase 1 (PriceCharting)"
wait_for_cmd "generate_game_descriptions.py --with-details-only" "Fase 2 (descripciones)"

log "Pipeline libre — arrancando enrich_serialstation.py --gaps-only"
PYTHONUNBUFFERED=1 python3 scripts/enrich_serialstation.py --gaps-only 2>&1 | tee "$SS_LOG"
code="${PIPESTATUS[0]}"
log "SerialStation terminado (exit=$code). Log: $SS_LOG"
exit "$code"
