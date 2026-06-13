#!/usr/bin/env bash
# Rotación diaria: una plataforma → collectors → merge → sync → siguiente slug.
#
#   ./scripts/daily-price-ingest.sh
#   ./scripts/daily-price-ingest.sh --platform n64
#   ./scripts/daily-price-ingest.sh --dry-run
#
# Cron (04:00 UTC cada día):
#   0 4 * * * cd /ruta/pal-es-market && ./scripts/daily-price-ingest.sh >> logs/daily-price-ingest.log 2>&1

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs

echo "=== Daily price ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 scripts/daily_price_ingest.py "$@"
