# Catálogo físico v2: arquitectura y piloto Absolum PS5

Fecha de corte: 2026-09-12
Base Git: `565ed255a4e9bb12ccefc82cd8eac7d12225a997`

## Alcance

Esta fase añade una capa reversible para representar:

`Juego + plataforma -> gran región -> edición física -> variante coleccionable -> identidad de precio`

No migra masivamente el catálogo, no cambia IDs o URLs, no reescribe `PAL España`, no modifica collectors y no duplica compañías ni plataformas. Solo el guide v2 de Absolum activa la agrupación nueva; el resto del catálogo continúa en el lector legacy.

## Snapshot previo

- `data/catalog.json`: 81.425 filas y 81.425 IDs únicos.
- `data/index/companies.json`: 5.905 compañías.
- `data/catalog-edition-guides.json`: un guide schema v1.
- `data/catalog-owned-scans.json`: 25 sets de escaneos.
- Blob de catálogo, base y worktree: `52a2399c4960ac95c8e06f17aaadac93aed61b8b`.
- Blob de compañías, base y worktree: `662c9df4c433b0e1a66323f00179aa299b438e41`.

El piloto añade un guide v2 y un set de escaneos de la caja de Absolum Special Edition. `data/catalog.json` y `data/index/companies.json` conservan exactamente sus blobs de la base.

## Arquitectura encontrada

- `src/lib/catalog.ts` mantiene el catálogo y las identidades públicas.
- `src/lib/catalog-list-game.ts` genera el DTO rico de exploración; `src/lib/catalog-card-game.ts`, el DTO de tarjeta.
- `src/lib/catalog-filters.ts` concentra búsqueda, filtros y ordenación.
- `src/lib/public-catalog-initial-page.ts`, `/catalogo`, `/plataforma/[slug]` y sus dos APIs paginan el mismo modelo.
- `src/lib/price-display.ts` y `src/components/game-card.tsx` presentan condiciones y precios.
- `src/lib/catalog-edition-guides.ts` era un lector directo de un único formato y `CatalogEditionGuide` lo mostraba en detalle.
- `src/lib/catalog-owned-scans.ts` exige coincidencia exacta de ID, slug, plataforma, región y edición; los scans alimentan detalle y referencias sin propagarse por título.

También se revisaron los importadores de owned scans. Siguen escribiendo el registro legacy y no se modifican en esta fase.

## Diseño v2

`data/schemas/catalog-edition-guides-v2.schema.json` admite conjuntamente:

- guides v1 sin cambios;
- guides v2 con `game`, `physicalEditions`, `marketRegions`, `variants`, `sharedDiscs`, `evidence`, referencias a scans y relaciones de contenido.

El adaptador `catalog-edition-guides.ts` normaliza ambos formatos y valida en runtime:

- IDs de edición, variante, disco e identidad de precio únicos;
- `catalogId` público y perteneciente a la plataforma declarada;
- identidad exacta antes de enlazar una ficha;
- referencias existentes a edición, variante, disco, imagen, evidencia y scan set;
- códigos de mercado V2 únicos (`FR`, `ES`, `GB`, `DE`, `US`, `JP`, `KR`, `HK`, `TW`) y compatibles con la gran región declarada;
- procedencia explícita en imágenes v2.

`marketRegions` representa mercados geográficos reales mediante códigos de país y se mantiene separado de `packagingLanguages`: los idiomas impresos nunca crean por sí solos una bandera o un mercado nacional. Los nombres históricos `PAL España`, `PAL Francia`, `NTSC USA`, etc. permanecen exclusivamente en el catálogo legacy o en la traducción de compatibilidad para filtros y presentación. `broadRegion` continúa usando `EUROPE`, `NORTH_AMERICA` y `ASIA`.

Las evidencias fuertes para definir una variante física son `REAL_SCAN`, `REAL_PHOTO`, `UNBOXING_FRAME` y `RETAILER_PHOTO_CONFIRMED`. Assets, mockups, imágenes previas, documentación textual y confirmaciones se conservan con su tipo, pero no se convierten automáticamente en prueba visual.

## Compatibilidad y rollback

- Los guides v1 se adaptan en memoria al modelo común y conservan sus enlaces e imágenes.
- Solo `schemaVersion: 2` participa en la agrupación de listados.
- Agrupar elimina duplicados únicamente del DTO de exploración; no elimina filas del catálogo.
- Toda ficha enlazada mantiene su `catalogId`, slug y ruta directa.
- Retirar el guide v2 devuelve inmediatamente el listado legacy, sin migración inversa.
- Los scans se referencian por ID y no se duplican dentro del guide.

