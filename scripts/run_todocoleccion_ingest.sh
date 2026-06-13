#!/usr/bin/env bash
# Lotes P2P TodoColeccion → ingest + sync opcional.
#
#   ./scripts/run_todocoleccion_ingest.sh saturn
#   ./scripts/run_todocoleccion_ingest.sh all
#   ./scripts/run_todocoleccion_ingest.sh all --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-saturn}"
SYNC="${2:-}"

echo "=== TodoColeccion ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) · ${PLATFORM} ==="

if [[ "$PLATFORM" == "all" ]]; then
  if [[ "$SYNC" == "--sync" ]]; then
    python3 scripts/collect_todocoleccion.py --all --sync
  else
    python3 scripts/collect_todocoleccion.py --all
  fi
else
  OUT="data/price-ingest/${PLATFORM}-todocoleccion.json"
  python3 scripts/collect_todocoleccion.py --platform "$PLATFORM" --output "$OUT"
  if [[ "$SYNC" == "--sync" ]]; then
    echo "=== Sync precios P2P (TodoColeccion · ${PLATFORM}) ==="
    python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
  fi
fi
