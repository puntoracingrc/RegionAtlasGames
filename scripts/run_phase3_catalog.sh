#!/usr/bin/env bash
# Fase 3: ampliar metadatos (Wikidata + SerialStation) y descripciones del resto con ficha.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/phase3-catalog.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

log "=== Fase 3: resto del catálogo (Wikidata + SerialStation + descripciones) ==="

log "--- 3a: Wikidata (solo huecos) ---"
PYTHONUNBUFFERED=1 python3 scripts/enrich_game_details.py --wikidata-only 2>&1 | tee -a "$LOG_DIR/phase3-wikidata.log"

log "--- 3b: SerialStation PS (solo huecos) ---"
PYTHONUNBUFFERED=1 python3 scripts/enrich_serialstation.py --gaps-only 2>&1 | tee -a "$LOG_DIR/phase3-serialstation.log"

log "--- 3c: Descripciones IA (fichas con metadatos, incluye nuevas) ---"
PYTHONUNBUFFERED=1 python3 scripts/generate_game_descriptions.py --with-details-only 2>&1 | tee -a "$LOG_DIR/phase3-descriptions.log"

log "=== Fase 3 completada ==="
