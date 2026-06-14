# Sincronización de precios ES

Rotación **diaria** por plataforma (~19 días = vuelta completa con lotes mini). Cada edición del catálogo (PAL, USA, Japón…) recibe precio si los anuncios cumplen `data/region-evidence-rules.json`.

## Lotes mini (mismo día)

Varias consolas pequeñas comparten un paso de rotación (`batch:*` en `data/price-sync-batches.json`):

| Paso | Consolas el mismo día |
|------|------------------------|
| `batch:mini-neo-sega` | 32X, Neo Geo, Neo Geo CD, NG Pocket |

La rotación avanza **una vez** al terminar el lote entero.

## Fuentes

| Capa | Campo catálogo | Entra en mediana P2P |
|------|----------------|----------------------|
| Wallapop / eBay / Vinted / TodoColeccion | `recommendedPrice` | Sí (región verificada) |
| CeX retail | `cexSellPrice`, `cexCashPrice` | No (referencia aparte) |
| Japan Game Online | `jgoRetailPrice`, `jgoProductUrl` | No (retail import JP en ES) |
| Chollo Games | `cholloRetailPrice`, `cholloProductUrl` | No (importación Madrid) |
| Kaoto Store | `kaotoRetailPrice`, `kaotoProductUrl` | No (Shopify, import JP/PAL) |
| TodoColeccion | `tcListingPrice`, `tcProductUrl` | No (particular/subasta ES; entra en mediana solo PAL/ES) |
| TodoConsolas | `tcnsRetailPrice`, `tcnsProductUrl` | No (tienda 2ª mano ES) |
| PriceCharting | `pcRefPrice` | No (ref. EU) |

Matching por **referencia producto** (`T-…`, `SLPS-`, `HDR-…`) en eBay y JGO cuando aparece en título/descripción; ver `scripts/collectors/reference_match.py`.

## Tres precios por estado

Cada juego puede tener hasta **tres medias** (no se mezclan suelto con precintado):

| Campo catálogo | Estado | UI |
|----------------|--------|-----|
| `estimatedPriceLoose` | Suelto (cartucho/disco) | Suelto |
| `estimatedPriceComplete` | Completo / sin manual | Completo |
| `estimatedPriceSealed` | Precintado | Precintado |

`recommendedPrice` = completo → suelto → precintado (referencia en tarjetas).

### Cómo se calcula cada media

1. **Recoger observaciones** de todas las fuentes con región verificada y condición resuelta (texto + IA visión si hace falta).
2. **Clasificar** en estado `loose` / `complete` / `sealed` (suelto / completo / precintado).
3. **Media ponderada** dentro de cada estado (`mean_by_bucket` en `condition_buckets.py`).

Pesos por categoría (`data/price-source-weights.json`):

| Categoría | Fuentes | Peso relativo |
|-----------|---------|---------------|
| **P2P** | TodoColeccion, eBay, Wallapop, Vinted | 1.0 |
| **Retail ES** | CeX (solo venta), TodoConsolas | 0.65 |
| **Import retail** | JGO, Chollo, Kaoto | 0.55 |

Varios anuncios P2P del mismo estado **suman peso** → si hay 3 lotes P2P y 1 CeX, P2P pesa ~82 % en ese estado.

`priceDataSources` lista las fuentes que aportaron dato (atribución, no precio suelto por marca).

### Histórico y gráfica en ficha

Tras cada `sync_es_prices.py`, se guarda un punto en `data/price-history.json` por juego con medias por estado. La ficha del catálogo muestra **Evolución del precio** (tres líneas: suelto ámbar, completo verde, precintado violeta). Cada sync añade o actualiza el punto del día (máx. 104 por juego).

Semilla inicial desde catálogo: `python3 -c "import sys; sys.path.insert(0,'scripts'); from collectors.common import load_json,CATALOG_FILE; from collectors.price_history import seed_from_catalog; print(seed_from_catalog(load_json(CATALOG_FILE,[])))"`

### Antigüedad de anuncios (P2P)

