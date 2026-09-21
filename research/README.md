# Protocolo de intercambio de investigación

Las rutas `/research/queue.json` y `/research/results/` son relativas a la raíz de este repositorio. Son archivos locales de intercambio; no son endpoints web.

## Cola e identificación

`queue.json` es una copia íntegra de `artifacts/research-queue/regionatlas-game-research-queue.json`. Conserva orden, estructura, prioridades, estados e identificadores originales. El ID de entrada de cola es su `canonicalId`; no se crea otro ID. `catalogIds` identifica las fichas originales y `platforms` conserva las plataformas registradas.

La cola de origen ya contiene ocho entradas con varias plataformas. Se conservan tal cual, sin realizar nuevas agrupaciones. En cada referencia de intercambio se especifican además la plataforma y los `catalogIds` concretos a los que corresponden los hallazgos. Los IDs derivados de la exportación no equivalen necesariamente a una entidad canónica persistida del catálogo.

## Flujo

1. ChatGPT toma una entrada `pending` como punto de partida. Puede investigar el mismo videojuego en otras plataformas que formen parte actualmente de RegionAtlas.
2. ChatGPT devuelve datos factuales y fuentes en un archivo JSON dentro de `results/`, identificado por `researchId`. ChatGPT no decide cómo se estructura el catálogo.
3. Codex interpreta el resultado usando la estructura actual de RegionAtlas e identifica las fichas existentes a las que corresponde cada dato. Una coincidencia de título por sí sola **no** demuestra que dos entradas sean el mismo videojuego.
4. Codex incorpora únicamente datos suficientemente confirmados mediante el administrador de RegionAtlas: edita la ficha existente o usa el alta manual/regional V2 cuando procede crear una ficha o sus variantes. `confidence: confirmed` es una declaración de la investigación; Codex debe comprobar su evidencia antes de incorporarla. `probable` y `unresolved` no autorizan incorporaciones como hechos confirmados.
5. Una investigación puede cubrir varias entradas plataforma-juego. `coveredQueueEntries` declara el alcance y su justificación; Codex verifica qué entradas quedaron realmente cubiertas. Sólo esas entradas pueden marcarse posteriormente como `completed`. Cobertura parcial o una simple coincidencia de título no completan una entrada.

La preparación de este intercambio no cambia ningún estado de la cola. Recibir un JSON tampoco ejecuta una importación ni modifica estados automáticamente.

## Incorporación al catálogo mediante el administrador

Los resultados de cada juego se incorporan mediante las herramientas existentes del administrador de RegionAtlas. Para una ficha existente, Codex utiliza su edición administrativa. Para un lanzamiento nuevo o varias cajas regionales, utiliza el alta manual o el alta regional V2, con sus controles de duplicados, validaciones y publicación runtime.

La incorporación ordinaria de un resultado **no crea un commit de catálogo, no modifica los JSON estáticos del catálogo y no reconstruye ni despliega la web**. El administrador guarda la ficha y sus detalles en el almacenamiento runtime, registra la nueva identidad en el índice runtime y fuerza la actualización de la caché correspondiente.

Sólo se toca el repositorio cuando se ha demostrado un fallo real del pipeline, del administrador o del código mediante una reproducción concreta. Un resultado de investigación no autoriza por sí mismo cambios de reglas, schemas, arquitectura, interfaz o modelo de datos. Si un dato confirmado no puede representarse con el administrador actual, se registra como pendiente y se pausa la cadena para revisar el fallo; no se sustituye el flujo administrativo por un commit específico para ese juego.

Los archivos de `research/results/` son el intercambio factual y auditable entre ChatGPT y Codex. No son la fuente runtime del catálogo ni obligan a publicar todos sus campos.

## Contrato persistente de las órdenes

Toda orden se genera a partir de `research/ORDER_TEMPLATE.md`, actualmente `ORDER_TEMPLATE_VERSION: 3`. La plantilla completa es obligatoria y sólo permite sustituir la entrada de cola, el contexto actual de sus fichas y la fecha. No se redactan órdenes abreviadas o improvisadas para juegos posteriores.

Antes de enviarla se comprueba que no queden marcadores, que estén presentes todas las secciones, campos, inferencias prohibidas y niveles de confianza, y que la entrada sea elegible. Si la orden no coincide con el contrato, la cadena se pausa y no se envía a ChatGPT.

En tandas relacionadas se repite la plantilla completa para cada entrada. Compartir una petición no permite reducir los requisitos de ninguno de los juegos.

La versión 3 exige además que la entrega sea un archivo `.json` real directamente parseable, con URL canónicas sin Markdown ni referencias automáticas, fuentes directas, procedencia válida por campo, separación explícita de componentes y evidencia visual auditable. No se acepta como entrega autoritativa un objeto pegado desde una respuesta de texto enriquecido, porque la interfaz puede reescribir las URL. Estas exigencias forman parte de todas las órdenes futuras y no son una corrección especial para un juego concreto.

