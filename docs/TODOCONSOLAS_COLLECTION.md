# TodoConsolas: recolección prudente de referencias

## Decisión operativa

Region Atlas solo debe consultar las categorías públicas configuradas en
`data/platform-sources.json`. No debe usar `/busqueda?controller=search`, porque
el `robots.txt` de TodoConsolas excluye expresamente ese controlador y las
pruebas de filtros facetados devolvieron HTTP 429.

El cliente bloquea esa búsqueda antes de realizar la petición. Por tanto, el
recolector antiguo falla de forma segura si alguien intenta ejecutarlo mientras
se sustituye por el flujo de categorías.

El recolector prudente `scripts/collect_todoconsolas_category_pilot.py`:

- visita únicamente páginas de categoría;
- no abre fichas individuales;
- filtra `Segunda mano` en local;
- autoaprueba solo segunda mano normal con título/edición y región exactos;
- no usa IA ni tiene opción de sincronización;
- procesa como máximo cinco páginas por ejecución;
- espera al menos cinco segundos entre peticiones;
- se detiene sin reintentar ante HTTP 403 o 429.

## Piloto PS4

```bash
python3 scripts/collect_todoconsolas_category_pilot.py \
  --platform ps4 \
  --start-page 1 \
  --max-pages 1 \
  --dry-run
```

Para inspeccionar otra parte del catálogo se cambia `--start-page`. Nunca se
deben ejecutar más de cinco páginas por tanda. Un barrido semanal completo se
puede repartir en ventanas sucesivas; no hace falta consultar cada juego ni
repetirlo cada seis horas.

El informe opcional es diagnóstico. El lote separado contiene únicamente
precios autoaprobados en `tcns` y dudas en `regionalCandidates`:

```bash
python3 scripts/collect_todoconsolas_category_pilot.py \
  --platform ps4 \
  --start-page 1 \
  --max-pages 1 \
  --output /tmp/todoconsolas-ps4-review.json \
  --ingest-output /tmp/todoconsolas-ps4-ingest.json
```

Las ventanas siguientes pueden unirse sin duplicar productos:

```bash
python3 scripts/collect_todoconsolas_category_pilot.py \
  --platform ps4 --start-page 2 --max-pages 4 \
  --ingest-output /tmp/todoconsolas-ps4-ingest.json --merge --dry-run
```

## Criterio de incorporación

La política `tcns_exact_title_region_used_v1` permite aplicar automáticamente
solo una coincidencia única con título canónico o referencia exactos, región
idéntica, estado `Segunda mano` y precio dentro de los límites. Los ambiguos,
productos sin región, variantes regionales compatibles pero no idénticas,
ediciones distintas y cambios superiores al 50 %/100 % quedan en revisión.

Antes de aplicar se genera una lista de IDs y se ejecuta siempre `sync_es_prices`
con `--dry-run`, `--catalog-ids-file`, `--no-advance-rotation` y `--no-vision`.
El sincronizador vuelve a validar la política y no permite que una fila marcada
manualmente como aprobada eluda estos controles.

La ejecución real conserva el precio de TodoConsolas como referencia separada:
no altera por sí sola el precio recomendado ni los rangos de mercado. Las dudas
se guardan en la cola de revisión de `/admin/precios`. Para publicar esa cola:

```bash
python3 scripts/pc_sftp_worker.py --upload-review-queue
```

La subida lee primero la cola remota, conserva decisiones ya aceptadas o
rechazadas, añade los casos locales y verifica el contenido después de subirlo.

El recolector general y la rueda automática deben continuar desactivados hasta
que el piloto tenga una tasa de error aceptable y la activación se apruebe de
forma explícita desde administración.
