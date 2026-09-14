# Region Atlas: mapa funcional y de datos del catálogo físico V2

Fecha de corte: 2026-09-14
Estado: arquitectura general implementada como capa aditiva y activada en todo el catálogo público.

## 1. Qué resuelve la V2

La V2 separa conceptos que el catálogo legacy mezclaba dentro de una sola fila:

1. El videojuego como obra y sus datos editoriales comunes.
2. La plataforma en la que se publica.
3. La familia comercial, por ejemplo Standard Edition o Special Edition.
4. La edición física concreta, diferenciada por caja, mercado, códigos y contenido.
5. La variante coleccionable, solo cuando una misma edición física tiene una diferencia menor demostrable.
6. El soporte compartido, cuando distintas cajas contienen exactamente el mismo disco o cartucho.
7. La identidad de precio, que permite que dos variantes visuales tengan cotizaciones independientes.

La jerarquía conceptual es:

```text
Videojuego lógico + plataforma
|
+-- Detalles comunes del juego
|   +-- descripción, fecha, jugadores, soporte, géneros y facetas
|   +-- compañías y personas acreditadas
|   +-- sagas, franquicias y relaciones con otras obras
|   +-- premios de la obra
|
+-- Familia de edición: Standard Edition
|   +-- Edición física: Europa EN/FR/ES
|   |   +-- mercados FR, ES y GB
|   |   +-- packaging EN/FR/ES, PEGI, EAN e imágenes
|   |   +-- sharedDiscId -> disco europeo
|   |   +-- variantes coleccionables, si existen
|   +-- Edición física: Europa DE
|   +-- Edición física: Norteamérica US
|   +-- Ediciones físicas: JP, KR y HK/TW
|
+-- Familia de edición: Special Edition
    +-- Edición física: Europa
        +-- caja, medidas, contenido, códigos y escaneos
        +-- incluye la Standard EN/FR/ES
        +-- sharedDiscId -> el mismo disco europeo
```

Una familia no es una región y una región no es una variante. Cada capa responde a una pregunta distinta.

## 2. Entidades y almacenamiento

| Entidad | Identidad | Dónde se guarda | Qué representa |
| --- | --- | --- | --- |
| Fila de catálogo legacy | `CatalogGame.id` o `catalogId` | `data/catalog.json` | Una referencia pública histórica con plataforma, región legacy, URL, portada y precios. |
| Detalles comunes | clave `catalogId` canónico | `data/game-details.json` | La información editorial del videojuego que comparten las familias V2. |
| Guide V2 | `guide.id` | `data/catalog-edition-guides.json` | La raíz que une juego, plataforma, familias, ediciones físicas, discos, imágenes y evidencia. |
| Guide V2 derivado | `catalog-derived-{catalogId}` | Construido en ejecución desde fichas públicas | Agrupa filas regionales existentes sin fabricar datos físicos que esas filas no contengan. |
| Familia de edición | `editionFamily.id` dentro del guide | `data/catalog-edition-guides.json` | Agrupa ediciones físicas que pertenecen a la misma oferta comercial, como Standard o Special. |
| Edición física | `physicalEdition.id` dentro del guide | `data/catalog-edition-guides.json` | Una caja física concreta con identidad regional, contenido y códigos propios. |
| Variante coleccionable | `variant.id` dentro de una edición física | `data/catalog-edition-guides.json` | Una diferencia menor dentro de la misma edición: pegatina, marca, precinto o señal física equivalente. |
| Disco o soporte compartido | `sharedDisc.id` | `data/catalog-edition-guides.json` | Declara que varias cajas contienen el mismo soporte físico. |
| Escaneos propios | `scanSetId`, hoy normalmente un `catalogId` | `data/catalog-owned-scans.json` | Portada, contraportada, lomo, disco y otros escaneos del mismo ejemplar revisado. |
| Precios | campos de precio de `CatalogGame` | `data/catalog.json` y capas de actualización | Valores por estado y procedencia asociados todavía a una fila legacy. |
| Identidad de obra editorial | `workKey` | `data/index/catalog-work-identities.json` | Une fichas regionales auditadas cuando premios u otros datos pertenecen a la misma obra. |
| Compañía | `company.slug` | `data/index/companies.json` y `data/company-profiles.json` | Entidad canónica, créditos, perfil, relaciones corporativas, logo e historia. |
| Persona | `person.slug` | `data/research/person-study/public.json` | Perfil editorial, relaciones laborales, créditos exactos, premios y fuentes. |
| Saga o subserie | `series.slug` | `data/index/series.json` y overlay Admin/Blob | Agrupación ordenada de juegos con página pública propia. |
| Franquicia | `franchise.id` y `franchise.slug` | `data/franchise-system/*.json` | Universo o propiedad intelectual que puede contener varias sagas y juegos. |
| Premios | IDs de serie, edición, categoría y resultado | `data/research/award-study/public.json` | Premios y nominaciones vinculados a obras, compañías o personas mediante relaciones verificadas. |

