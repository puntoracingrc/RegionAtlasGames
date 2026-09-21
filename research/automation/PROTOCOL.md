# Control automático por worker mediante Git

`research/workers.json` registra los workers autorizados. Cada worker tiene una rama Git exclusiva y un único estado autoritativo en `research/workers/<workerId>/active.json`. El historial de una conversación no contiene estado operativo y puede agotarse o desaparecer sin bloquear la cadena.

## Aislamiento

- Una tarea sólo puede leer y escribir la rama y el `statePath` de su `workerId`.
- Los resultados se guardan en `research/results/`, pero cada `researchId` y `queueId` sólo puede pertenecer a un worker.
- Los workers nunca seleccionan entradas, crean paquetes, modifican `queue.json` ni escriben el estado de otro worker.
- Codex prepara los paquetes en `research-pipeline` y publica el mismo commit como punto de partida de cada rama de worker.

## Estados del worker

- `IDLE`: no existe un paquete preparado.
- `READY`: Codex ha preparado un paquete y el worker puede reclamarlo.
- `RUNNING`: una ejecución posee el lease y tiene un juego en curso.
- `RESULT_READY`: todos los resultados del paquete existen; ChatGPT no vuelve a investigar y Codex debe validarlos.
- `PROCESSING`: Codex está validando e incorporando mediante el administrador.
- `PAUSED`: existe un conflicto, desviación o fallo que exige revisión.

Sólo Codex puede pasar de `IDLE` a `READY`, de `RESULT_READY` a `PROCESSING` y preparar el siguiente paquete. ChatGPT sólo puede pasar de `READY` a `RUNNING`; entre juegos puede volver a `READY`; al cerrar el paquete pasa a `RESULT_READY`; ante un bloqueo real pasa a `PAUSED`.

## Paquete y progreso por juego

`workPackage.items` contiene las órdenes en su orden obligatorio. Cada elemento tiene su propio `queueId`, `researchId`, `orderPath`, `resultPath`, `status` y `checkpointPath`.

El worker procesa como máximo un elemento a la vez. Termina y publica el JSON de un juego antes de iniciar el siguiente. Un resultado parcial nunca se publica en `research/results/`. Si una ejecución no puede terminar el juego actual, guarda únicamente un checkpoint factual en la ruta declarada, renueva o libera el lease de forma coherente y continúa ese mismo juego en la siguiente ejecución. No lo salta ni empieza otro.

Si un juego queda completo y aún hay otro pendiente, el worker marca ese elemento `RESULT_READY`, limpia su checkpoint, deja el estado global en `READY` y termina si no dispone de tiempo suficiente para completar el siguiente. Cuando todos los elementos estén `RESULT_READY`, el estado global pasa a `RESULT_READY`.

## Lease y concurrencia

Antes de buscar, ChatGPT guarda y publica un lease con `runId`, `claimedAt` y `expiresAt`. Otra ejecución del mismo worker no actúa mientras el lease siga vigente. Si ha vencido, una nueva ejecución puede recuperarlo dejando constancia del `runId` anterior.

Cada transición se confirma mediante un commit en la rama exclusiva del worker. Antes de escribir, la ejecución vuelve a leer el HEAD remoto. Si cambiaron `generation`, estado, paquete, elemento actual o lease, abandona su escritura y evalúa el estado nuevo. Un rechazo non-fast-forward obliga a releer; nunca se fuerza un push.

## Continuidad entre chats

La tarea programada es independiente y puede iniciar una conversación nueva en cada ejecución. Siempre comienza leyendo `research/workers.json`, su `statePath`, este protocolo y el prompt durable. Nunca intenta resumir, continuar ni depender del chat anterior. La orden completa, plantilla, cola, checkpoints y resultados viven en Git.

El cambio de conversación no autoriza una nueva búsqueda. `RESULT_READY`, `PROCESSING` o `PAUSED` hacen que ChatGPT termine sin modificar nada. Sólo `READY` o un `RUNNING` recuperable permiten continuar.

## Límites

ChatGPT no modifica el catálogo, los precios runtime, la cola maestra, el código, la plantilla, las reglas ni los estados de otros workers. No selecciona el siguiente juego y no incorpora datos en RegionAtlas. Codex valida cada resultado, incorpora mediante Admin, verifica el runtime y sólo entonces prepara otro paquete.