Por defecto solo entran lotes de los **últimos 180 días** (`data/ingest-recency.json`). TodoColeccion infiere `listedAt` desde la ruta de la foto (`/tc/YYYY/MM/DD/`). CeX y tiendas retail **no** se filtran por fecha (stock vivo en web).

| Ajuste | Dónde |
|--------|--------|
| `maxListingAgeDays` | `data/ingest-recency.json` o `INGEST_MAX_LISTING_AGE_DAYS` |
| `tcMaxPages` (default 25) | mismo JSON o `INGEST_TC_MAX_PAGES` (`0` = sin límite) |
| `wallapopPerGamePages` (default 0 = todas las páginas hasta sin «Cargar más») | `INGEST_WALLAPOP_PER_GAME_PAGES` (`0`/`all` = sin límite) |
| `wallapopTimeFilter` (default `lastMonth` ≈ 30 días) | `data/ingest-recency.json` o `INGEST_WALLAPOP_TIME_FILTER` |
| `wallapopListingAgeDays` (default 30) | mismo JSON o `INGEST_WALLAPOP_LISTING_AGE_DAYS` |
| `WALLAPOP_ORDER_BY` (default `newest`) | env |
| `WALLAPOP_GAME_LIMIT` / `DAILY_WALLAPOP_GAME_LIMIT` (default 50 juegos/día) | env |
| Retail con recencia | `applyToRetail: true` o `INGEST_RECENCY_RETAIL=1` |

eBay vendidos: filtro `EndTimeFrom` en Finding API al mismo horizonte.

**Excluido de la media:** `cexCashPrice` (lo que CeX te paga, no lo que cuesta comprar).

## Reglas

- Región verificada obligatoria (`data/region-evidence-rules.json`).
- Outliers descartados (1 €, caídas >50 %, IQR).
- Estado en `data/price-sync-state.json`.

## Prioridad IA (on-demand en precios)

Cuando un collector tiene un **anuncio abierto** y surge duda (match ambiguo, región, carátula, listing AI), **usa OpenAI** si hay clave configurada.

| Control | Efecto |
|---------|--------|
| `OPENAI_API_KEY` | IA on-demand en collectors + batch en paralelo |
| `PRICE_AI_DISABLED=1` | Desactiva IA de precios (emergencia) |
| `--no-ai` en un collector | Override manual puntual |
| `OPENAI_BATCH_DISABLED=1` | Desactiva IA en batch (descripciones, etc.) |
| `DAILY_NO_AI` | **Ya no** desactiva IA en collectors |

Batch de descripciones e ingest de precios **corren en conjunto** (sin pausa mutua).

Implementación: `scripts/collectors/price_ai_policy.py`.

## Comandos

