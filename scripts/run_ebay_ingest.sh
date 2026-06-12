#!/usr/bin/env bash
# Genera ingest eBay ES y opcionalmente sincroniza precios.
#
# Requiere EBAY_APP_ID en el entorno (o .env.local exportado antes).
#
#   export EBAY_APP_ID=YourAppId
#   ./scripts/run_ebay_ingest.sh ps2 20
#   ./scripts/run_ebay_ingest.sh ps2 20 --sync

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-ps2}"
LIMIT="${2:-20}"
SYNC="${3:-}"

if [[ -z "${EBAY_APP_ID:-}" && (-z "${EBAY_CLIENT_ID:-}" || -z "${EBAY_CLIENT_SECRET:-}") ]]; then
  echo "Define EBAY_APP_ID o EBAY_CLIENT_ID + EBAY_CLIENT_SECRET"
  echo "Ver docs/phase-2-ingest.md"
  exit 1
fi

OUT="data/price-ingest/${PLATFORM}-ebay.json"

echo "=== eBay ES ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 scripts/collect_ebay_es.py \
  --platform "$PLATFORM" \
  --limit "$LIMIT" \
  --sold \
  --active \
  --output "$OUT"

if [[ "$SYNC" == "--sync" ]]; then
  echo "=== Sync precios ==="
  python3 scripts/sync_es_prices.py --platform "$PLATFORM" --input "$OUT"
fi