## Piloto Absolum PS5

El guide `absolum-ps5` contiene siete ediciones:

| Gran región | Edición | Identificador físico |
| --- | --- | --- |
| Europa | Standard EN/FR/ES, PEGI | EAN `5061078710678` |
| Europa | Standard DE, USK | EAN `5061078710661` |
| Europa | Special Edition, PEGI | EAN `5061078710685` |
| Norteamérica | Standard USA, ESRB | ficha legacy USA |
| Asia | Standard Japón, CERO | pendiente de EAN físico |
| Asia | Standard Corea, GRAC | pendiente de código físico |
| Asia | Standard Hong Kong/Taiwán | conjunta hasta evidencia de separación |

Las tres ediciones europeas apuntan al mismo `sharedDiscId`. La identidad común del disco fue confirmada físicamente por el propietario: incluye la Standard EN/FR/ES distribuida en Francia, Reino Unido y España, la Standard alemana y la Standard contenida en la Special. El guide registra `FR / ES / GB` para la primera caja y `DE` para la alemana. La Special conserva `broadRegion: EUROPE` y `marketRegions: []`: sus idiomas no se usan para inventar países de distribución no documentados. La capa pública la resume con `EU`, mientras su ficha legacy sigue siendo compatible con el filtro España.

La Special referencia la Standard EN/FR/ES mediante `includesEditionIds` y su ficha oficial documenta caja, juego Standard, mini artbook, cuatro pins, póster, cuatro tarjetas y banda sonora digital. Los scans propios acreditan por separado caja, EAN, PEGI, PPSA y lomo; no se usan para afirmar el contenido interior.

### Medidas de la caja Special

- ANCHO: 14,8 cm.
- ALTO: 22,3 cm.
- PROFUNDO: 3,2 cm.

Son estimaciones de los bordes del objeto en escaneos A4 a 300 ppp, con escala confirmada por el propietario. La anchura observada varía entre 148,1 y 148,9 mm y el lomo mide aproximadamente 31,6 mm. Algunos bordes coinciden con el límite del escaneo, por lo que no se presentan como medidas certificadas por el fabricante.

Como comparación se usa una caja de recambio compatible con PS5 documentada por Walvis Products: 13,5 cm de ancho, 17,0 cm de alto y 1,5 cm de profundidad. Por tanto, la caja de Absolum mide aproximadamente 1,3 cm más de ancho, 5,3 cm más de alto y 1,7 cm más de profundidad. Es una referencia comercial de formato, no una especificación oficial de Sony.

Las medidas ya obtenidas de Metal Gear Solid Delta Deluxe, The Coma: Recut Limited Edition, Touhou Luna Nights 5-Year Anniversary Limited Edition, Ninja Gaiden: Ragebound Special Edition y Blasphemous II Collector's Edition se conservan en `data/research/owned-scans/2026-09-12-pending-special-edition-measurements.json` como investigación preparada. Esta fase no las publica ni crea guides v2 para esas cajas, porque el piloto funcional autorizado se limita a Absolum. La portada de Blasphemous II queda bloqueada para publicación hasta repetir el escaneo con margen suficiente.

## Navegación, filtros y precios

- El catálogo y PS5 muestran dos familias: `Standard Edition` agrupa seis ediciones físicas y dos fichas legacy; `Special Edition` conserva su ficha y su única edición física.
- Una familia con cero o una edición usa terminología de edición y no presenta selector de variantes. Solo dos o más alternativas físicas activan la terminología y navegación de variantes.
- Con `Todas las regiones`, la tarjeta Standard resume `EU / US / JP / KR / HK / TW`; no hereda la bandera ES de su ficha legacy representativa.
- Con un filtro nacional, la misma raíz sigue siendo elegible por sus mercados documentados y muestra la bandera elegida. Los filtros `ES / FR / GB / DE / US / JP / KR / HK / TW` se resuelven mediante una traducción de compatibilidad, sin almacenar nombres PAL/NTSC en el guide V2.
- Dentro de la ficha, cada edición muestra sus mercados exactos: `FR / ES / UK` juntos, `DE` por separado y los mercados americanos y asiáticos en sus bloques.
- La cabecera de la Special muestra `EU`, no `ES`, porque solo está demostrada su gran región europea. El filtro legacy España sigue encontrando la ficha sin convertir ese dato de compatibilidad en un mercado V2 demostrado.
- El escaneo propio de la caja exterior es la portada principal de la ficha Special; la portada, contraportada y lomo continúan disponibles en su galería.
- La identidad pública, descripción, precio pendiente, FAQ, textos alternativos, metadata social y JSON-LD de una familia V2 se construyen desde su guide. La Special ya no hereda `PAL España` ni «mercado español» de su representante legacy; la Standard se describe como familia de Europa, Norteamérica y Asia.
- El slug y canonical legacy de ambas fichas permanecen sin cambios por compatibilidad.
- Los filtros `Gran región`, `Rating` y `Edición física` evalúan los hijos y devuelven una sola raíz.
- La búsqueda incluye EAN, referencias, mercados, idiomas, ratings y marcas de variantes.
- Para el grupo óptico se muestran únicamente `Completo` y `Precintado`; si hay varios valores, se muestra rango. No se inventan precios.
- Un fixture conceptual de Resident Evil 4 demuestra que SIAE/no-SIAE comparte edición, caja, EAN y disco, pero conserva dos `priceIdentity`.