```bash
# Sync manual (plataforma + JSON ingest)
python3 scripts/sync_es_prices.py --platform dreamcast --input data/price-ingest/example-dreamcast.json

# Dry-run
python3 scripts/sync_es_prices.py --platform ps4 --input data/price-ingest/ps4.json --dry-run

# Ingest diario (collectors + merge + sync; avanza rotación)
chmod +x scripts/daily-price-ingest.sh
./scripts/daily-price-ingest.sh
./scripts/daily-price-ingest.sh --platform n64
./scripts/daily-price-ingest.sh --dry-run
./scripts/daily-price-ingest.sh --platform batch:mini-neo-sega --dry-run

# Solo sync manual si ya tienes JSON mergeado
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

# Referencias retail CeX (es.webuy.com)
python3 scripts/collect_cex.py --platform saturn --dry-run --use-cache
export OPENAI_API_KEY=...   # IA matching (ambiguos) + visión condición en sync
python3 scripts/sync_es_prices.py --platform saturn --input data/price-ingest/saturn.json
# Desactivar visión: --no-vision

# Referencias retail Japan Game Online (import JP)
python3 scripts/collect_japangameonline.py --platform saturn --dry-run
./scripts/run_jgo_ingest.sh saturn --sync

# Referencias retail Chollo Games (importación Madrid)
python3 scripts/collect_chollogames.py --platform n64 --dry-run
./scripts/run_chollo_ingest.sh n64 --sync

# Referencias retail Kaoto Store (Shopify)
python3 scripts/collect_kaotostore.py --platform saturn --dry-run
./scripts/run_kaoto_ingest.sh saturn --sync

# Lotes P2P TodoColeccion (subastas / venta directa ES)
python3 scripts/collect_todocoleccion.py --platform saturn --dry-run
python3 scripts/collect_todocoleccion.py --all --dry-run
./scripts/run_todocoleccion_ingest.sh all --sync

# Wallapop (como la web): cat. Videojuegos · más recientes · últimos 30 días
# Query: título + plataforma en una palabra (ej. Sonic the Hedgehog megadrive)
# Filtrado IA por anuncio (merchandising, juego correcto, región): activo si hay OPENAI_API_KEY
# Caché: data/price-ingest/cache/wallapop-listing-ai/{plataforma}/{catalogId}/{externalId}.json
# Solo re-analiza anuncios nuevos o si cambian título/precio. Desactivar: --no-ai · --no-match-cache
# Rendimiento (env opcionales): WALLAPOP_LISTING_AI_BATCH_SIZE=16 · _DELAY=0.05 · _WORKERS=2
python3 scripts/collect_wallapop.py --platform megadrive --limit 20 --dry-run
python3 scripts/collect_ebay_es.py --platform ps2 --limit 10 --sold --dry-run
./scripts/run_wallapop_ingest.sh megadrive
./scripts/run_wallapop_ingest.sh megadrive --sync

# Referencias retail TodoConsolas (PrestaShop, segunda mano ES)
python3 scripts/collect_todoconsolas.py --platform saturn --dry-run
python3 scripts/collect_todoconsolas.py --all
./scripts/run_todoconsolas_ingest.sh all --sync
```

## Automatización

**GitHub Actions:** `.github/workflows/daily-price-ingest.yml` — cron `0 4 * * *` (04:00 UTC).

Una plataforma (o lote mini) por día → collectors → merge → `sync_es_prices.py` → commit a `main`.

### Modo CI (GitHub Actions)

En runners de GitHub el ingest usa límites conservadores (detecta `GITHUB_ACTIONS=true`):

| Control | Default CI | Motivo |
|---------|------------|--------|
| `timeout-minutes` | 360 | Game Gear + Vinted sin límite superaba 90 min |
| `DAILY_SKIP_TODOCOLECCION` | `1` | TodoColeccion devuelve 403 desde datacenter |
| `DAILY_VINTED_GAME_LIMIT` | 35 | Vinted ~10 min/juego sin límite |
| `DAILY_WALLAPOP_GAME_LIMIT` | 50 | API rápida, cupo diario |
| `DAILY_EBAY_GAME_LIMIT` | 25 | Cuota API |
| `DAILY_RETAIL_GAME_LIMIT` | 120 | CeX/JGO/Kaoto/TodoConsolas |
| `DAILY_USE_CACHE` | `1` | Reutiliza caché entre días |

Prioridad dentro del límite: juegos **sin** `hasEsPrice` primero (rotación progresiva).

Fuentes en el job diario (si existen collector + credenciales):

| Fuente | Collector | Requisito |
|--------|-----------|-----------|
| TodoColeccion | omitida en CI | 403 desde GitHub |
| TodoConsolas | sí | — |
| CeX / Chollo / JGO / Kaoto | sí | plataforma mapeada |
| eBay ES | sí | secrets eBay |
| Wallapop / Vinted | sí | límites CI arriba |

Variables opcionales locales: `DAILY_SOURCE_PAUSE_SEC`, `DAILY_SKIP_SOURCES=todocoleccion,vinted`, etc.

## Cron local (alternativa)

```cron
# Cada día 04:00 — collectors + merge + sync
0 4 * * * cd /ruta/RegionAtlasGames && ./scripts/daily-price-ingest.sh >> logs/daily-price-ingest.log 2>&1
```

## Formato ingest

Ver comentarios en `scripts/sync_es_prices.py` y `data/price-ingest/example-dreamcast.json`.