El schema formal del guide está en `data/schemas/catalog-edition-guides-v2.schema.json`. El lector y validador de ejecución es `src/lib/catalog-edition-guides.ts`.

## 3. Juego lógico y fila legacy

El bloque `game` del guide V2 contiene:

- `title`: título común.
- `platformSlug`: plataforma.
- `canonicalCatalogId`: fila de catálogo usada para obtener los detalles comunes.

Esto no elimina las filas legacy. Las mantiene como puentes para URLs, portadas, precios, colección y compatibilidad con importadores existentes.

`CatalogGame` sigue guardando, entre otros datos:

- ID, slug, título, plataforma, región y edición legacy.
- estado de publicación y tipo material.
- portada y referencias PriceCharting.
- contenido original y señales de packaging regional cuando existen.
- precios por estado, transporte, total a España, divisa, fecha y procedencia.
- identificadores y referencias de fuentes comerciales.

La agrupación V2 ocurre al construir el DTO público del catálogo. No borra registros: oculta las filas miembro en el listado y presenta una sola tarjeta por familia. Los guides documentales conservan datos físicos ricos; para el resto del catálogo se construye un guide derivado a partir de `workId` resuelto o, cuando no existe, del mismo título normalizado y plataforma. Una identidad de obra resuelta siempre tiene prioridad sobre el título. Cuando un título y plataforma tienen un único `workId` resuelto, las fichas hermanas que todavía no lo tienen pueden incorporarse a esa obra. Si existen varios `workId` posibles, permanecen separadas hasta resolver la ambigüedad.

## 4. Detalles comunes del videojuego

`GameDetails`, guardado en `data/game-details.json`, puede contener:

- año y fecha de lanzamiento;
- número de jugadores y soporte, por ejemplo Disco Blu-ray;
- referencia y EAN cuando pertenecen a ese registro;
- desarrolladora y publicadora legacy;
- créditos tipados de compañías;
- créditos individuales de personas;
- géneros, subgéneros, facetas, etiquetas y saga;
- descripción editorial;
- metadatos SEO, preguntas frecuentes y destacados;
- vídeos oficiales;
- fuentes generales y procedencia por campo.

Cada crédito de compañía incluye el rol, la entidad canónica y su evidencia. Los roles admitidos actualmente son:

`developer`, `originalDeveloper`, `portDeveloper`, `remasterDeveloper`, `publisher`, `originalPublisher`, `regionalPublisher`, `digitalPublisher` y `physicalPublisherOrDistributor`.

Cada dato sensible puede conservar fuente, URLs de evidencia, resumen, fecha de revisión y lote. La V2 hereda estos detalles desde `canonicalCatalogId`, evitando copiar la misma descripción o los mismos créditos a cada caja regional.

## 5. Familias de edición

Una `CatalogEditionFamily` guarda:

- `id` y `label`;
- `representativeCatalogId`, usado como puente con la ficha pública legacy;
- `physicalEditionIds`, que define exactamente qué cajas pertenecen a la familia;
- `priceConditions`, que limita los estados de precio válidos para esa familia.

Reglas públicas:

- Una familia con una sola edición física se presenta como una edición, no como una variante.
- Dos o más ediciones físicas activan navegación entre variantes regionales.
- El representante legacy no impone su país a toda la familia.
- Título, metadata y banderas se calculan desde la familia y sus ediciones V2.

Ejemplo: Absolum Standard usa una fila española como representante, pero públicamente es una familia de Europa, Norteamérica y Asia. Absolum Special tiene una sola edición europea y por eso no se etiqueta como variante ni como española.

## 6. Ediciones físicas

Una `CatalogPhysicalEdition` puede guardar:

