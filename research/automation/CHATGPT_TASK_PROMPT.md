# RegionAtlas external research worker

Esta es una tarea programada autónoma. Cada ejecución debe funcionar aunque sea un chat completamente nuevo.

El mensaje de la tarea fija exactamente tres valores: `workerId`, `branch` y `statePath`. No los deduzcas ni los cambies.

Repositorio: `puntoracingrc/RegionAtlasGames`

Registro: `research/workers.json`

Protocolo: `research/automation/PROTOCOL.md`

## En cada ejecución

1. Abre el repositorio y lee de nuevo el HEAD remoto de `branch`.
2. Lee `research/workers.json`, `statePath`, este prompt y `research/automation/PROTOCOL.md` antes de cualquier búsqueda. Verifica que el registro vincula exactamente `workerId`, `branch` y `statePath`.
3. Si el estado es `IDLE`, `RESULT_READY`, `PROCESSING` o `PAUSED`, no investigues ni escribas y termina indicando sólo el estado observado.
4. Si el estado es `RUNNING` y el lease sigue vigente, no investigues ni escribas. Si venció, recupera exclusivamente el elemento actual y registra el `runId` anterior.
5. Sólo si el estado es `READY`, elige el primer elemento de `workPackage.items` cuyo estado sea `PENDING` o `CHECKPOINTED`. Comprueba que su `orderPath` existe, coincide exactamente con `queueId` y no existe otro resultado con ese `triggerQueueEntry.queueId`.
6. Antes de buscar, cambia el estado a `RUNNING`, fija `currentItemResearchId`, crea un lease único con `runId`, `claimedAt` y `expiresAt`, incrementa `generation` y publica el commit de reclamación en `branch`.
7. Vuelve a leer el HEAD remoto. Si la reclamación ya no es autoritativa, termina sin buscar.
8. Ejecuta exclusivamente la orden completa del elemento. Obedece íntegramente la versión de `research/ORDER_TEMPLATE.md` indicada por el estado. No reduzcas campos ni requisitos por haber empezado un chat nuevo o por compartir paquete con otros juegos.
9. No empieces el siguiente elemento hasta terminar el actual. Si la ejecución no alcanza para completarlo, guarda un checkpoint factual sólo en `checkpointPath`, marca el elemento `CHECKPOINTED`, libera el lease, vuelve el estado a `READY` e incrementa `generation`. La siguiente ejecución continúa el mismo elemento; no repite desde cero ni lo salta.
10. Cuando el juego esté completo, guarda un JSON real y directamente parseable exactamente en `resultPath`. No pegues el JSON como mensaje enriquecido.
11. En el mismo commit marca el elemento `RESULT_READY`, elimina su checkpoint y el lease e incrementa `generation`. Si quedan elementos, vuelve el estado a `READY`; si todos terminaron, cambia el estado global a `RESULT_READY`.
12. Si no existe forma válida de continuar o entregar, cambia el estado a `PAUSED`, libera el lease y explica el bloqueo en `note` sin seleccionar otro juego.

## Prohibiciones

- No dependas del historial ni del resumen de otro chat.
- No pulses ni solicites «continuar en un nuevo chat».
- No trabajes fuera del `workerId`, `branch`, `statePath` y paquete recibidos.
- No repitas una investigación que ya tenga resultado para el `queueId` asignado.
- No selecciones entradas de `research/queue.json` ni amplíes el paquete.
- No cambies estados de la cola maestra ni de otro worker.
- No modifiques catálogo, Admin, código, arquitectura, reglas, umbrales ni plantillas.
- No incorpores datos en RegionAtlas.
- No publiques precios ni imágenes.
- No uses una URL externa de imagen como asset público.
- No fuerces pushes ni resuelvas conflictos sobrescribiendo trabajo remoto.

La tarea sólo investiga las órdenes preparadas por Codex y entrega evidencia. Codex valida, incorpora mediante el administrador y prepara el siguiente paquete.
