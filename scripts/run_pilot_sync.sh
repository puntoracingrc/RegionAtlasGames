#!/usr/bin/env bash
# Aplica ingest piloto Fase 1 (Dreamcast, PS2, PS4).
# Ejecutar cuando no haya otro proceso escribiendo data/catalog.json (p. ej. seed_covers).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

validate() {
  python3 scripts/build_ingest_template.py --validate "$1"
}

echo "=== Validando ingest piloto ==="
validate data/price-ingest/pilot-dreamcast.json
validate data/price-ingest/pilot-ps2.json
validate data/price-ingest/pilot-ps4.json

echo ""
echo "=== Sync Dreamcast ==="
python3 scripts/sync_es_prices.py --platform dreamcast --input data/price-ingest/pilot-dreamcast.json

echo ""
echo "=== Sync PS2 ==="
python3 scripts/sync_es_prices.py --platform ps2 --input data/price-ingest/pilot-ps2.json

echo ""
echo "=== Sync PS4 ==="
python3 scripts/sync_es_prices.py --platform ps4 --input data/price-ingest/pilot-ps4.json

echo ""
echo "Piloto Fase 1 aplicado. Revisa /plataforma/dreamcast, /plataforma/ps2, /plataforma/ps4"