- `id`, etiqueta y tipo: Standard, Special, Collector, Deluxe, Limited, Steelbook u otra;
- `broadRegion`: `EUROPE`, `NORTH_AMERICA`, `ASIA` u `OTHER`;
- `marketRegions`: mercados nacionales realmente documentados;
- `packagingLanguages`: idiomas impresos en caja;
- `ratingSystems`: PEGI, USK, ESRB, CERO, GRAC u otros;
- `barcode`, `catalogNumber`, `serial` y `boxCode`;
- medidas exteriores y comparación de tamaño;
- contenido físico y contenido digital;
- `sharedDiscId`;
- filas legacy relacionadas mediante `catalogIds`;
- escaneos, imágenes, evidencia y notas;
- ediciones, variantes o filas de catálogo incluidas en el producto;
- variantes coleccionables internas.

Una edición física es la unidad correcta para añadir a colección, deseados o venta. Si el usuario la posee, toda su fila se resalta en verde.

## 7. Regiones, mercados e idiomas

La V2 separa tres dimensiones:

| Campo | Responde a | Ejemplo |
| --- | --- | --- |
| `broadRegion` | En qué gran zona se encuadra la edición | `EUROPE` |
| `marketRegions` | En qué mercados físicos está documentada | `FR`, `ES`, `GB` |
| `packagingLanguages` | Qué idiomas aparecen impresos | `EN`, `FR`, `ES` |

Un idioma no demuestra un mercado. Una tienda que envía internacionalmente tampoco demuestra distribución nacional.

El registro V2 admite 56 mercados. Cada edición solo publica los códigos que estén guardados explícitamente o se correspondan de forma inequívoca con su región legacy; no completa países a partir de idiomas, tiendas o proximidad geográfica. Los nombres `PAL España`, `NTSC USA` y equivalentes se conservan como traducción de compatibilidad con filtros y registros legacy.

En la interfaz:

- la cabecera resume las grandes regiones o mercados de la familia;
- cada insignia superior enlaza con su bloque regional;
- cada edición muestra sus banderas nacionales exactas;
- los bloques usan una superficie y guía cromática distinta para Europa, Norteamérica y Asia;
- el catálogo sin filtro muestra todas las regiones de la familia;
- un filtro nacional encuentra la familia si cualquiera de sus ediciones pertenece a ese mercado.

## 8. Variantes coleccionables

Una variante coleccionable solo existe si hay una diferencia física dentro de la misma edición. Puede guardar:

- etiqueta;
- pegatinas y marcas;
- EAN o código de caja propios;
- notas y evidencia;
- escaneos concretos;
- `priceIdentity` independiente.

No se crea una variante porque exista una sola Special Edition. Tampoco se separan variantes por idioma supuesto o por una fotografía insuficiente.

Absolum no tiene actualmente variantes coleccionables internas. Tiene siete ediciones físicas repartidas entre dos familias.

## 9. Discos y soportes compartidos

`CatalogSharedDisc` guarda hoy:

- ID y etiqueta;
- región técnica opcional;
- serial opcional;
- sistemas de clasificación impresos;
- evidencia que demuestra la identidad compartida.

Cada edición enlaza el disco mediante `sharedDiscId`. Así se puede afirmar que dos cajas son distintas sin duplicar o confundir el contenido óptico.

El modelo actual no guarda aún una ficha técnica completa del disco con todos sus idiomas jugables, versión de build, hashes o matriz. Esos datos requerirían ampliar `CatalogSharedDisc`; no deben colocarse de forma improvisada en la caja.

## 10. Imágenes, escaneos y evidencia

Las imágenes de una edición pueden proceder de:

- escaneo real;
- fotografía real;
- fotograma de unboxing;
- fotografía de tienda confirmada;
- asset de tienda o editor;
- mockup o imagen previa;
- documentación editorial;
- confirmación del propietario;
- evidencia aún sin clasificar.

Solo el escaneo, la fotografía, el unboxing y la fotografía comercial confirmada pueden definir por sí mismos una diferencia visual fuerte.

Los `scanSetIds` apuntan a `data/catalog-owned-scans.json`, donde cada set exige identidad exacta de plataforma, slug, región y edición. El guide no duplica esos archivos.

En la ficha, las imágenes de la edición aparecen en el visor principal. Las flechas recorren solo las fotos de esa identidad física; al pulsar se abre una galería superpuesta con navegación, zoom y cierre. La evidencia y sus URLs se conservan internamente, pero no se muestra un bloque técnico redundante al usuario.

## 11. Precios

La familia decide qué estados son válidos mediante `priceConditions`:

- `sealed`: precintado;
- `newRetail`: nuevo en tienda;
- `complete`: completo;
- `gameManual`: juego y manual;
- `loose`: suelto.

