# TodoConsolas: recolección prudente de referencias

## Decisión operativa

Region Atlas solo debe consultar las categorías públicas configuradas en
`data/platform-sources.json`. No debe usar `/busqueda?controller=search`, porque
el `robots.txt` de TodoConsolas excluye expresamente ese controlador y las
pruebas de filtros facetados devolvieron HTTP 429.

El cliente bloquea esa búsqueda antes de realizar la petición. Por tanto, el
recolector antiguo falla de forma segura si alguien intenta ejecutarlo mientras
se sustituye por el flujo de categorías.

El piloto `scripts/collect_todoconsolas_category_pilot.py`:

- visita únicamente páginas de categoría;
- no abre fichas individuales;
- filtra `Segunda mano` en local;
- exige una región explícita para considerar una coincidencia;
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

El informe opcional es diagnóstico, no un payload de precios:

```bash
python3 scripts/collect_todoconsolas_category_pilot.py \
  --platform ps4 \
  --start-page 1 \
  --max-pages 1 \
  --output /tmp/todoconsolas-ps4-review.json
```

## Criterio de incorporación futuro

Todas las coincidencias siguen siendo revisión humana durante el piloto. Solo
después de medir varias páginas se podrá valorar una cola de importación para
coincidencias exactas de título, edición y región. Los ambiguos, productos sin
región y posibles variantes siempre deben permanecer fuera del precio agregado.

El recolector general y la rueda automática deben continuar desactivados hasta
que el piloto tenga una tasa de error aceptable y la activación se apruebe de
forma explícita desde administración.
