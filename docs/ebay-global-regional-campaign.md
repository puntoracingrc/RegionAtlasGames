# Campaña regional global de eBay

## Objetivo

Completar y refrescar precios del catálogo físico desde eBay España sin ejecutar workers largos en Vercel. La campaña usa la Browse API oficial, entrega a España y origen de vendedor acorde con la edición regional.

## Automatización

- Workflow: `.github/workflows/ebay-ps4-regional-campaign.yml`.
- Frecuencia: cada 6 horas (`23 */6 * * *`).
- Lote programado: 50 variantes; el despacho manual permite entre 1 y 250.
- Orden: continúa PS4 desde su estado actual y después recorre las plataformas de `data/platforms.json`.
- Dentro de cada región: primero fichas sin precio y después las ya valoradas, siempre por título e ID.
- Estado: `data/ebay-regional-campaigns/<plataforma>.json` y resumen `global.json`.
- Escritura: solo por commit Git a `main`; el workflow se detiene si `main` cambia mientras procesa el lote.

## Regiones

- España, UK, Alemania, Francia, Italia, Australia, USA y Japón usan país de origen concreto.
- `PAL Europa` y etiquetas Multi-PAL usan una sola búsqueda `CONTINENTAL_EUROPE` para no duplicar una edición compartida.
- Ediciones distintas del mismo título mantienen precio independiente.
- Una región futura sin política explícita debe revisarse antes de permitir que publique datos.

### Hallazgos de otra región

- Si una búsqueda de España encuentra una edición japonesa, USA u otra región explícita, esa fila no entra en el precio español.
- Una referencia regional exacta o la visión de la carátula deben confirmar la edición antes de publicar el precio en otra variante.
- Si existe una única ficha del mismo juego, edición y formato físico para la región confirmada, el anuncio se reasigna a esa ficha.
- Si falta la ficha, hay varias candidatas o las señales se contradicen, el anuncio entra en la cola de `/admin/precios` y no modifica precios.
- El país del vendedor solo es una pista para solicitar comprobación visual. Nunca confirma por sí solo que el juego sea japonés, americano o europeo.
- El sync cruzado requiere `--catalog-ids-file` y solo permite los IDs exactos buscados o confirmados por el collector.
- Encontrar otra región no marca la ficha buscada como resuelta: España sigue sin coincidencia hasta obtener evidencia española propia.

El filtro de eBay mantiene `EBAY_ES` y entrega al código postal español configurado. El precio del artículo, el transporte y el total estimado a España se guardan por separado. Los posibles costes de importación se calculan con el país real del anuncio cuando está disponible.

## Portadas

La misma respuesta de eBay alimenta `data/ebay-regional-campaigns/cover-candidates.json` solo cuando la ficha no tiene portada. Son fotos de anuncios y quedan como `pending_review`: nunca reemplazan automáticamente una portada existente ni se publican sin revisión.

## Operación

```bash
python3 scripts/run_ebay_regional_campaign.py --dry-run --batch-size 50
python3 scripts/run_ebay_regional_campaign.py --platform ps4 --dry-run --batch-size 25
npm run test:collector-controls
```

El panel `/admin/precios` muestra avance global, plataforma y región actual, estimación de la primera vuelta, candidatos de portada y un registro copiable.
