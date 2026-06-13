#!/usr/bin/env bash
# Anuncios P2P Wallapop ES → ingest + sync opcional.
#
#   ./scripts/run_wallapop_ingest.sh megadrive
#   ./scripts/run_wallapop_ingest.sh megadrive --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-megadrive}"
SYNC="${2:-}"

echo "=== Wallapop ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) · ${PLATFORM} ==="

OUT="data/price-ingest/${PLATFORM}-wallapop.json"
python3 scripts/collect_wallapop.py --platform "$PLATFORM" --output "$OUT"
if [[ "$SYNC" == "--sync" ]]; then
  MERGED="data/price-ingest/${PLATFORM}.json"
  INPUT="$OUT"
  if [[ -f "$MERGED" ]]; then
    INPUT="$MERGED"
  fi
  echo "=== Sync precios P2P (${PLATFORM}) ==="
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$INPUT"
fi
