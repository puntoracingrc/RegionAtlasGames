#!/usr/bin/env bash
# Referencias retail Japan Game Online → ingest + sync opcional.
#
#   ./scripts/run_jgo_ingest.sh saturn
#   ./scripts/run_jgo_ingest.sh saturn --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-saturn}"
SYNC="${2:-}"

OUT="data/price-ingest/${PLATFORM}-jgo.json"

echo "=== JGO ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 scripts/collect_japangameonline.py --platform "$PLATFORM" --output "$OUT"

if [[ "$SYNC" == "--sync" ]]; then
  echo "=== Sync precios (JGO retail) ==="
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
fi
