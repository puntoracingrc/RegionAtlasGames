# Plantilla maestra de orden de investigación

`ORDER_TEMPLATE_VERSION: 1`

Esta plantilla se envía completa para cada entrada. Sólo se sustituyen los bloques delimitados por `{{...}}`. No se resumen, eliminan ni suavizan requisitos entre juegos. En una tanda relacionada se genera una orden completa por entrada y ChatGPT devuelve un JSON independiente por cada una.

---

## ORDEN PARA CHATGPT

Investiga exclusivamente la entrada de RegionAtlas incluida a continuación.

### Entrada asignada

```json
{{QUEUE_ENTRY_JSON}}
```

### Contexto actual de las fichas

```json
{{CURRENT_CATALOG_CONTEXT_JSON}}
```

Los nombres, regiones, códigos, seeds e identificadores internos anteriores describen el estado actual de RegionAtlas. No son prueba externa. Debes verificarlos de forma independiente y registrar cualquier conflicto.

### Objetivo obligatorio

Determina la identidad exacta del videojuego y localiza todos sus lanzamientos físicos regionales documentables para la plataforma asignada. Sólo investiga otra plataforma activa de RegionAtlas cuando una fuente demuestre que corresponde exactamente a la misma obra; mantenla separada de la plataforma inicial.

Para completar la ficha busca siempre:

1. título oficial exacto;
2. título original y títulos alternativos o regionales;
3. desarrollador;
4. editor general y editor o distribuidor regional;
5. saga o serie;
6. géneros;
7. número de jugadores y modos de juego;
8. soporte físico, tipo de producto y número de discos o tarjetas;
9. fecha general y fechas regionales;
10. todas las ediciones físicas encontradas: Standard, Limited, Collector, budget, promotional, bundles y otras;
11. país o mercado de cada producto físico;
12. EAN, UPC, JAN u otro código de barras;
13. seriales, códigos de producto y códigos de caja;
14. clasificación por edades;
15. idiomas impresos en el embalaje;
16. idiomas del software, separados del embalaje;
17. contenido incluido de fábrica;
18. caja exterior, caja interior, disco o tarjeta, manual y extras, manteniendo separado cada componente;
19. descargas, códigos o contenido no incluido en el soporte, cuando corresponda;
20. conflictos con RegionAtlas y campos que sigan sin prueba suficiente.

### Separaciones obligatorias

Nunca mezcles:

- plataformas distintas;
- lanzamiento nativo y retrocompatibilidad;
- edición estándar, limitada, coleccionista, budget o promocional;
- caja exterior e interior;
- juego, disco o tarjeta, manual y extras;
- código de barras, serial, código de producto y código de caja;
- idiomas del software e idiomas impresos en el embalaje;
- mercado de una caja y país donde apareció un anuncio.

Cada identificador debe quedar vinculado al juego, plataforma, edición y componente concretos que la fuente demuestra.

### Inferencias prohibidas

No confirmes una región, mercado, edición, idioma o identidad utilizando solamente:

- ubicación del vendedor;
- idioma del anuncio o de la web;
- prefijo del código de barras;
- PEGI, ESRB, CERO u otra clasificación;
- PAL, NTSC o NTSC-J;
- compatibilidad con otra consola;
- parecido del título;
- slug, ID, seed o región interna de RegionAtlas;
- una fotografía, miniatura o texto que no puedas leer con claridad.

Una tienda en un país acredita como máximo circulación comercial, salvo que la fuente identifique expresamente el mercado o la distribución del producto.

### Seguimiento de identificadores

Cuando encuentres un EAN, UPC, JAN, serial o código candidato, realiza búsquedas exactas para verificar:

- título;
- plataforma;
- edición;
- mercado;
- componente físico al que pertenece.

No confirmes un identificador por checksum, coincidencia parcial o repetición entre páginas que copian el mismo dato.

### Fuentes y procedencia