La Special Edition de Absolum permite solo precintada, nueva en tienda y completa. No admite suelto ni juego y manual, porque esos estados describirían el juego Standard contenido y no el conjunto Special.

Estado actual de la conexión:

- el selector grande recorre las ediciones físicas de la familia en una banda horizontal estable;
- cada tarjeta conserva su región y banderas;
- el panel muestra valor por estado, transporte y total cuando existen;
- bajo cada portada se resumen Precintado y Completo para esa edición;
- la tarjeta de catálogo agrega únicamente rangos Precintado y Completo;
- si no hay datos, aparece Precio pendiente sin inventar una cifra;
- los importes continúan naciendo en la fila `CatalogGame` relacionada;
- `priceIdentity` está preparado para variantes menores, pero los collectors todavía no publican precios a ese nivel.

## 12. Colección, deseados y venta

Las acciones están situadas dentro de cada edición física:

- Añadir a mi colección.
- Añadir a deseados.
- Vender uno como este.

Compartir sigue siendo una acción de la ficha completa.

La identidad depende del origen de la edición:

- Una edición física documental que distingue varias cajas bajo un mismo registro combina `catalogId` y `physicalVariantId`.
- Una edición derivada de una ficha regional existente conserva únicamente su `catalogId`; no crea una segunda identidad coleccionable.

Los registros antiguos sin `physicalVariantId` continúan resolviéndose por `catalogId`.

Esta compatibilidad permite distinguir, por ejemplo, la Standard alemana de la EN/FR/ES en colección y deseados, sin duplicar las identidades regionales que ya existían antes de V2.

## 13. eBay y Amazon

Para familias V2, eBay ofrece España como mercado comercial predeterminado y añade los mercados documentados de la familia. España en este selector solo dirige la búsqueda de anuncios y no demuestra que una caja se distribuyese en España. La selección se resuelve en este orden:

1. Región solicitada desde el filtro del catálogo mediante `?ebayRegion=`.
2. Mercado exacto de la edición actual, si solo tiene uno.
3. España.
4. Primera opción disponible.

La búsqueda usa la fila legacy vinculada cuando existe y conserva la identidad física seleccionada. Si no hay anuncios de esa región, la capa de ofertas puede degradar a resultados disponibles en lugar de dejar el panel vacío.

Amazon continúa usando Amazon España y la búsqueda contextual del juego. No se ha extendido todavía a otros programas regionales.

## 14. Descripción y SEO

La descripción editorial se guarda en `data/game-details.json`, dentro de `GameDetails.description`. `descriptionMeta` conserva cómo y cuándo se obtuvo o generó y qué referencia se usó.

En una ficha V2:

- el bloque visible Descripción muestra la descripción común del juego;
- la identidad física de la familia genera título, descripción contextual y texto alternativo para metadata;
- Open Graph, Twitter y JSON-LD usan esa identidad pública y no la región legacy del representante;
- `seoMeta` puede aportar textos editoriales específicos cuando no existe identidad V2;
- las FAQ que contradicen los mercados V2 se descartan.

La descripción del videojuego y la descripción de la edición física son conceptos distintos. La primera explica qué juego es; la segunda se expresa mediante familia, región, contenido, códigos e imágenes.

## 15. Compañías

Los créditos del juego viven en `GameDetails.companyCredits`. Cada crédito relaciona:

```text
Juego -> rol -> compañía canónica -> procedencia
```

La entidad canónica se resuelve en `data/index/companies.json`; el perfil enriquecido vive en `data/company-profiles.json`. Puede incluir web, logo, años de actividad, estado, matriz, adquisiciones, fusiones, predecesoras, sucesoras, historia, SEO y fuentes.

En la ficha del juego, cada grupo se muestra con su etiqueta funcional y enlaza a `/compania/{slug}`. La ficha de compañía puede mostrar catálogo por rol, personas relacionadas, sagas, franquicias y premios directos o de juegos desarrollados/publicados.

Absolum acredita actualmente a Dotemu, Guard Crush Games y Supamonks como desarrolladoras; Dotemu como publicadora; y Silver Lining Interactive como responsable de publicación o distribución física.

## 16. Personas

Las personas tienen un sistema editorial independiente en `data/research/person-study/public.json`. Puede guardar:

- identidad, alias, nombres nativos y datos biográficos;
- ocupaciones, formación, campos de trabajo y trayectoria;
- relaciones verificadas con compañías y periodos;
- puestos;
- créditos exactos y obras relacionadas no equivalentes a un crédito;
- premios, curiosidades, retrato, fuentes y procedencia por afirmación.

