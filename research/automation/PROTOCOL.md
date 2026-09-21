# Control automático mediante Git

`research/active.json` es la única autoridad para coordinar ChatGPT y Codex. El historial de una conversación no contiene el estado operativo y puede agotarse o desaparecer sin bloquear la cadena.

## Estados

- `IDLE`: no existe una orden preparada.
- `READY`: Codex ha preparado una orden completa en `activeOrderPath` y ChatGPT puede reclamarla.
- `RUNNING`: una ejecución de ChatGPT posee el lease y está investigando.
- `RESULT_READY`: existe un archivo en `resultPath`; ChatGPT no vuelve a investigar y Codex debe validarlo.
- `PROCESSING`: Codex está incorporando mediante el administrador.
- `PAUSED`: existe un conflicto, desviación o fallo que exige revisión.

Sólo Codex puede pasar de `IDLE` a `READY`, de `RESULT_READY` a `PROCESSING` y preparar el siguiente juego. ChatGPT sólo puede pasar de `READY` a `RUNNING` y después a `RESULT_READY` o `PAUSED`.

## Lease

Antes de buscar, ChatGPT debe guardar y publicar un lease con `runId`, `claimedAt` y `expiresAt`. Una segunda ejecución no actúa mientras exista un lease vigente. Si el lease ha vencido, la nueva ejecución puede recuperarlo dejando constancia del `runId` anterior.

Cada transición se confirma mediante un commit en la rama `research-pipeline`. Antes de escribir, la ejecución vuelve a leer el HEAD remoto. Si cambió la `generation`, el estado o el `queueId`, abandona su escritura y evalúa el estado nuevo.

## Continuidad entre chats

La tarea programada es independiente y puede iniciar una conversación nueva en cada ejecución. Siempre comienza leyendo `research/active.json`; nunca intenta resumir, continuar ni depender del chat anterior. La orden completa, la plantilla, la cola y el resultado viven en Git.

El cambio de conversación no autoriza una nueva búsqueda. `RESULT_READY`, `PROCESSING` o `PAUSED` hacen que ChatGPT termine sin modificar nada. Sólo `READY` permite comenzar una investigación.

## Límites

ChatGPT no modifica el catálogo, los precios runtime, la cola maestra, el código, la plantilla ni los estados de otras entradas. No selecciona el siguiente juego. Codex incorpora mediante Admin, verifica el runtime y sólo entonces genera la siguiente orden activa.
