#!/usr/bin/env bash
# Escribe progreso de pipelines en background cada N minutos.
set -euo pipefail

INTERVAL="${1:-300}"
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="/tmp/pal-es-market-logs"
OUT="$LOG_DIR/progress.log"

mkdir -p "$LOG_DIR"

snapshot() {
  local ts covers_line enrich_line
  ts="$(date -Iseconds)"

  covers_line=""
  if [[ -f "$LOG_DIR/covers-seed.log" ]]; then
    covers_line="$(grep -E '\[[0-9]+/[0-9]+\]' "$LOG_DIR/covers-seed.log" | tail -1 || true)"
  fi

  enrich_line=""
  if [[ -f "$LOG_DIR/enrich-game-details.log" ]]; then
    enrich_line="$(grep -E '\[[0-9]+/[0-9]+\]' "$LOG_DIR/enrich-game-details.log" | tail -1 || true)"
  fi

  {
    echo "=== $ts ==="
    if mountpoint -q "/Volumes/Nuevo vol" 2>/dev/null || [[ -d "/Volumes/Nuevo vol/pal-es-retro" ]]; then
      echo "disco: montado"
    else
      echo "disco: NO MONTADO"
    fi
    pgrep -fl "seed_covers.py" >/dev/null && echo "covers:seed: activo" || echo "covers:seed: parado"
    pgrep -fl "enrich_game_details.py" >/dev/null && echo "enrich: activo" || echo "enrich: parado"
    pgrep -fl "generate_game_descriptions.py" >/dev/null && echo "descripciones: activo" || echo "descripciones: parado"
    [[ -n "$covers_line" ]] && echo "covers $covers_line"
    [[ -n "$enrich_line" ]] && echo "enrich $enrich_line"
    if [[ -f "$PROJECT/data/meta.json" ]]; then
      python3 - <<'PY' 2>/dev/null || true
import json
from pathlib import Path
m = json.loads(Path("data/meta.json").read_text())
print(f"meta coversLocal={m.get('coversLocal','?')} gamesWithDetails={m.get('gamesWithDetails','?')}")
PY
    fi
    echo
  } >> "$OUT"
}

echo "[$(date -Iseconds)] Monitor progreso cada ${INTERVAL}s → $OUT" >> "$OUT"
snapshot

while true; do
  sleep "$INTERVAL"
  snapshot
done