La ficha de persona usa `/persona/{slug}` y muestra biografía, cronología, compañías, créditos, obras, premios y fuentes cuando existen.

En `GameDetails.individualCredits` el juego puede enlazar una persona con un rol y su procedencia. El tipo público de la ficha de juego admite hoy solo `developer`, y la página muestra esos nombres como Desarrollo individual. Actualmente esos nombres no son enlaces a la ficha de persona; ampliar roles y enlazarlos es una mejora posterior separada.

## 17. Sagas, franquicias y relaciones

Region Atlas distingue:

- Saga o subserie: agrupación concreta y ordenada de títulos, publicada en `/saga/{slug}`.
- Franquicia: universo o propiedad intelectual más amplia, publicada en `/franquicia/{slug}`.

La pertenencia a saga puede venir del índice `data/index/series.json`, de `GameDetails.series` o del overlay de administración. La página de la saga muestra su descripción, imagen de fondo, juegos y compañías relacionadas.

El sistema de franquicias conserva:

- franquicias en borrador o publicadas;
- relación saga-franquicia, con principal o relacionada;
- relación juego-franquicia directa, heredada de saga o ambas;
- rol del juego: principal, spin-off, historia paralela o crossover;
- exclusiones editoriales para falsos positivos;
- relaciones entre juegos, sagas y franquicias.

Las relaciones tipadas incluyen secuela, precuela, spin-off, remake, remaster, reboot, crossover, derivación, expansión, sucesor, padre, subserie y compilación.

En la ficha del juego aparecen chips enlazados de Saga y Franquicia, el rol dentro de la franquicia y un bloque de relaciones cuando existen. Absolum no tiene hoy saga ni franquicia documentada; no se crea una agrupación artificial para un único título.

## 18. Premios

Los premios no pertenecen a una caja regional. Se relacionan con la obra mediante `workKey`, que puede unir varias filas regionales auditadas.

El dataset público guarda:

- organizaciones o series de premios;
- ediciones anuales;
- categorías;
- resultados y tipo: ganador, nominado, finalista o reconocimiento;
- destinatarios: juego, persona o compañía;
- enlaces verificados entre obra, persona y compañía;
- fuentes oficiales.

La ficha del juego muestra Premios y reconocimientos entre Descripción y Detalles del juego solo si existen resultados para la obra. Las fichas de persona y compañía presentan sus relaciones específicas. La UI aclara que el premio corresponde a la obra, no a esa edición comercial.

## 19. Orden de presentación de una ficha V2

La composición pública actual es:

1. Cabecera con plataforma, regiones enlazables, estado de precio, título y familia.
2. Portada principal de la ficha y acción global Compartir.
3. Buscador comercial con eBay regional y Amazon España.
4. Selector horizontal de precios por edición física.
5. Navegación entre familias, si existen varias.
6. Bloques de gran región.
7. Ediciones físicas con galería, mercados, idiomas, rating, códigos, precios resumidos y acciones de colección.
8. Relaciones comerciales o contenido incluido, si existen.
9. Datos de colección del usuario y ventas verificadas, si proceden.
10. Vídeos oficiales, descripción, premios, detalles del juego, FAQ y similares.

La UI omite bloques internos de evidencia, fuentes técnicas, código de lomo duplicado y contadores que no aportan contexto.

## 20. Absolum como ejemplo actual

```text
Guide: absolum-ps5
Juego canónico: ps5-absolum
Plataforma: PS5

Familia Standard Edition
+-- Europa EN/FR/ES: FR + ES + GB, PEGI, EAN 5061078710678
+-- Europa DE: DE, USK, EAN 5061078710661
+-- Norteamérica: US, ESRB
+-- Asia: JP, CERO
+-- Asia: KR, GRAC
+-- Asia: HK + TW

Familia Special Edition
+-- Europa: sin mercado nacional confirmado, PEGI, EAN 5061078710685
    +-- PPSA-28311, código de caja 8710685
    +-- 14,8 x 22,3 x 3,2 cm aproximados
    +-- incluye la Standard EN/FR/ES y extras físicos/digitales

Disco compartido
+-- Standard EN/FR/ES
+-- Standard DE
+-- Standard incluida en Special

Variantes coleccionables internas: 0
```

La Standard tiene seis ediciones físicas. La Special tiene una. Entre ambas suman siete ediciones y un disco europeo compartido documentado.

