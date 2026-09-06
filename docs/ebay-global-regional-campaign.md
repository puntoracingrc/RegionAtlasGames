# Campaña regional global de eBay

## Objetivo

Completar y refrescar precios del catálogo físico desde eBay España sin ejecutar workers largos en Vercel. La campaña usa la Browse API oficial, entrega a España y origen de vendedor acorde con la edición regional.

## Automatización

- Workflow: `.github/workflows/ebay-ps4-regional-campaign.yml`.
- Frecuencia: cada 6 horas (`23 */6 * * *`).
- Presupuesto: cuatro tandas diarias de hasta 250 búsquedas API; máximo 1.000 búsquedas al día.
- Una variante puede consumir una segunda búsqueda aprendida si la primera no devuelve resultados; el presupuesto cuenta llamadas reales, no juegos seleccionados.
- El consumo se guarda por fecha UTC; una ejecución manual también descuenta presupuesto y las tandas posteriores se recortan o esperan al día siguiente.
- Orden: continúa PS4 desde su estado actual y después recorre las plataformas de `data/platforms.json`.
- Dentro de cada región: primero fichas sin precio y después las ya valoradas, siempre por título e ID.
- Estado: `data/ebay-regional-campaigns/<plataforma>.json` y resumen `global.json`.
- Escritura: solo por commit Git a `main`; si `main` avanza con cambios compatibles, el lote se rebasa y publica sin perder las búsquedas realizadas.

## Regiones

- La campaña solo recorre `PAL España`, el alias heredado `España` y `PAL Europa`.
- USA, Japón, PAL UK y las demás regiones quedan fuera de esta campaña.
- Los hallazgos de esas regiones tampoco se redirigen ni actualizan: quedan descartados o pendientes de revisión sin tocar sus fichas.
- `PAL Europa` usa una sola búsqueda `CONTINENTAL_EUROPE` para no duplicar una edición compartida.
- Ediciones distintas del mismo título mantienen precio independiente.
- Una región futura sin política explícita debe revisarse antes de permitir que publique datos.

### Hallazgos de otra región

- Si una búsqueda de España encuentra una edición japonesa, USA u otra región excluida, esa fila no entra en ningún precio de la campaña.
- El enrutado solo puede moverse entre variantes incluidas en el alcance PAL España/PAL Europa.
- Una referencia regional exacta o la visión de la carátula deben confirmar la edición antes de publicar el precio en otra variante PAL incluida.
- Si existe una única ficha del mismo juego, edición y formato físico para la región PAL confirmada, el anuncio se reasigna a esa ficha.
- Si falta la ficha, hay varias candidatas o las señales se contradicen, el anuncio entra en la cola de `/admin/precios` y no modifica precios.
- El país del vendedor solo es una pista para solicitar comprobación visual. Nunca confirma por sí solo que el juego sea japonés, americano o europeo.
- El sync cruzado requiere `--catalog-ids-file` y solo permite los IDs exactos buscados o confirmados por el collector.
- Encontrar otra región no marca la ficha buscada como resuelta: España sigue sin coincidencia hasta obtener evidencia española propia.

El filtro de eBay mantiene `EBAY_ES` y entrega al código postal español configurado. El precio del artículo, el transporte y el total estimado a España se guardan por separado. Los posibles costes de importación se calculan con el país real del anuncio cuando está disponible.

## Portadas

La misma respuesta de eBay alimenta `data/ebay-regional-campaigns/cover-candidates.json` solo cuando la ficha no tiene portada. Son fotos de anuncios y quedan como `pending_review`: nunca reemplazan automáticamente una portada existente ni se publican sin revisión.

## Operación

### Saldo de IA agotado

Los errores `insufficient_quota`, `credit_balance_exhausted` y
`billing_hard_limit_reached` pausan la campaña. Un 429 temporal no se interpreta
como falta de saldo. El lote interrumpido no se sincroniza ni se marca como
completado o sin coincidencias; sus llamadas eBay sí cuentan en el presupuesto.
El estado global persiste `status=paused` y `pauseReason=ai_balance_exhausted`.
Admin muestra «Pausado por saldo agotado de IA». Las ejecuciones programadas
posteriores salen sin realizar búsquedas mientras persista esa pausa.

Después de recargar OpenAI, ejecutar manualmente el workflow con
«Reanudar tras recargar saldo de IA». No es una recarga automática ni una
comprobación del saldo: si OpenAI vuelve a rechazar la llamada, se pausa de nuevo.
La pausa sale con código cero para que el workflow publique su estado en Git;
no representa una tanda de datos completada. El aviso aparece en Admin tras
desplegar ese commit de estado.

El modelo de visión por defecto es `gpt-4o-mini`; puede sobrescribirse mediante
`OPENAI_VISION_MODEL` o, en su defecto, `OPENAI_MODEL`. Este workflow no configura
ninguna de esas sobrescrituras. El modelo recibe imágenes, no solo sus títulos.

```bash
python3 scripts/run_ebay_regional_campaign.py --dry-run --batch-size 250 --search-budget 250
python3 scripts/run_ebay_regional_campaign.py --platform ps4 --dry-run --batch-size 25 --search-budget 25
npm run test:collector-controls
```

El panel `/admin/precios` muestra avance global, plataforma y región actual, estimación de la primera vuelta, candidatos de portada y un registro copiable.
