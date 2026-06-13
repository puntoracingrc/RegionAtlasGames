#!/usr/bin/env bash
# Referencias retail CeX ES → ingest + sync opcional.
#
#   ./scripts/run_cex_ingest.sh saturn
#   ./scripts/run_cex_ingest.sh ps2 --sync
#   ./scripts/run_cex_ingest.sh saturn --dry-run

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-saturn}"
ACTION="${2:-}"

echo "=== CeX ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) · ${PLATFORM} ==="

if [[ "$ACTION" == "--dry-run" ]]; then
  python3 scripts/collect_cex.py --platform "$PLATFORM" --dry-run --use-cache
elif [[ "$ACTION" == "--sync" ]]; then
  python3 scripts/collect_cex.py --platform "$PLATFORM" --use-cache
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "data/price-ingest/${PLATFORM}-cex.json"
else
  python3 scripts/collect_cex.py --platform "$PLATFORM" --use-cache
fi
