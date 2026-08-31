# Precios de Region Atlas

El sistema separa **recolección**, **validación** y **publicación**. Vercel sirve la web y crea trabajos pequeños; el PC servidor ejecuta los collectors; Git publica únicamente artefactos verificados.

## Motores automáticos vigentes

| Motor | Ejecución | Alcance | Publicación |
|---|---|---|---|
| eBay regional | GitHub Actions cada 6 h | Todas las plataformas y regiones, campaña reanudable | Commit Git de su campaña existente |
| TodoConsolas semanal | PC servidor | PS4, PS5 y Switch 2; categorías públicas; ritmo prudente | Artefacto exacto título + región, validado y publicado por PR |
| GAME semanal | Vercel crea trabajos; PC servidor recolecta | Lanzamientos nuevos y precios seminuevos de PS4, PS5 y Switch 2 | Los precios seminuevos seguros se validan y publican por PR |

`.github/workflows/publish-verified-price-artifacts.yml` consulta cada 6 horas si hay resultados cerrados. No ejecuta scraping: descarga el artefacto, valida su contrato, ejecuta `sync_es_prices.py --dry-run`, aplica el lote, pasa todos los controles de calidad y usa rama + PR + checks + merge.

La antigua rueda general se conserva solo para recuperación manual:

- `.github/workflows/daily-price-ingest.yml` ya no tiene cron.
- `scripts/remote_price_rotation.sh` no ejecuta nada salvo activación heredada explícita.
- El PC ignora `PRICE_PC_DAILY_ENABLED`; la rueda antigua solo arranca con `PRICE_PC_LEGACY_ROTATION_ENABLED=1`.
- El enriquecimiento de catálogo en staging sigue disponible manualmente, pero ya no consume un cron diario de Vercel.

## Autoridad y seguridad

1. El collector nunca modifica producción directamente.
2. TodoConsolas solo publica filas `autoApproved` con política `tcns_exact_title_region_used_v1`, título/edición exactos y región idéntica.
3. GAME solo acepta lotes `preowned`; `sync_es_prices.py` limita el autoaceptado a PAL España con match seguro y sin marcadores de importación.
4. Los candidatos regionales, coincidencias ambiguas y huecos de catálogo no se publican automáticamente.
5. Los recibos en `data/price-artifact-publish-state.json` impiden aplicar dos veces una campaña o trabajo.
6. Los workflows comparten el grupo de concurrencia `price-data-writes`, por lo que dos campañas no escriben precios a la vez.

## Fuentes y pesos

Todas las fuentes verificadas pueden aportar a la media de su estado. El peso está en `data/price-source-weights.json`.

En lotes curatoriales y revisiones manuales de un juego concreto, el orden de
busqueda es fijo: Wallapop, eBay, TodoConsolas y despues otras tiendas o
plataformas españolas. Si una fuente prioritaria no devuelve una oferta activa
exacta de la misma edicion fisica PS4 PAL España, se documenta como hueco y se
pasa a la siguiente fuente.

| Categoría | Ejemplos | Peso por observación |
|---|---|---:|
| P2P | eBay, Wallapop, Vinted, TodoColeccion | 1,00 |
| Tienda española | GAME, TodoConsolas, CeX | 0,65 |
| Tienda de importación | JGO, Chollo, Kaoto | 0,55 |

Cada anuncio P2P cuenta por separado. Por eso, cuando hay volumen suficiente, las ventas y anuncios reales dominan la estimación; las tiendas rellenan huecos y estabilizan el dato.

Los precios retail validados se conservan por fuente y vuelven a participar en ejecuciones posteriores. No se pierden cuando el siguiente lote procede de otro motor.

## Estados del artículo

No se mezclan estados diferentes:

| Campo | Estado público |
|---|---|
| `estimatedPriceLoose` | Juego o cartucho suelto |
| `estimatedPriceGameManual` | Juego + manual, sin caja completa |
| `estimatedPriceComplete` | Abierto con todo el contenido que incluia esa edicion de fabrica |
| `estimatedPriceSealed` | Precintado |
| `estimatedPriceNewRetail` | Nuevo en tienda, sin confirmacion visual de precinto |

`recommendedPrice` usa, por orden, completo, juego + manual, suelto, precintado
y nuevo en tienda. PAL UK, Francia, Alemania, Italia, USA, Japon/Asia,
digitales, lotes y ediciones distintas nunca rellenan huecos de PAL España.

La presencia de manual se decide por juego y edicion, no por una regla general de
plataforma. `manualExpected: true` exige el manual para clasificar una copia como
completa; `false` permite caja + juego cuando esa edicion nunca lo incluyo. Si el
valor no esta confirmado, una mencion como `sin manual` queda para revision y no
se convierte automaticamente en completa. El recolector solo aprende esta regla
de decisiones aceptadas en la cola de revision, nunca de candidatos pendientes.

Se exigen al menos dos observaciones del mismo estado para calcular una media y tres para marcarla como verificada. Los outliers, precios imposibles, anuncios antiguos y regiones incompatibles se descartan.

## Visibilidad pública

- La web pública solo muestra ofertas y enlaces comerciales de programas afiliados.
- GAME, TodoConsolas, CeX y otras fuentes no afiliadas pueden nutrir el cálculo, pero sus anuncios, marcas y enlaces no se muestran en las fichas públicas.
- El administrador conserva el detalle técnico para auditoría y revisión.

## GAME

El cron `/api/cron/game-release-discovery` crea semanalmente dos trabajos por plataforma:

- `catalog_discovery` de juegos nuevos ya publicados.
- `api_collect` de precios seminuevos, recorriendo páginas sucesivas y volviendo al inicio al llegar al final.

Los trabajos llevan `trigger: automatic`. El administrador distingue estos lotes de los manuales: los automáticos se publican por Git; un pegado o búsqueda manual conserva su confirmación explícita.

## TodoConsolas

El control del PC se activa desde el panel de actualización con `automatic_sources`. La configuración segura es:

- Plataformas: `ps4`, `ps5`, `switch2`.
- Frecuencia: 7 días.
- Una página por intervalo del daemon.
- Espera y jitter entre peticiones.
- Sin búsquedas internas ni visitas masivas a fichas individuales.

Al terminar una campaña, el PC sube `ready-for-git.json` y un ingest por plataforma. El publicador elimina `regionalCandidates` antes del sync y solo aplica la colección `tcns` exacta.

## Comandos operativos

```bash
# Validar el publicador y la ponderación
python3 scripts/test_price_artifact_publisher.py
python3 scripts/test_price_condition_sources.py

# Simular la lectura de artefactos remotos sin escribir
python3 scripts/publish_verified_price_artifacts.py --dry-run

# Sync manual de un ingest ya validado
python3 scripts/sync_es_prices.py \
  --platform ps5 \
  --input /ruta/lote.json \
  --no-advance-rotation \
  --no-vision \
  --dry-run

# Controles completos de collectors
npm run test:collector-controls
```

No se deben activar de nuevo varios programadores generales a la vez. Para añadir una fuente automática nueva, debe tener collector dedicado, contrato de artefacto, recibo idempotente, prueba de región/estado y publicación Git independiente de la recolección.