## 21. Qué es general y qué sigue necesitando documentación rica

| Área | Estado |
| --- | --- |
| Schema, tipos, validación y adaptación V1/V2 | General y reutilizable. |
| Familias, ediciones, mercados, idiomas, ratings, discos, evidencia e inclusiones | General y reutilizable. |
| Agrupación de catálogo, filtros y búsqueda V2 | General para todas las fichas públicas, incluidas las publicadas en el overlay del worker. |
| Galería, regiones, precios y acciones por edición | Componentes generales. |
| Compañías, personas, sagas, franquicias y premios | Sistemas generales ya existentes y compartidos por fichas V2 y legacy. |
| Datos físicos completos | Solo aparecen cuando existe evidencia documental; Absolum y Assassin's Creed PS3 tienen guides enriquecidos. El resto parte de sus filas de catálogo. |
| Editor Admin de guides V2 | No implementado. |
| URLs individuales de ediciones sin fila legacy | No se inventan. Cada ficha regional real mantiene su URL; una edición puramente documental se muestra dentro de su familia. |
| Precio por `priceIdentity` de variante menor | Modelado, pero no alimentado por collectors. |
| Identidad de colección | `catalogId` para fichas regionales existentes; `catalogId + physicalVariantId` para cajas documentales que comparten ficha técnica. |
| Disco con idiomas, build, hash o matriz técnica | No modelado todavía. |
| Roles individuales distintos de desarrollador en la ficha | Pendiente de ampliación tipada y auditada. |

## 22. Reglas que deben mantenerse al ampliar el catálogo

1. No deducir mercados de los idiomas de la caja.
2. No presentar como variante una familia que solo tiene una edición física.
3. No duplicar como caja distinta un disco compartido.
4. No atribuir premios a una región o edición comercial.
5. No copiar detalles comunes a cada variante regional.
6. No inventar códigos, EAN, contenidos, compañías, personas o sagas.
7. Mantener la procedencia por campo y por evidencia.
8. Usar la edición física como unidad de colección, deseados, venta e imágenes.
9. Restringir estados de precio según el tipo de familia.
10. Validar cada nuevo guide documental; en relaciones derivadas, usar solo fichas públicas e identidades inequívocas.

## 23. Resumen corto

La V2 convierte una ficha que antes parecía una sola copia regional en un árbol explícito:

```text
obra -> plataforma -> familia -> edición física -> variante coleccionable
                                  |
                                  +-> disco compartido
                                  +-> códigos, contenido, medidas, imágenes y evidencia
                                  +-> precio, colección, deseados y venta
```

Descripción, fecha, géneros, compañías, personas, sagas, franquicias y premios pertenecen al videojuego o a su grafo editorial. Caja, mercado, idiomas impresos, rating, códigos, contenido, escaneos y medidas pertenecen a la edición física. Una pegatina o marca menor pertenece a una variante coleccionable. Esta separación es la base para extender la V2 sin tratar todos los juegos como si tuvieran la misma estructura que Absolum.

## 24. Flujo del worker de eBay desde esta versión

```text
hallazgo del worker
-> candidato o revisión pendiente
-> comprobación editorial y de identidad
-> ficha regional publicada
-> evidencia utilizable por V2
-> agrupación con su obra, plataforma y familia
```

- Un candidato pendiente no confirma una región y permanece aislado.
- Una ficha con `listingStatus: listed` puede documentar una nueva región.
- Si tiene un `workId` resuelto, V2 exige esa identidad; no la sustituye por una coincidencia de título.
- Si una ficha hermana todavía no tiene `workId` y solo existe una obra resuelta con el mismo título normalizado y plataforma, se incorpora a esa obra y a su familia de edición correspondiente.
- Si el mismo título y plataforma tienen varios `workId` resueltos, las fichas no resueltas permanecen aisladas.
- Si todavía no existe ningún `workId`, solo se agrupan título normalizado, plataforma y familia de edición coincidentes.
- La publicación caliente en Blob aparece en su ficha, en la página de plataforma y en el catálogo y buscador globales.
- Varias regiones nuevas publicadas en el mismo overlay se agrupan entre sí sin esperar al siguiente archivo estático.
- Cada región conserva URL, portada, precios, colección, deseados y venta propios.
- El worker no inventa idiomas, ratings, códigos, contenido, personas, compañías, sagas ni premios. Esos datos necesitan su evidencia y almacenamiento correspondientes.
