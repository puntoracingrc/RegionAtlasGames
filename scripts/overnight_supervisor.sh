#!/usr/bin/env bash
# Supervisor nocturno: relanza portadas PS4 y pipeline de fichas si caen o quedan pendientes.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/overnight-supervisor.log"
STATUS="$LOG_DIR/overnight-status.txt"
COVERS_ROOT="/Volumes/Nuevo vol/pal-es-retro/covers"
POLL_SECS="${POLL_SECS:-180}"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

pgrep_pat() {
  pgrep -f "$1" >/dev/null 2>&1
}

ps4_covers_pending() {
  python3 <<'PY'
import json
from pathlib import Path

root = Path("/Volumes/Nuevo vol/pal-es-retro/covers")
if not root.is_dir():
    print(-1)
    raise SystemExit

cat = json.loads(Path("data/catalog.json").read_text())
ps4 = [
    g for g in cat
    if g.get("platformSlug") == "ps4" and g.get("listingStatus") != "excluded"
]
pending = 0
for g in ps4:
    url = g.get("coverUrl") or ""
    if url.startswith("/covers/"):
        if (root / "ps4" / Path(url).name).exists():
            continue
    pending += 1
print(pending)
PY
}

details_pipeline_done() {
  grep -q "Pipeline metadatos/descripciones completado" "$LOG_DIR/relauch-details-pipeline.log" 2>/dev/null
}

details_pipeline_running() {
  pgrep_pat "run_relauch_details_pipeline.sh" \
    || pgrep_pat "enrich_game_details.py --platforms ps4" \
    || pgrep_pat "enrich_details_gaps.py --fetch-gaps" \
    || pgrep_pat "generate_game_descriptions.py --with-details-only"
}

launch_covers() {
  log "Lanzando seed_covers.py --platforms ps4"
  PYTHONUNBUFFERED=1 python3 scripts/seed_covers.py --platforms ps4 \
    >>"$LOG_DIR/ps4-covers-seed.log" 2>&1 || log "seed_covers terminó con error (se reintentará)"
}

launch_details_pipeline() {
  log "Lanzando run_relauch_details_pipeline.sh"
  bash scripts/run_relauch_details_pipeline.sh \
    >>"$LOG_DIR/relauch-details-pipeline.log" 2>&1 \
    || log "Pipeline fichas terminó con error (se reintentará si no completó)"
}

write_status() {
  local pending="$1"
  local covers_state="$2"
  local details_state="$3"
  local with_desc
  with_desc="$(python3 -c "import json;from pathlib import Path;d=json.loads(Path('data/game-details.json').read_text());print(sum(1 for x in d.values() if isinstance(x,dict) and x.get('description')))")"
  cat >"$STATUS" <<EOF
updatedAt=$(date -Iseconds)
ps4CoversPending=$pending
coversState=$covers_state
detailsState=$details_state
descriptionsTotal=$with_desc
EOF
}

log "=== Supervisor nocturno iniciado (poll=${POLL_SECS}s) ==="

while true; do
  pending="$(ps4_covers_pending)"
  covers_done=false
  details_done=false

  if [ "$pending" = "-1" ]; then
    covers_state="disco_no_montado"
    log "Aviso: disco externo no montado; esperando…"
  elif [ "$pending" -eq 0 ]; then
    covers_state="completado"
    covers_done=true
  elif pgrep_pat "seed_covers.py --platforms ps4"; then
    covers_state="en_curso"
    log "Portadas PS4 en curso ($pending pendientes)"
  else
    covers_state="relanzando"
    log "Portadas PS4 paradas con $pending pendientes — relanzando"
    launch_covers &
  fi

  if details_pipeline_done; then
    details_state="completado"
    details_done=true
  elif details_pipeline_running; then
    details_state="en_curso"
    log "Pipeline fichas/descripciones en curso"
  else
    details_state="relanzando"
    log "Pipeline fichas parado — relanzando"
    launch_details_pipeline &
  fi

  write_status "$pending" "$covers_state" "$details_state" || true

  if [ "$covers_done" = true ] && [ "$details_done" = true ]; then
    log "=== TODO COMPLETADO — supervisor finaliza ==="
    {
      echo "=== Overnight completado $(date -Iseconds) ==="
      echo "PS4 portadas pendientes: 0"
      tail -3 "$LOG_DIR/relauch-details-pipeline.log" 2>/dev/null || true
    } | tee "$LOG_DIR/overnight-complete.txt"
    exit 0
  fi

  sleep "$POLL_SECS"
done
