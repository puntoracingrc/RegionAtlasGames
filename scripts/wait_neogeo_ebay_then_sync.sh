#!/usr/bin/env bash
# Espera fin de collect_ebay_es neogeo → merge parciales → sync catálogo → reanuda descripciones.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="/tmp/pal-es-market-logs"
mkdir -p logs "$LOG_DIR"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a logs/neogeo-ebay-full.log; }

log "=== Monitor: esperando collect_ebay_es neogeo (212 juegos) ==="
while pgrep -f "collect_ebay_es.py --platform neogeo" >/dev/null 2>&1; do
  sleep 30
done
log "=== eBay collector terminado; merge + sync ==="

python3 << 'PY'
import sys
from pathlib import Path
sys.path.insert(0, "scripts")
from daily_price_ingest import INGEST_DIR, merge_platform_ingest, planned_sources, ingest_has_data
from collectors.common import save_json

platform = "neogeo"
planned = planned_sources(platform)
partial_paths = [p for _, p in planned if p.exists()]
sources_ok = [s for s, p in planned if p.exists()]
merged = merge_platform_ingest(platform, partial_paths, sources_ok)
if not ingest_has_data(merged):
    raise SystemExit("Merge sin datos")
out = INGEST_DIR / f"{platform}.json"
save_json(out, merged)
print(f"Merge: {out} · listings={len(merged.get('listings') or [])}")
PY

python3 scripts/sync_es_prices.py --platform neogeo --input data/price-ingest/neogeo.json --no-advance-rotation 2>&1 | tee -a logs/neogeo-ebay-full.log

log "=== Sync neogeo eBay completado (descripciones siguen en paralelo) ==="
