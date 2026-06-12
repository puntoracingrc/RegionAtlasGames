# Sincronización de precios ES

Rotación semanal por plataforma. **No** actualiza 30k juegos de golpe.

## Fuentes

| Capa | Campo catálogo | Entra en mediana P2P |
|------|----------------|----------------------|
| Wallapop / eBay / Vinted | `recommendedPrice` | Sí (región verificada) |
| CeX retail | `cexSellPrice`, `cexCashPrice` | No (referencia aparte) |
| PriceCharting | `pcRefPrice` | No (ref. EU) |

## Reglas

- Región verificada obligatoria (`data/region-evidence-rules.json`).
- Outliers descartados (1 €, caídas >50 %, IQR).
- Estado en `data/price-sync-state.json`.

## Comandos

```bash
# Sync manual (plataforma + JSON ingest)
python3 scripts/sync_es_prices.py --platform dreamcast --input data/price-ingest/example-dreamcast.json

# Dry-run
python3 scripts/sync_es_prices.py --platform ps4 --input data/price-ingest/ps4.json --dry-run

# Wrapper semanal (lee nextPlatformSlug del estado)
chmod +x scripts/weekly-price-sync.sh
./scripts/weekly-price-sync.sh

# Museo: fichas + índices
python3 scripts/seed_museum_details.py
python3 scripts/seed_museum_details.py --indexes-only

# Fase 1 — ingest piloto (ver docs/phase-1-ingest.md)
npm run ingest:validate
npm run ingest:pilot

# Fase 2 — CSV → ingest (ver docs/phase-2-ingest.md)
python3 scripts/import_listings_csv.py --platform ps2 --input data/price-ingest/manual/ejemplo.csv --output data/price-ingest/pilot-ps2.json --merge

# Portadas locales
python3 scripts/seed_covers.py --platforms ps4,ps2,snes --skip-pc-map
```

## Cron ejemplo

```cron
# Domingo 04:00 — tras generar data/price-ingest/{plataforma}.json
0 4 * * 0 cd /ruta/pal-es-market && ./scripts/weekly-price-sync.sh >> logs/price-sync.log 2>&1
```

## Formato ingest

Ver comentarios en `scripts/sync_es_prices.py` y `data/price-ingest/example-dreamcast.json`.
