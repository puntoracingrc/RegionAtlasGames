#!/usr/bin/env bash
# Anuncios Vinted ES (búsqueda título+plataforma, más recientes) → ingest + sync opcional.
#
#   ./scripts/run_vinted_ingest.sh gamegear
#   ./scripts/run_vinted_ingest.sh megadrive --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-gamegear}"
SYNC="${2:-}"

OUT="data/price-ingest/${PLATFORM}-vinted.json"

echo "=== Vinted ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 scripts/collect_vinted.py --platform "$PLATFORM" --output "$OUT"

if [[ "$SYNC" == "--sync" ]]; then
  echo "=== Sync precios (Vinted P2P) ==="
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
fi