## Evidencia y fuentes

- Escaneos propios: `data/catalog-owned-scans.json` y manifiesto SHA-256 `data/research/owned-scans/2026-09-12-absolum-special-edition-assets.json`.
- Contenido oficial: Silver Lining Direct y Tesura Games.
- Comparación de caja estándar: Walvis Products, referencia 900737.
- Los datos asiáticos sin identificador confirmado quedan vacíos; no se completan por heurística.
- La UI pública no expone los bloques técnicos `Evidencia y procedencia` ni `Imágenes de referencia y fuentes`. Los datos y URLs de evidencia continúan conservados internamente.
- Los enlaces públicos de referencia apuntan a la raíz del sitio fuente, no a productos concretos. Los accesos comerciales de eBay permanecen en el buscador afiliado contextual de la ficha.

## QA visual

Se comprobaron `/catalogo?q=Absolum`, `/catalogo?q=Absolum&region=PAL%20Espa%C3%B1a`, `/plataforma/ps5?q=Absolum`, la ficha Standard PAL España, la ficha Special PAL España y la ficha USA. Todas respondieron `200`. Los filtros de los nueve mercados (`ES / FR / GB / DE / US / JP / KR / HK / TW`) seleccionaron las familias esperadas; el filtro España conservó también la Special por compatibilidad con su ficha legacy. El estado sin filtro mostró `EU / US / JP / KR / HK / TW`. La ficha Standard mostró `FR / ES / UK`, `DE`, `US`, `JP`, `KR`, `HK` y `TW` en sus ediciones correspondientes.

La QA final sobre el build de producción local verificó la ficha Special a 1440 x 900 y 390 x 844. La cabecera mostró `EU`, la portada principal resolvió al WebP del escaneo propio, y la ficha mostró `1 edición física`, `Precio de esta edición` y `Añadir a mi colección`, sin selector de variantes. `documentElement.scrollWidth` coincidió con el viewport en ambos tamaños; no hubo imágenes rotas, enlaces a artículos concretos de eBay, errores ni avisos de consola. Los dos bloques técnicos retirados tampoco estaban presentes en el DOM. El saneamiento posterior comprobó además que `<title>`, descripción, Open Graph, Twitter, JSON-LD, FAQ, bloque de precio y alt de portada ya no presentan la Special como española, y que la metadata de Standard representa la familia multirregional completa.

## Riesgos y deuda explícita

- Esta fase no añade un editor Admin para guides v2.
- Las ediciones asiáticas sin ficha legacy no tienen aún URL individual; viven dentro de la ficha agrupada.
- `priceIdentity` prepara cotizaciones por variante, pero los collectors aún no publican precios en ese nivel.
- El estado de colección y los anuncios siguen ligados a `catalogId`; su agregación por todas las ediciones deberá diseñarse antes de migrar familias de forma masiva.
- Los filtros nuevos son útiles para el piloto; su cobertura seguirá siendo parcial mientras el resto continúe en v1.
- No se infieren países de distribución a partir de idioma, tienda, vendedor o capacidad de envío.

## Controles de aceptación

- JSON y schema parseables: PASS.
- Pruebas específicas v1/v2, scans, evidencia, disco compartido, códigos de mercado, los nueve filtros nacionales, URLs, precios ópticos y SIAE: 12/12 PASS.
- Suite unitaria completa: PASS, incluidas 264/264 pruebas principales y todas las suites previas/posteriores.
- `typecheck`: PASS.
- Lint: PASS, 0 errores y 34 avisos preexistentes.
- Build Next.js: PASS, 139 rutas estáticas generadas.
- QA visual móvil/escritorio de catálogo, plataforma PS5, ficha Standard y ficha Special: PASS.
- Comparación final de blobs y conteos contra la base: PASS.

No se autoriza una migración masiva, fusión ni despliegue como parte de esta fase.
