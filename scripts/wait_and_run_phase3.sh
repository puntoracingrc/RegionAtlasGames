#!/usr/bin/env bash
# Espera a que terminen fases 1 y 2 del pipeline y lanza fase 3 automáticamente.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/phase3-watcher.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

pgrep_cmd() {
  pgrep -f "$1" >/dev/null 2>&1
}

log "Watcher fase 3: esperando fin de fase 1 (enrich --no-wikidata)…"
while pgrep_cmd "enrich_game_details.py --no-wikidata"; do
  sleep 120
done
log "Fase 1 terminada."

log "Esperando inicio de fase 2 (generate_game_descriptions)…"
until pgrep_cmd "generate_game_descriptions.py"; do
  if grep -q "Fase 2: Descripciones" "$LOG_DIR/pipeline.log" 2>/dev/null; then
    sleep 15
    continue
  fi
  if ! pgrep_cmd "enrich_game_details.py"; then
    log "Aviso: no hay generate_game_descriptions activo; comprobando si fase 2 ya terminó…"
    if grep -q "Pipeline completado" "$LOG_DIR/pipeline.log" 2>/dev/null; then
      break
    fi
  fi
  sleep 30
done

if pgrep_cmd "generate_game_descriptions.py"; then
  log "Fase 2 en curso; esperando…"
  while pgrep_cmd "generate_game_descriptions.py"; do
    sleep 120
  done
fi
log "Fase 2 terminada."

if grep -q "Fase 3: resto del catálogo" "$LOG_DIR/phase3-catalog.log" 2>/dev/null && \
   grep -q "Fase 3 completada" "$LOG_DIR/phase3-catalog.log" 2>/dev/null; then
  log "Fase 3 ya completada anteriormente; saliendo."
  exit 0
fi

log "Lanzando fase 3…"
bash "$ROOT/scripts/run_phase3_catalog.sh"