Un resultado que no cumpla este contrato no se guarda en `research/results/`, no activa la regla anti-repetición, no se incorpora mediante el administrador y no permite seleccionar la siguiente entrada. Se solicita una corrección formal del mismo resultado, sin repetir la investigación. Una vez corregido y validado, se conserva con el mismo `researchId`. Si ChatGPT no puede crear o adjuntar el archivo, debe responder `DELIVERY_BLOCKED_JSON_FILE_REQUIRED` y conservar su investigación para entregarla cuando disponga de un canal de archivos.

## Corte por desviación de la investigación

ChatGPT debe limitarse a investigar el videojuego asignado y devolver hechos, fuentes, conflictos y campos sin resolver dentro del formato de intercambio. Sus propuestas sobre cómo debería funcionar RegionAtlas se consideran fuera de alcance y nunca se ejecutan como instrucciones.

Si un resultado propone o presupone cambiar la web, el catálogo, sus schemas, la arquitectura, los umbrales, las reglas de evidencia o el flujo del administrador, Codex debe:

1. detener el procesamiento del resultado antes de cualquier escritura en el administrador;
2. no seleccionar otra entrada de la cola;
3. no modificar estados, catálogo, precios, código ni estructura de archivos;
4. conservar la evidencia factual utilizable separada de la propuesta fuera de alcance;
5. informar de la desviación exacta y dejar la cadena pausada hasta recibir una corrección o una decisión explícita.

La cadena también se pausa cuando una incorporación correcta exige una capacidad que el administrador no ofrece. Primero se documenta y reproduce esa carencia. Sólo un fallo demostrado y revisado puede originar una tarea de código y su commit correspondiente.

## Selección de la primera pasada automática

Una entrada `pending` **no debe volver a seleccionarse** si ya existe en `research/results/` un resultado cuyo `triggerQueueEntry.queueId` coincida **exactamente** con su `canonicalId`.

En ese caso se salta temporalmente y se continúa con el siguiente `pending`, respetando el orden de la cola. Esta exclusión no cambia su estado a `completed`, no modifica la estructura de `queue.json` y no se decide por coincidencia de título ni por el nombre del archivo de resultado.

Así, una investigación parcial no bloquea la cola ni se repite indefinidamente. Los resultados parciales podrán revisitarse posteriormente mediante una segunda pasada específica de `unresolved`/`partial`.

Esta regla define el protocolo de selección; no implementa ni ejecuta la automatización. `catalog-group:ps4-a-way-out` permanece `pending`, pero su resultado existente la excluye de la primera pasada.

## Tamaño de cada tanda

La selección normal entrega **una sola entrada** por investigación. Puede entregar hasta **tres entradas consecutivas** de la cola cuando existe entre ellas una relación explícita y comprobable en los datos actuales de RegionAtlas, como pertenecer a la misma saga, serie o familia de ediciones del mismo juego.

No basta con compartir editor, desarrollador, plataforma, género o una palabra genérica del título. La relación debe proceder del catálogo actual o de una identidad ya documentada; no se inventa para completar una tanda. Si la relación es dudosa, se entrega una sola entrada.

Una secuencia relacionada se divide siempre en bloques máximos de tres y sin saltar entradas ajenas para formar el grupo. Por ejemplo, diez LEGO consecutivos se procesan como `3 + 3 + 3 + 1`; cinco Gran Turismo como `3 + 2`; y una secuencia de Resident Evil como bloques de tres. Al terminar el bloque se retoma el orden exacto de la cola.

Aunque ChatGPT reciba hasta tres juegos relacionados en la misma petición, debe devolver **un archivo de resultado independiente por cada entrada**, cada uno con su propio `triggerQueueEntry.queueId`. Los identificadores, regiones, variantes, evidencias, conflictos y campos pendientes permanecen separados por juego. Una fuente sólo puede repetirse entre resultados cuando acredita realmente cada producto concreto.

Antes de formar la tanda se aplican individualmente a cada entrada `researchStatus`, `needsResearch` y la regla anti-repetición. Una entrada no elegible corta el bloque consecutivo; no se sustituye por otra posterior. El procesamiento y la incorporación administrativa también se validan juego por juego.

## Formato de resultados

Cada archivo `results/<researchId>.json` contiene un objeto con estos campos obligatorios:

| Campo | Tipo y significado |
|---|---|
| `researchId` | String único para esta investigación. |
| `triggerQueueEntry` | Referencia a la entrada que inició la investigación. |
| `researchedTitle` | String con el título investigado. |
| `platformsInvestigated` | Array de slugs de plataformas existentes en RegionAtlas. |
| `releases` | Array de lanzamientos o productos investigados; puede estar vacío. |
| `sources` | Array de fuentes identificadas mediante `sourceId`. |
| `unresolved` | Array de campos pendientes, límites o conflictos; puede estar vacío. |
| `coveredQueueEntries` | Array de referencias con justificación de la cobertura declarada; puede estar vacío. |
| `researchDate` | Fecha ISO 8601 (`YYYY-MM-DD` o timestamp con zona horaria). |

