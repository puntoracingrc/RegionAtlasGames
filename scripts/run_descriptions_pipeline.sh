#!/usr/bin/env bash
# Metadatos PS (SerialStation) → descripciones + SEO con IA (Wikipedia + hechos verificados).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/descriptions-pipeline.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

log "=== 1/2 SerialStation (CUSA/SLES, dev, pub, géneros PS) ==="
PYTHONUNBUFFERED=1 python3 scripts/enrich_serialstation.py --gaps-only 2>&1 | tee -a "$LOG_DIR/serialstation-gaps.log"

log "=== 2/2 Descripciones IA (fichas con metadatos, omitiendo ya generadas) ==="
PYTHONUNBUFFERED=1 python3 scripts/generate_game_descriptions.py --with-details-only 2>&1 | tee -a "$LOG_DIR/descriptions-ai.log"

log "=== Pipeline descripciones completado ==="
