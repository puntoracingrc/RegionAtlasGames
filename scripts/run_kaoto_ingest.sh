#!/usr/bin/env bash
# Referencias retail Kaoto Store → ingest + sync opcional.
#
#   ./scripts/run_kaoto_ingest.sh saturn
#   ./scripts/run_kaoto_ingest.sh saturn --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-saturn}"
SYNC="${2:-}"
OUT="data/price-ingest/${PLATFORM}-kaoto.json"

echo "=== Kaoto ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 scripts/collect_kaotostore.py --platform "$PLATFORM" --output "$OUT"

if [[ "$SYNC" == "--sync" ]]; then
  echo "=== Sync precios (Kaoto retail) ==="
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
fi
