# Protocolo de intercambio de investigación

Las rutas `/research/queue.json` y `/research/results/` son relativas a la raíz de este repositorio. Son archivos locales de intercambio; no son endpoints web.

## Cola e identificación

`queue.json` es una copia íntegra de `artifacts/research-queue/regionatlas-game-research-queue.json`. Conserva orden, estructura, prioridades, estados e identificadores originales. El ID de entrada de cola es su `canonicalId`; no se crea otro ID. `catalogIds` identifica las fichas originales y `platforms` conserva las plataformas registradas.

La cola de origen ya contiene ocho entradas con varias plataformas. Se conservan tal cual, sin realizar nuevas agrupaciones. En cada referencia de intercambio se especifican además la plataforma y los `catalogIds` concretos a los que corresponden los hallazgos. Los IDs derivados de la exportación no equivalen necesariamente a una entidad canónica persistida del catálogo.

## Flujo

1. ChatGPT toma una entrada `pending` como punto de partida. Puede investigar el mismo videojuego en otras plataformas que formen parte actualmente de RegionAtlas.
2. ChatGPT devuelve datos factuales y fuentes en un archivo JSON dentro de `results/`, identificado por `researchId`. ChatGPT no decide cómo se estructura el catálogo.
3. Codex interpreta el resultado usando la estructura actual de RegionAtlas e identifica las fichas existentes a las que corresponde cada dato. Una coincidencia de título por sí sola **no** demuestra que dos entradas sean el mismo videojuego.
4. Codex incorpora únicamente datos suficientemente confirmados, evita duplicados e informa de conflictos. `confidence: confirmed` es una declaración de la investigación; Codex debe comprobar su evidencia antes de incorporarla. `probable` y `unresolved` no autorizan incorporaciones como hechos confirmados.
5. Una investigación puede cubrir varias entradas plataforma-juego. `coveredQueueEntries` declara el alcance y su justificación; Codex verifica qué entradas quedaron realmente cubiertas. Sólo esas entradas pueden marcarse posteriormente como `completed`. Cobertura parcial o una simple coincidencia de título no completan una entrada.

La preparación de este intercambio no cambia ningún estado de la cola. Recibir un JSON tampoco ejecuta una importación ni modifica estados automáticamente.

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