Prioriza:

1. fabricante, editor o distribuidor oficial;
2. catálogos oficiales o históricos;
3. bases técnicas especializadas;
4. bibliotecas, archivos y registros de preservación;
5. retailers nacionales con metadata estructurada;
6. listings específicos con identificadores o descripciones verificables.

Para cada dato conserva la URL directa, el nombre de la fuente, la fecha de acceso, el campo que acredita y el producto o componente al que corresponde. Un agregador genérico o una descripción de vendedor no bastan como única prueba de un identificador físico.

Si una fuente está bloqueada, no responde o carece de metadata útil, regístralo como limitación técnica. Nunca lo conviertas en prueba de ausencia.

### Imágenes

Puedes conservar URLs de imágenes encontradas. Si no puedes inspeccionarlas o leerlas con claridad, usa exactamente `IMAGE_EVIDENCE_AVAILABLE_NOT_ANALYZED`. No inventes códigos, idiomas, región, componentes ni contenido físico a partir de una miniatura o imagen ilegible.

### Confianza

- `confirmed`: la evidencia vincula claramente el dato con el juego, plataforma, edición, mercado y componente correctos.
- `probable`: existe un candidato sólido, pero falta corroboración o vinculación física suficiente.
- `unresolved`: falta prueba suficiente o existe un conflicto abierto.

La etiqueta `confirmed` del contexto o de una fuente secundaria nunca sustituye tu comprobación de la evidencia.

### Acciones prohibidas y pausa

No investigues precios. No modifiques GitHub, RegionAtlas, la cola, el catálogo ni ningún archivo. No propongas cambios en la web, schemas, arquitectura, interfaz, administrador, umbrales ni reglas de RegionAtlas.

Si consideras necesario alguno de esos cambios, detén la investigación y descríbelo en `unresolved`. Devuelve hechos y fuentes; Codex decide cómo aplicar los resultados mediante el administrador.

### Formato obligatorio de salida

Devuelve únicamente un objeto JSON válido, sin texto antes o después. Debe respetar el formato de intercambio de `research/README.md` e incluir como mínimo:

- `researchId`;
- `triggerQueueEntry` con `queueId`, `platform` y `catalogIds` exactos;
- `researchedTitle`;
- `platformsInvestigated`;
- `gameFacts` con procedencia y confianza por campo;
- `releases`, con un elemento por cada producto físico diferente;
- `sources`;
- `images` cuando existan;
- `conflicts`;
- `unresolved`;
- `coveredQueueEntries`;
- `researchDate`.

Cada release debe separar, cuando existan:

- `platform`;
- `releaseTitle`;
- `editionName`;
- `market`;
- `distributionMarkets`;
- `packagingLanguages`;
- `softwareLanguages`;
- `barcode`;
- `productCode`;
- `serial`;
- `releaseDate`;
- `releaseType`;
- `ratingSystem`;
- `regionalPublisher`;
- `regionalDistributor`;
- `physicalContents`;
- `components`;
- `notes`;
- `confidence`;
- `sourceRefs`;
- `fieldSourceRefs`.

Los valores desconocidos se expresan como `null`, `[]` o `unresolved`; nunca se completan por deducción. No marques ni solicites marcar la entrada como `completed`. Codex decidirá la cobertura después de validar las fuentes y publicar los datos confirmados mediante el administrador.

Fecha de investigación: `{{RESEARCH_DATE}}`.

---

## Comprobación previa al envío

La orden no se envía si:

- queda algún marcador `{{...}}` sin sustituir;
- falta alguna sección de esta plantilla;
- se ha reducido la lista de campos;
- se ha eliminado una inferencia prohibida;
- se ha relajado la definición de `confirmed`;
- se permite modificar RegionAtlas o decidir su arquitectura;
- la entrada no cumple las reglas de selección y anti-repetición.

Ante cualquiera de esos casos, la cadena pasa a `PAUSED`.
