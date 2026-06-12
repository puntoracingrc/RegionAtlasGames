#!/usr/bin/env bash
# Sync semanal de precios ES — una plataforma por ejecución (rotación en data/price-sync-state.json).
#
# Uso manual:
#   ./scripts/weekly-price-sync.sh
#   ./scripts/weekly-price-sync.sh ps4 data/price-ingest/ps4.json
#
# Cron (domingos 04:00, tras generar el JSON de ingest):
#   0 4 * * 0 cd /ruta/pal-es-market && ./scripts/weekly-price-sync.sh >> logs/price-sync.log 2>&1

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-}"
INGEST="${2:-}"

if [[ -z "$PLATFORM" ]]; then
  PLATFORM="$(python3 -c "import json; print(json.load(open('data/price-sync-state.json')).get('nextPlatformSlug','nes'))")"
fi

if [[ -z "$INGEST" ]]; then
  INGEST="data/price-ingest/${PLATFORM}.json"
fi

if [[ ! -f "$INGEST" ]]; then
  echo "Falta ingest: $INGEST"
  echo "Genera el JSON (Wallapop/eBay/Vinted/CeX) antes de ejecutar el sync."
  exit 1
fi

echo "=== Price sync $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Plataforma: $PLATFORM"
echo "Ingest: $INGEST"

python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$INGEST"

echo "Siguiente plataforma:"
python3 -c "import json; print(json.load(open('data/price-sync-state.json')).get('nextPlatformSlug'))"
