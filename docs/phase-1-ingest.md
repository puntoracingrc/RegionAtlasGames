# Fase 1 — Ingest manual piloto

Objetivo: validar el pipeline de precios ES con datos reales recogidos a mano en Wallapop, eBay ES y Vinted, antes de automatizar (Fase 2).

## Plataformas piloto

| Plataforma | Región catálogo | Juegos en piloto | Archivo |
|------------|-----------------|------------------|---------|
| Dreamcast | PAL Europa | 10 | `data/price-ingest/pilot-dreamcast.json` |
| PS2 | PAL España | 10 | `data/price-ingest/pilot-ps2.json` |
| PS4 | PAL España | 9 | `data/price-ingest/pilot-ps4.json` |

## Flujo

### 1. Validar JSON

```bash
python3 scripts/build_ingest_template.py --validate data/price-ingest/pilot-ps2.json
```

Comprueba `catalogId`, `priceEur`, región verificada y reglas en `data/region-evidence-rules.json`.

### 2. Dry-run (no escribe catálogo)

```bash
python3 scripts/sync_es_prices.py --platform ps2 --input data/price-ingest/pilot-ps2.json --dry-run
```

### 3. Aplicar piloto completo

**Importante:** no ejecutar mientras `seed_covers.py` esté escribiendo `data/catalog.json`.

```bash
chmod +x scripts/run_pilot_sync.sh
./scripts/run_pilot_sync.sh
```

### 4. Comprobar en UI

- `/plataforma/ps2` — banner de sync + filtro «Precio ES verificado»
- Ficha de un juego piloto (p. ej. `/catalogo/ps2-god-of-war`) — badge verificado + CeX aparte

## Ampliar el piloto

Generar plantilla vacía para rellenar:

```bash
python3 scripts/build_ingest_template.py --platform ps4 --limit 50 --region "PAL España"
# → data/price-ingest/template-ps4.json
```

Copiar entradas de la plantilla al JSON piloto, sustituir `priceEur: null` por precios reales y añadir 2–4 anuncios por juego cuando sea posible (mejor mediana).

## Formato de anuncio P2P

```json
{
  "catalogId": "ps2-god-of-war",
  "source": "wallapop",
  "listingType": "active",
  "priceEur": 14,
  "listingRegion": "PAL España",
  "regionVerified": true,
  "regionEvidence": ["cover_spain"],
  "aiConfidence": 0.92
}
```

- `listingRegion` debe coincidir con la región del juego en catálogo.
- PS4: incluir `cover_spain` en evidencia; si hay `aiConfidence`, ≥ 0.9.
- Dreamcast PAL EU: `cover_pal_eu`, `sku_regional` o `photo_region_mark`.

## CeX (referencia retail, no entra en mediana P2P)

```json
{
  "catalogId": "ps2-god-of-war",
  "sellPriceEur": 8,
  "cashPriceEur": 5,
  "productUrl": "https://es.webuy.com/...",
  "listingRegion": "PAL España",
  "regionVerified": true,
  "regionEvidence": ["listing_title_region"]
}
```

## Siguiente fase

**Fase 2:** scrapers / APIs Wallapop, eBay ES, Vinted + IA visión para `regionEvidence`.
