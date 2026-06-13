# Fase 2 — Ingest automatizado (roadmap)

Objetivo: generar `data/price-ingest/{plataforma}.json` desde Wallapop, eBay ES y Vinted con región verificada, sin intervención manual fila a fila.

## Estado actual

| Capa | Fase 1 (hecho) | Fase 2 (pendiente) |
|------|----------------|---------------------|
| Formato JSON | `pilot-*.json`, validación | Igual |
| Entrada manual | Editar JSON / CSV | CSV → `import_listings_csv.py` |
| Wallapop | — | Scraper o export asistido |
| eBay ES | — | Sold + active, filtro PAL ES |
| Vinted | — | Solo título del juego (región post-fetch) |
| Región | Reglas estáticas | + IA visión (`regionEvidence`, `aiConfidence`) |
| Sync | `sync_es_prices.py` | Sin cambios |

## Puente manual → semi-auto (ya disponible)

```bash
# Plantilla vacía
npm run ingest:template -- --platform ps2 --limit 50 --region "PAL España"

# CSV batch (columnas: catalogId, source, priceEur, listingRegion, regionEvidence)
python3 scripts/import_listings_csv.py \
  --platform ps2 \
  --input data/price-ingest/manual/ejemplo.csv \
  --output data/price-ingest/pilot-ps2.json \
  --merge

npm run ingest:validate
python3 scripts/sync_es_prices.py --platform ps2 --input data/price-ingest/pilot-ps2.json --dry-run
```

Ver `data/price-ingest/manual/ejemplo.csv`.

## eBay ES (implementado)

### Credenciales

Crea una app en [eBay Developers](https://developer.ebay.com/) (Production).

| Variable | Uso |
|----------|-----|
| `EBAY_APP_ID` | **Finding API** — activos + **vendidos** (recomendado) |
| `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | **Browse API** — solo activos en EBAY_ES |

Exporta antes de ejecutar (no commitear):

```bash
export EBAY_APP_ID="YourAppId"
# o
export EBAY_CLIENT_ID="..."
export EBAY_CLIENT_SECRET="..."
```

### Comandos

```bash
# Dry-run (5 juegos PS2, vendidos)
python3 scripts/collect_ebay_es.py --platform ps2 --limit 5 --sold --dry-run

# Generar ingest (vendidos + activos)
python3 scripts/collect_ebay_es.py --platform ps2 --limit 25 --sold --active \
  --output data/price-ingest/ps2-ebay.json

# Fusionar con piloto manual y validar
python3 scripts/collect_ebay_es.py --platform ps2 --limit 10 --sold --merge \
  --output data/price-ingest/pilot-ps2.json

# Wrapper + sync (cuando catalog.json no esté en uso por seed_covers)
chmod +x scripts/run_ebay_ingest.sh
./scripts/run_ebay_ingest.sh ps2 20 --sync
```

### Comportamiento

- Búsqueda: `{título} {plataforma} {referencia?} {PAL español|PAL}` según región catálogo.
- Si la ficha tiene **referencia producto** (`game-details.json`), se añade a la query eBay.
- Anuncios con código de otro juego/edición se descartan; coincidencia de SKU → `sku_regional`.
- Filtro ubicación: España (`LocatedIn=ES`) vía Finding API.
- Región en ingest: inferida del **título** (`cover_spain`, `listing_title_region`, etc.) + `aiConfidence` 0.86–0.88.
- Descarta títulos con NTSC/USA/JAPón cuando el catálogo es PAL ES/EU.
- Caché opcional: `data/price-ingest/cache/ebay/{plataforma}/{catalogId}.json` con `--use-cache`.
- Informe: `data/price-ingest/reports/ebay-{plataforma}-{fecha}.json`.

### Limitaciones

- **Vendidos** requieren Finding API (`EBAY_APP_ID`). Browse no expone sold.
- eBay puede bloquear scraping HTML; no usamos scrape — solo API oficial.
- La región no está verificada por foto hasta Fase 2b (IA visión).

## Arquitectura Fase 2 (resto)

```
scripts/collectors/
  common.py        # catálogo, queries, inferencia región
  ebay_client.py   # Finding + Browse API
  wallapop.py      # (pendiente)
  vinted_es.py     # (pendiente)
scripts/collect_ebay_es.py
scripts/run_ebay_ingest.sh
```

Cada collector devuelve filas con el mismo schema que Fase 1. La IA de región (Fase 2b) enriquece `regionEvidence` desde fotos del anuncio antes del sync.

## Orden de implementación sugerido

1. eBay ES sold (histórico estable, menos anti-bot que Wallapop)
2. Wallapop active (mercado local ES)
3. Vinted ES
4. IA visión región (reutilizar reglas `region-evidence-rules.json`)
5. CeX retail (`collect_cex.py` — Algolia ES vía search.webuy.io)
6. IA visión región (reutilizar reglas `region-evidence-rules.json`)

## Ventas Pro → precio ES (Fase 6)

Las ventas cerradas en Mercado Pro se guardan en `data/marketplace/recorded-sales.json`. La ficha de juego ya muestra mediana privada cuando hay datos; en Fase 6 se podrán mezclar con la mediana P2P oficial.
