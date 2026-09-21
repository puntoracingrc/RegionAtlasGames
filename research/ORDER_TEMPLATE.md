# Plantilla maestra de orden de investigación

`ORDER_TEMPLATE_VERSION: 2`

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

Un identificador puede quedar confirmado a nivel de producto aunque el componente físico exacto siga sin resolverse. En ese caso se conserva en el release y el componente se declara `unknown`; nunca se inventa que pertenece a la caja exterior, caja interior, disco o tarjeta.

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

Mantén separados:

- código comercial o de fabricante del producto;
- serial impreso en disco o tarjeta;
- serial interno del soporte;
- código de la caja;
- código de un bonus, manual o accesorio;
- pegatina o referencia interna del retailer.

La coincidencia de dos valores no permite fusionar sus tipos ni sus componentes.

### Fuentes y procedencia

Prioriza:

1. fabricante, editor o distribuidor oficial;
2. catálogos oficiales o históricos;
3. bases técnicas especializadas;
4. bibliotecas, archivos y registros de preservación;
5. retailers nacionales con metadata estructurada;
6. listings específicos con identificadores o descripciones verificables.

Para cada dato conserva la URL directa, el nombre de la fuente, la fecha de acceso, el campo que acredita y el producto o componente al que corresponde. Un agregador genérico o una descripción de vendedor no bastan como única prueba de un identificador físico.

Cada fuente debe apuntar a la página exacta que contiene la evidencia. Una portada de buscador, página de resultados, galería general, categoría, perfil o listado agregado puede servir para descubrir una pista, pero no para confirmar por sí sola un hecho del producto. Si no existe una URL directa, registra la pista como `probable` o `unresolved`.

En `sources[].url`, `images[].pageUrl` e `images[].imageUrl` escribe exclusivamente la URL absoluta canónica que empieza por `https://` o `http://`. No uses enlaces Markdown como `[URL](URL)`, referencias `[1]`, parámetros de seguimiento añadidos por ChatGPT ni texto alrededor de la URL.

Todo campo `confirmed` necesita al menos una fuente primaria, técnica o física directa que demuestre exactamente el dato, o dos fuentes secundarias independientes que lo corroboren sin copiarse entre sí. La fuente debe demostrar además el título, plataforma, edición, mercado y componente necesarios para evitar atribuciones cruzadas.

Si una fuente está bloqueada, no responde o carece de metadata útil, regístralo como limitación técnica. Nunca lo conviertas en prueba de ausencia.

### Imágenes

Puedes conservar URLs de imágenes encontradas. Cada elemento de `images` debe incluir:

- `sourceId`;
- `pageUrl`;
- `imageUrl`;
- `component`;
- `status`;
- `observedFacts`;
- `observedText`;
- `confidence`.

`status` sólo puede ser:

- `IMAGE_URL_FOUND`: se localizó la URL, sin usar su contenido como evidencia;
- `IMAGE_EVIDENCE_READ`: se inspeccionó una imagen legible y se registró exactamente lo observado;
- `IMAGE_EVIDENCE_AVAILABLE_NOT_ANALYZED`: la imagen podría contener evidencia, pero no fue analizada o no es suficientemente legible.

No uses `ANALYZED` como estado genérico. Para `IMAGE_EVIDENCE_READ`, `observedFacts` debe identificar el hecho visible y el componente observado; `observedText` debe contener únicamente el texto realmente legible relevante. Si esos campos están vacíos, la imagen no puede confirmar ningún dato.

No inventes códigos, idiomas, región, componentes ni contenido físico a partir de una miniatura o imagen ilegible. Una imagen de caja interior no acredita la caja exterior, y una fotografía del disco no acredita el código de barras del producto completo.

`packagingLanguages` sólo puede confirmarse mediante metadata que describa expresamente los idiomas del embalaje o mediante texto legible del componente físico correcto registrado como `IMAGE_EVIDENCE_READ`. No lo deduzcas del idioma del software, del sitio web, del mercado, del título ni de que el producto sea japonés.

### Confianza

- `confirmed`: la evidencia vincula claramente el dato con el juego, plataforma, edición, mercado y componente correctos.
- `probable`: existe un candidato sólido, pero falta corroboración o vinculación física suficiente.
- `unresolved`: falta prueba suficiente o existe un conflicto abierto.

La etiqueta `confirmed` del contexto o de una fuente secundaria nunca sustituye tu comprobación de la evidencia.

### Acciones prohibidas y pausa

No investigues precios. No modifiques GitHub, RegionAtlas, la cola, el catálogo ni ningún archivo. No propongas cambios en la web, schemas, arquitectura, interfaz, administrador, umbrales ni reglas de RegionAtlas.

Si consideras necesario alguno de esos cambios, detén la investigación y descríbelo en `unresolved`. Devuelve hechos y fuentes; Codex decide cómo aplicar los resultados mediante el administrador.

### Formato obligatorio de salida

La entrega autoritativa debe ser un único archivo JSON cuyo nombre sea `<researchId>.json`. Si la interfaz no permite crear o adjuntar el archivo, devuelve únicamente su contenido como un objeto JSON válido. No uses bloque Markdown, cercas de código, comentarios, introducciones, conclusiones, citas automáticas ni definiciones de referencias después del cierre `}`.

El contenido completo debe poder procesarse con `JSON.parse` sin limpiar, recortar ni transformar nada. Debe respetar el formato de intercambio de `research/README.md` e incluir como mínimo:

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

Cada elemento de `sources` debe incluir exactamente una identidad estable mediante `sourceId`, además de `url`, `title`, `accessedAt` y `supports`. `supports` describe en texto qué campos concretos acredita la página, pero no debe contener citas Markdown como `([Fuente][1])`. Todos los valores usados en `sourceRefs` y `fieldSourceRefs` deben coincidir exactamente con un `sourceId` existente.

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

Antes de entregar el resultado, valida obligatoriamente:

1. que todo el contenido sea un solo JSON parseable;
2. que no exista ningún carácter fuera del objeto raíz;
3. que todas las URL sean URL directas sin Markdown ni tracking;
4. que cada `sourceRef` exista;
5. que cada `confirmed` esté demostrado por sus fuentes;
6. que cada identificador esté ligado al producto y componente correctos;
7. que `packagingLanguages` y `softwareLanguages` no se hayan mezclado;
8. que toda evidencia visual cumpla el formato y los estados anteriores;
9. que una página genérica no se haya usado como confirmación;
10. que los IDs de cola y catálogo sean exactamente los recibidos.

Si falla cualquiera de estas comprobaciones, corrige la entrega antes de devolverla. No sustituyas la corrección formal por una nueva investigación.

Fecha de investigación: `{{RESEARCH_DATE}}`.

---

## Comprobación previa al envío

La orden no se envía si:

- queda algún marcador `{{...}}` sin sustituir;
- falta alguna sección de esta plantilla;
- se ha reducido la lista de campos;
- se ha eliminado una inferencia prohibida;
- se ha relajado la definición de `confirmed`;
- faltan las reglas de URL directa, evidencia visual o vinculación por componente;
- la salida no exige ser parseable directamente y sin referencias externas;
- se permite modificar RegionAtlas o decidir su arquitectura;
- la entrada no cumple las reglas de selección y anti-repetición.

Ante cualquiera de esos casos, la cadena pasa a `PAUSED`.
