#!/usr/bin/env bash
# Referencias retail TodoConsolas → ingest + sync opcional.
#
#   ./scripts/run_todoconsolas_ingest.sh saturn
#   ./scripts/run_todoconsolas_ingest.sh all --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-saturn}"
SYNC="${2:-}"

echo "=== TodoConsolas ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) · ${PLATFORM} ==="

if [[ "$PLATFORM" == "all" ]]; then
  if [[ "$SYNC" == "--sync" ]]; then
    python3 scripts/collect_todoconsolas.py --all --sync
  else
    python3 scripts/collect_todoconsolas.py --all
  fi
else
  OUT="data/price-ingest/${PLATFORM}-todoconsolas.json"
  python3 scripts/collect_todoconsolas.py --platform "$PLATFORM" --output "$OUT"
  if [[ "$SYNC" == "--sync" ]]; then
    echo "=== Sync precios (TodoConsolas retail) · ${PLATFORM} ==="
    python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
  fi
fi