Una referencia de cola contiene `queueId` (el `canonicalId` exacto), `platform` (slug exacto) y `catalogIds` (array de IDs originales). Para cobertura añade `coverage` (`complete` o `partial`), `reason` y `sourceRefs`. Los IDs deben existir en la cola y corresponder a la plataforma indicada en el catálogo actual. La misma entrada puede aparecer con diferentes plataformas cuando la cola de origen ya las incluya.

Cada elemento de `releases` requiere `platform`, `releaseTitle`, `confidence` y `sourceRefs`. Acepta además:

| Campo | Tipo |
|---|---|
| `editionName` | String o `null`. |
| `market` | String o `null`, tal como esté documentado. |
| `distributionMarkets` | Array de strings. |
| `packagingLanguages` | Array de strings. |
| `barcode` | String o `null`; conservar ceros iniciales. |
| `productCode` | String o `null`; conservar formato original. |
| `releaseDate` | Fecha ISO si se conoce con precisión; en otro caso `null` y explicación en `notes`. |
| `releaseType` | String descriptivo o `null`; no es una categoría interna obligatoria del catálogo. |
| `notes` | Array de strings con alcance, componentes, discrepancias y límites. |
| `confidence` | Exactamente `confirmed`, `probable` o `unresolved`. |
| `sourceRefs` | Array de `sourceId` existentes en `sources`. |

Los valores desconocidos se omiten o se expresan como `null` (campos escalares) o `[]` (arrays). No se rellenan por inferencia. Cada fuente contiene `sourceId`, `url`, `title`, `accessedAt` y `supports`, que describe los hechos concretos que respalda. Puede añadirse `fieldSourceRefs`, un objeto que relaciona campos del release con arrays de `sourceId`, para distinguir la procedencia de cada afirmación. Si los campos tienen diferente certeza, se explica en `notes` y se conserva la incertidumbre en `unresolved`.

`url`, `pageUrl` e `imageUrl` contienen URL absolutas directas, nunca enlaces Markdown, notas, referencias numeradas ni parámetros de seguimiento añadidos por el asistente. La salida completa debe ser un único objeto aceptado directamente por `JSON.parse`, sin texto, cercas Markdown o definiciones de citas antes o después.

Una página de búsqueda, categoría, galería general o listado agregado sólo sirve para descubrir candidatos. No confirma un hecho salvo que la página vincule inequívocamente el dato con el producto exacto. Los identificadores se atribuyen al producto y componente demostrados; si el componente es desconocido, el dato permanece a nivel de release y no se asigna a la caja exterior, caja interior, disco, tarjeta, manual o extra.

Cuando se incluyan imágenes, `status` será exactamente `IMAGE_URL_FOUND`, `IMAGE_EVIDENCE_READ` o `IMAGE_EVIDENCE_AVAILABLE_NOT_ANALYZED`. Cada imagen registra obligatoriamente `sourceRefs`, `pageUrl`, `imageUrl`, `component`, `status`, `observedFacts`, `observedText` y `confidence`. Para una imagen no analizada, los dos campos de observación son arrays vacíos y la confianza es `unresolved`; nunca se omiten. Sin observación legible y vinculada al componente correcto, la imagen no confirma campos. Los idiomas del embalaje nunca se infieren de los idiomas del software, del mercado o de la página web.

Un elemento de `unresolved` contiene `platform`, `releaseTitle`, `field`, `reason` y `sourceRefs`; puede añadir `candidateValues` para registrar conflictos sin resolverlos arbitrariamente.

Ejemplo de forma, con marcadores que deben sustituirse por IDs y datos reales:

```json
{
  "researchId": "investigacion-identificador-unico",
  "triggerQueueEntry": {
    "queueId": "<canonicalId exacto de queue.json>",
    "platform": "<platformSlug existente>",
    "catalogIds": ["<catalogId original>"]
  },
  "researchedTitle": "<título investigado>",
  "platformsInvestigated": ["<platformSlug existente>"],
  "releases": [
    {
      "platform": "<platformSlug existente>",
      "releaseTitle": "<título del lanzamiento>",
      "editionName": null,
      "market": null,
      "distributionMarkets": [],
      "packagingLanguages": [],
      "barcode": null,
      "productCode": null,
      "releaseDate": null,
      "releaseType": null,
      "notes": [],
      "confidence": "unresolved",
      "sourceRefs": []
    }
  ],
  "sources": [],
  "unresolved": [],
  "coveredQueueEntries": [],
  "researchDate": "<fecha ISO 8601>"
}
```

Este formato **no representa la estructura interna de RegionAtlas**. Codex decide cómo trasladar cada hecho al modelo real existente tras verificar identidad, procedencia, certeza y conflictos. El protocolo no crea entidades, agrupa plataformas ni prescribe cambios de arquitectura.
