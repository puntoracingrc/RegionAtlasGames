#!/usr/bin/env bash
# Espera a que termine generate_game_descriptions y hace commit+push de datos del catálogo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG="/tmp/pal-es-market-logs/generate-descriptions.log"
STATUS="/tmp/pal-es-market-logs/push-after-descriptions.status"
POLL="${POLL_SECS:-60}"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$STATUS"
}

log "=== Esperando fin de generate_game_descriptions.py ==="

while pgrep -f "generate_game_descriptions.py --with-details-only" >/dev/null 2>&1; do
  if [ -f "$LOG" ]; then
    tail -1 "$LOG" >> "$STATUS" 2>/dev/null || true
  fi
  sleep "$POLL"
done

sleep 5

if ! grep -q "Hecho:" "$LOG" 2>/dev/null; then
  log "AVISO: proceso parado pero no hay línea 'Hecho:' en el log — revisar manualmente"
fi

read -r DESC TOTAL <<EOF
$(python3 <<'PY'
import json
from pathlib import Path
cat = json.loads(Path("data/catalog.json").read_text())
det = json.loads(Path("data/game-details.json").read_text())
listed = [g for g in cat if g.get("listingStatus") != "excluded"]
with_ficha = sum(1 for g in listed if g["id"] in det)
with_desc = sum(1 for g in listed if det.get(g["id"], {}).get("description"))
print(with_desc, with_ficha)
PY
)
EOF

log "Descripciones: $DESC / $TOTAL con ficha"

if [ "$DESC" -lt 28000 ]; then
  log "ERROR: pocas descripciones ($DESC) — no se hace push automático"
  exit 1
fi

FILES=(
  data/game-details.json
  data/catalog.json
  data/meta.json
  data/index/companies.json
  data/index/genres.json
  data/index/series.json
  data/game-details-enrich-report.json
  data/descriptions/report.json
)

TO_ADD=()
for f in "${FILES[@]}"; do
  if [ -e "$f" ] && ! git diff --quiet HEAD -- "$f" 2>/dev/null; then
    TO_ADD+=("$f")
  fi
done

if [ ${#TO_ADD[@]} -eq 0 ]; then
  log "Nada que commitear en archivos de datos — ¿ya estaba pusheado?"
  exit 0
fi

log "Archivos a commitear: ${TO_ADD[*]}"
git add "${TO_ADD[@]}"

git commit -m "$(cat <<EOF
Add batch-generated game descriptions and catalog data updates.

Pipeline generate_game_descriptions completed with ${DESC} descriptions across ${TOTAL} game detail records.
EOF
)"

log "Push a origin..."
git push -u origin HEAD

log "=== HECHO — push completado ==="
