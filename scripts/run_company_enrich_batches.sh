#!/usr/bin/env bash
# Enriquece compañías en lotes hasta agotar pendientes (Wikidata/Wikipedia + IA).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BATCH_SIZE="${BATCH_SIZE:-50}"
MIN_GAMES="${MIN_GAMES:-20}"
LOG_DIR="$ROOT/data/logs"
LOG_FILE="$LOG_DIR/company-enrich-batches.log"
mkdir -p "$LOG_DIR"

echo "=== Company enrich batches started $(date -Iseconds) ===" | tee -a "$LOG_FILE"

batch=0
while true; do
  batch=$((batch + 1))
  echo "--- Batch $batch (size $BATCH_SIZE) ---" | tee -a "$LOG_FILE"
  output="$(PYTHONUNBUFFERED=1 python3 scripts/enrich_company_profiles.py \
    --limit "$BATCH_SIZE" \
    --min-games "$MIN_GAMES" 2>&1 | tee -a "$LOG_FILE")"
  generated="$(printf '%s\n' "$output" | python3 -c "
import json, sys
text = sys.stdin.read()
for line in reversed(text.splitlines()):
    line = line.strip()
    if not line.startswith('{'):
        continue
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        continue
    if 'generated' in data:
        print(int(data.get('generated', 0)))
        break
else:
    print(0)
")"
  echo "Batch $batch generated: $generated" | tee -a "$LOG_FILE"
  if [[ "$generated" -eq 0 ]]; then
    echo "=== Done $(date -Iseconds) ===" | tee -a "$LOG_FILE"
    break
  fi
  sleep 2
done
