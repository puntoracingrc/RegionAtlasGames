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

## Plataformas configuradas

El registro `data/platform-sources.json` contiene categorías públicas para 21
plataformas: Nintendo (NES a Switch 2), Sega, Neo Geo y PlayStation (PS1 a
PS5). PS4, PS5 y Switch 2 tienen prioridad al comenzar cada campaña. Las dos
variantes Neo Geo comparten una categoría y se consulta una sola vez.

## Barrido manual

```bash
python3 scripts/collect_todoconsolas_category_pilot.py \
  --platform ps5 \
  --start-page 1 \
  --max-pages 1 \
  --dry-run
```

Para cambiar de catálogo se usa `--platform ps4`, `--platform ps5` o
`--platform switch2`; también se admite cualquier plataforma con categoría en
el registro. Para inspeccionar otra parte se cambia `--start-page`. Nunca se
deben ejecutar más de cinco páginas por tanda. Un barrido semanal completo se
puede repartir en ventanas sucesivas; no hace falta consultar cada juego ni
repetirlo cada seis horas.

## Motor semanal del PC

`scripts/collect_todoconsolas_weekly.py` automatiza esas ventanas sin convertir
el barrido en tráfico agresivo:

- procesa por defecto dos páginas de una única categoría por pasada;
- conserva campaña, categoría y página siguiente en
  `data/worker-runtime/todoconsolas-weekly/state.json`;
- reanuda después de apagar o reiniciar el PC;
- espera al menos cinco segundos entre peticiones y añade jitter;
- ante HTTP 403/429 se detiene sin reintento y entra en backoff;
- deduplica categorías compartidas y ofertas repetidas;
- separa `safe_exact`, `manual_match`, `catalog_gap`, `regional_variant`,
  `price_anomaly` y `missing_region`;
- deja los exactos en un artefacto `ready-for-git.json`; nunca escribe precios
  en el catálogo ni publica producción.

El worker permanente solo lo ejecuta cuando existe una configuración explícita.
La plantilla local lo mantiene en `0`; además,
`PRICE_PC_TODOCONSOLAS_WEEKLY_HARD_DISABLED=1` funciona como corte local de
emergencia y prevalece sobre el panel. El estado y el log se publican en el
almacenamiento externo para que `/admin/precios` muestre avance, pausas,
coincidencias exactas y elementos de revisión.

## Actualización segura del PC

`/admin/precios` puede solicitar dos acciones cerradas: actualizar el worker o
actualizarlo y preparar un piloto PS4. La solicitud no contiene comandos y el PC
solo la acepta si se cumplen todas estas condiciones:

- el SHA solicitado es el commit completo que Vercel tiene en producción;
- el remoto es `puntoracingrc/RegionAtlasGames`;
- el checkout está en `main` y no tiene cambios locales;
- `origin/main` sigue apuntando exactamente al SHA solicitado;
- el avance es fast-forward y se ejecuta con `git merge --ff-only`.

No se admiten ramas arbitrarias, `reset`, fuerza, rollback ni ejecución remota de
comandos. El piloto administrado también queda limitado a plataformas conocidas,
una o dos páginas por pasada, pausas de 5 a 30 segundos y backoff mínimo de 24
horas. El piloto recomendado empieza con PS4, una página, 8 segundos de pausa,
3 de jitter y periodicidad semanal.

El PC instalado antes de esta función necesita un único arranque manual para
aprender a leer estas solicitudes. Siempre después del merge, checks y
verificación de producción:

```powershell
Stop-ScheduledTask -TaskName "Region Atlas PC Worker"
git pull --ff-only origin main
Start-ScheduledTask -TaskName "Region Atlas PC Worker"
py scripts\pc_sftp_worker.py --dry-run
```

Después de ese arranque, las actualizaciones futuras se solicitan desde el panel
y el PC informa de hostname, commit, rama, limpieza y configuración activa. Si
el checkout está sucio o diverge, se para sin sobrescribir nada. El panel ofrece
un diagnóstico copiable sin credenciales.

El repositorio público se puede actualizar en lectura sin un token clásico de
GitHub. No se deben guardar PAT de escritura en `.env.worker` ni en el remoto
Git del PC para ejecutar este recolector. Si `git pull --ff-only` detecta cambios
locales o divergencia, se conserva el checkout y se revisa; nunca se fuerza con
`reset --hard`.

Ejecución local controlada de una sola tanda:

```bash
python3 scripts/collect_todoconsolas_weekly.py \
  --platforms ps4,ps5,switch2 \
  --pages-per-run 2 \
  --delay 6 \
  --jitter 2
```

Al completar todas las categorías, el siguiente ciclo queda programado siete
días después. La incorporación sigue este orden obligatorio: dry-run de
`sync_es_prices`, revisión del diff, rama, commit, push, PR, checks, merge y
verificación de Production Domain.

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

El recolector general y la rueda automática permanecen independientes y pueden
seguir desactivados. El motor semanal del PC tiene su propio interruptor para
que una activación futura no encienda por accidente otros recolectores.
