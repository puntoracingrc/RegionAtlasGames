#!/usr/bin/env bash
# Espera a que terminen fases 2 y 3 del pipeline y escribe resumen.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="/tmp/pal-es-market-logs"
DONE_FILE="$LOG_DIR/pipeline-complete.txt"

pgrep_cmd() { pgrep -f "$1" >/dev/null 2>&1; }

echo "[$(date -Iseconds)] Monitor: esperando generate_game_descriptions…" | tee "$DONE_FILE.tmp"

while pgrep_cmd "generate_game_descriptions.py"; do
  progress=$(tail -1 "$LOG_DIR/generate-descriptions.log" 2>/dev/null | grep -oE '\[[0-9]+/[0-9]+\]' | tail -1 || echo "")
  echo "[$(date -Iseconds)] Fase 2 en curso $progress"
  sleep 300
done

echo "[$(date -Iseconds)] Fase 2 terminada." | tee -a "$DONE_FILE.tmp"

while pgrep_cmd "wait_and_run_phase3.sh"; do
  echo "[$(date -Iseconds)] Esperando watcher fase 3…"
  sleep 120
done

while pgrep_cmd "enrich_details_gaps.py|enrich_serialstation.py"; do
  echo "[$(date -Iseconds)] Fase 3 metadatos en curso…"
  sleep 300
done

while pgrep_cmd "generate_game_descriptions.py"; do
  echo "[$(date -Iseconds)] Fase 3 descripciones en curso…"
  sleep 300
done

{
  echo "=== Pipeline completado $(date -Iseconds) ==="
  echo ""
  echo "Fase 2 (última línea):"
  tail -3 "$LOG_DIR/generate-descriptions.log" 2>/dev/null || echo "(sin log)"
  echo ""
  echo "Fase 3:"
  tail -5 "$LOG_DIR/phase3-catalog.log" 2>/dev/null || echo "(sin log fase 3)"
  echo ""
  python3 - <<'PY'
import json
from pathlib import Path
details = json.loads(Path("data/game-details.json").read_text())
with_desc = sum(1 for d in details.values() if isinstance(d, dict) and d.get("description"))
with_seo = sum(1 for d in details.values() if isinstance(d, dict) and (d.get("seoMeta") or {}).get("seoDescription"))
print(f"Juegos con descripción: {with_desc}")
print(f"Juegos con SEO: {with_seo}")
PY
  echo ""
  echo "Siguiente paso: revisar y commitear data/game-details.json"
} | tee "$DONE_FILE"

rm -f "$DONE_FILE.tmp"
echo "PIPELINE_COMPLETE"
