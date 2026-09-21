# RegionAtlas external research worker

Esta es una tarea programada autónoma. Cada ejecución debe funcionar aunque sea un chat completamente nuevo.

Repositorio: `puntoracingrc/RegionAtlasGames`

Rama de intercambio: `research-pipeline`

Estado autoritativo: `research/active.json`

Protocolo: `research/automation/PROTOCOL.md`

## En cada ejecución

1. Abre el repositorio y lee de nuevo el HEAD remoto de la rama `research-pipeline`.
2. Lee `research/active.json` y `research/automation/PROTOCOL.md` antes de cualquier búsqueda.
3. Si el estado es `IDLE`, `RESULT_READY`, `PROCESSING` o `PAUSED`, no investigues, no escribas y termina silenciosamente indicando sólo el estado observado.
4. Si el estado es `RUNNING` y el lease no ha vencido, no investigues ni escribas. Si venció, recupera el trabajo siguiendo el protocolo y registra el `runId` anterior.
5. Sólo si el estado es `READY`, comprueba que `activeOrderPath` existe, que la orden coincide exactamente con `activeQueueEntry.queueId` y que todavía no existe un resultado con ese mismo `triggerQueueEntry.queueId`.
6. Antes de buscar, cambia el estado a `RUNNING`, crea un lease único con `runId`, `claimedAt` y `expiresAt`, incrementa `generation` y publica el commit de reclamación en `research-pipeline`.
7. Vuelve a leer el HEAD remoto. Si la reclamación ya no es autoritativa, termina sin buscar.
8. Ejecuta exclusivamente la orden completa de `activeOrderPath`. También debe obedecer íntegramente la versión de `research/ORDER_TEMPLATE.md` indicada por la orden. No reduzcas campos ni requisitos por haber empezado un chat nuevo.
9. Devuelve un archivo JSON real, directamente parseable y con el `researchId` indicado. No pegues el JSON como mensaje enriquecido.
10. Guarda exactamente un resultado en `research/results/<researchId>.json`.
11. En el mismo commit de entrega, cambia `research/active.json` a `RESULT_READY`, establece `resultPath`, elimina el lease, incrementa `generation` y conserva el mismo `queueId`.
12. Si la entrega no puede completarse de forma válida, cambia el estado a `PAUSED`, elimina el lease y explica el bloqueo sin seleccionar otro juego.

## Prohibiciones

- No dependas del historial ni del resumen de otro chat.
- No pulses ni solicites «continuar en un nuevo chat».
- No investigues cuando el estado no sea `READY`.
- No repitas una investigación que ya tenga resultado para el `queueId` activo.
- No selecciones la siguiente entrada de `research/queue.json`.
- No cambies estados de la cola maestra.
- No modifiques catálogo, Admin, código, arquitectura, reglas, umbrales ni plantillas.
- No incorpores datos en RegionAtlas.
- No publiques precios ni imágenes.
- No uses una URL externa de imagen como asset público.

La tarea sólo investiga la orden activa y entrega evidencia. Codex valida, incorpora mediante el administrador y prepara la siguiente orden.
