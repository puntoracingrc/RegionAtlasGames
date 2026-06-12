#!/usr/bin/env bash
# Referencias retail Chollo Games → ingest + sync opcional.
#
#   ./scripts/run_chollo_ingest.sh n64
#   ./scripts/run_chollo_ingest.sh saturn --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-n64}"
SYNC="${2:-}"
OUT="data/price-ingest/${PLATFORM}-chollo.json"

echo "=== Chollo ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 scripts/collect_chollogames.py --platform "$PLATFORM" --output "$OUT"

if [[ "$SYNC" == "--sync" ]]; then
  echo "=== Sync precios (Chollo retail) ==="
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
fi
