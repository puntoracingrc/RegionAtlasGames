# A Way Out — revisión e incorporación del resultado externo

Fecha: 2026-09-20. Entrada: `research/results/a-way-out-2026-09-20.json`.
Base local: `f3f25892`; los tres archivos de catálogo comparados con `origin/main` (`518da0da`) eran idénticos antes de importar.
Ámbito: únicamente A Way Out. Sin imágenes, OCR, Vision, precios, despliegue ni escrituras en el catálogo remoto.

## Catálogo actual y decisiones

La consulta pública de `/api/catalog/platform/ps4?q=A%20Way%20Out&includePending=1` devolvió un grupo con `ps4-a-way-out` y `ps4-usa-a-way-out`. Xbox One devolvió cero resultados. La consulta incluye el overlay: su precio español actual difiere del JSON estático; no se copia ni modifica ninguno de los dos precios.

Ya existían ambas fichas de PS4, sus IDs/rutas, año 2018, fecha 23/03/2018, cooperación para dos jugadores, desarrollador/editor, portadas y precios. Se conservan las diferencias editoriales históricas entre ambas fichas.

| Ficha | Antes | Incorporación validada |
|---|---|---|
| `ps4-a-way-out` | CUSA-07919; EAN vacío | CUSA-08004; EAN 5030931122767; Blu-ray |
| `ps4-usa-a-way-out` | CUSA-07919; EAN vacío | CUSA-07995; UPC 014633739138; Blu-ray |
| `xboxone-usa-a-way-out` | No existía | Ficha nativa Xbox One USA; UPC 014633739152; lanzamiento 23/03/2018; dos jugadores; Hazelight Studios / Electronic Arts; Blu-ray |

La nueva ficha carece intencionadamente de precio, portada, referencia de disco y enlaces PriceCharting. El MPN comercial 7391501601 se guarda como `productCodes` en su edición física, no como serial de disco. Se actualizan los índices y contadores derivados existentes.

Se incorporan dos guías V2 al archivo existente: doce variantes PS4 y seis Xbox One. Se reutilizan las fichas PS4 existentes y se crea una única ficha representativa Xbox One, no dieciocho duplicados. Cada barcode queda ligado a su plataforma, variante y fuentes. Las guías no certifican contenido completo del disco ni exhaustividad mundial. Las variantes con una única fuente útil se conservan con confianza HIGH, nunca CONFIRMED_PHYSICAL_COPY.

## Conflicto CUSA

La asignación anterior de CUSA-07919 a ambas fichas procede de SerialStation con `matchMethod: title`. Esa asociación de título no prueba una edición comercial concreta. Se conserva íntegra en `sources.serialstation` como antecedente, pero `fieldSources.reference` pasa a `research`.

- España: la fila física Spanish de GameFAQs vincula **5030931122767 → CUSA-08004 → 106327301601**; Fnac España corrobora el EAN y la plataforma. No se traslada un CUSA desde una fila digital.
- USA: la fila física US y la descripción textual de J&L vinculan **014633739138 → CUSA-07995**.
- CUSA-07919 no se declara inexistente: se rechaza su asociación no demostrada a estas dos cajas. Su asociación física exacta continúa sin determinar.
- Las páginas completas de SerialStation no fueron accesibles (403); no se contabilizan como nueva corroboración. La corrección se sostiene en las fuentes anteriores, no en un snippet aislado.

Al integrar la guía apareció un defecto de presentación previo: los detalles compartidos de una guía V2 podían transferir el EAN/CUSA canónico a otra ficha regional sin escaneos propios. La corrección mínima en `catalog-runtime-overlay.ts` conserva el contenido editorial compartido, toma los identificadores de la ficha regional y mantiene la prioridad de escaneos propios. No cambia schemas, arquitectura ni datos de otros juegos. Se añade prueba de regresión.

## Validación de fuentes y alcance

La tabla completa de [GameFAQs](https://gamefaqs.gamespot.com/ps4/211217-a-way-out/data) contiene secciones PC, PS4 y Xbox One. Se verificó la sección y fila física de cada identificador: se excluyen PC, filas digitales y Japón TBA. El acceso directo a su URL Xbox no fue la prueba utilizada; sí la sección Xbox de la tabla completa accesible.

| Fuente textual consultada | Qué acredita | Qué no acredita |
|---|---|---|
| [EA, lanzamiento](https://news.ea.com/press-releases/press-releases-details/2018/Experience-a-Daring-Story-Driven-Adventure-With-a-Friend-in-A-Way-Out-Available-Worldwide-Today/default.aspx) | Fecha mundial, PS4/Xbox One, Hazelight, EA, cooperación | Barcode o embalaje regional |
| [Fnac ES](https://www.fnac.es/A-Way-Out-PS4-Videojuego-PS4/a1441211) | PS4, EAN español, fecha | Idioma físico de caja |
| [RF Generation](https://www.rfgeneration.com/cgi-bin/getinfo.pl?ID=E-215-S-10010-A) | UK, PS4, EAN, CUSA, Blu-ray | Idioma físico de caja |
| [Smartoys BE](https://www.smartoys.be/catalog/jeux-video-playstation-way-out-p-5030932122766.html?language=fr) | EAN PS4 y circulación BE | Distribución oficial FR/BE ni idioma impreso |
| [Rebuy DE](https://www.rebuy.de/i%2C10923779/playstation-4/a-way-out) | EAN PS4, fecha, Blu-ray | Idioma impreso |
| [Gamefinity PL](https://gamefinity.pl/produkt/a-way-out-pl-ps4) | EAN PS4; declaración explícita de cubierta polaca | Inspección de un ejemplar |
| [WOG CH](https://www.wog.ch/en/index.cfm/details/product/61973-A-Way-Out) | EAN PS4; packaging DE/FR/IT declarado separadamente del software | Inspección de un ejemplar |
| [Elgiganten DK](https://www.elgiganten.dk/product/gaming/spil/a-way-out-ps4/PS4AWAYOUT), [Elkjop NO](https://www.elkjop.no/product/gaming/spill/a-way-out-ps4/PS4AWAYOUT), [Elgiganten SE](https://www.elgiganten.se/product/gaming/spel/a-way-out-ps4/PS4AWAYOUT) | EAN nórdico 5030938122760, referencia comercial 1063270, circulación DK/NO/SE | CUSA-08004, Finlandia o distribución nacional exclusiva |
| [J&L PS4](https://www.jnlgame.com/products/a-way-out-playstation-4-pre-owned) | Producto físico USA, UPC y CUSA-07995 | Idioma de embalaje; su dato de un jugador no se importa frente a EA |
| [Xande Brasil](https://www.xandealendagames.com.br/a-way-out-ps4-novo) | PS4 físico, origen Brasil declarado, EAN | CUSA ni idiomas de embalaje; subtítulos no equivalen a caja |
| [J&L Xbox One](https://www.jnlgame.com/products/a-way-out-xb1-xbox-one) | Producto físico USA y UPC | Serial del disco o idioma de caja |
| [Fnac FR Xbox](https://www.fnac.com/a11299290/A-Way-Out-Xbox-One-Jeu-video-Xbox-One) | Xbox One, EAN, circulación francesa | Distribución belga ni idiomas de caja |
| [Xbox oficial](https://www.xbox.com/en-ca/games/store/a-way-out/bwvbncmf22zk) | Plataforma original y compatibilidad Xbox Series | Lanzamiento físico nativo Xbox Series |

Canadá, Australia y Asia conservan sólo los campos de sus filas físicas específicas en GameFAQs; no se suplanta una segunda corroboración fallida. DBox, Finna, Arena y SerialStation bloqueados/no accesibles; CeX sin metadatos útiles; otros comercios sin corroboración útil no se cuentan como soporte. El texto de Allegro sobre cubierta polaca de Xbox queda como indicio de vendedor, no como embalaje confirmado. PlayStation Store no acredita CUSA de copias físicas canadienses o brasileñas.

## Datos rechazados o pendientes

- No se importa masivamente `confidence: confirmed`: se valida campo por campo. Los valores probable/unresolved no ascienden a hechos.
- No se importan los idiomas de caja de España, UK, Alemania, USA, variantes French/Dutch o Xbox polaco. Sólo se incorporan las declaraciones explícitas PS4 de Gamefinity PL y WOG CH, con `basis: DECLARED`, sin exhaustividad ni lectura visual.
- No se importan los `distributionMarkets` externos: no se verificó una declaración de fabricante/distribuidor. Circulación comercial queda en `evidenceMarkets`.
- Se retienen sin confirmar el CUSA del EAN nórdico, CUSA de Canadá/Brasil, Finlandia y países concretos de la variante asiática. No se inventan códigos a partir de la familia europea/americana.
- Los identificadores comerciales brasileños adicionales no corroborados se excluyen.
- No se crea Xbox Series. No se crea un SKU español Xbox One a partir de un SKU europeo genérico o una noticia previa al lanzamiento.
- Japón TBA y no encontrar ediciones especiales/promocionales no prueban su inexistencia.

## Cobertura de cola

`catalog-group:ps4-a-way-out` queda **parcialmente cubierta**: se han incorporado los identificadores y las variantes documentadas, pero faltan comprobaciones regionales/de embalaje. Sus fichas son `ps4-a-way-out` y `ps4-usa-a-way-out`. La cola original indicaba `missingBarcodeCount: 2` y `missingPackagingLanguageCount: 2`: se resuelven ambos códigos de barras, pero los idiomas de las dos cajas siguen pendientes. No se exige demostrar la inexistencia de toda posible variante mundial para completar esta entrada.

El `completed` propuesto en el resultado externo no se acepta automáticamente. **Entradas completamente cubiertas: 0.** `research/queue.json` permanece idéntico, con estado `pending`. La nueva ficha Xbox One no tenía entrada en esa cola; no se añade ni marca otra entrada. El resultado externo original también permanece intacto.

## Validaciones

Validación final local, 21/09/2026:

- `npm run test:unit`: PASS, incluidos pretest y posttest; 301 pruebas físicas (seis nuevas), 282 unitarias principales y todas las suites encadenadas.
- `npm run test:scanner`: PASS, 64 pruebas.
- `npm run test:published-price-views`: PASS, 62 pruebas.
- `npm run browse:indexes:check`: PASS. Índices de búsqueda/filtros, fichas y compañías actualizados por los generadores existentes.
- `npm run lint`: PASS, 0 errores; 32 advertencias previas fuera de esta importación. Lint específico de los archivos editados: PASS.
- `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck`: PASS. El intento con el límite por defecto de 4 GB agotó memoria; no se modificó la configuración del proyecto.
- `npm run build`: PASS, 296 páginas estáticas. Primer intento rechazó el enlace local de dependencias; se sustituyó únicamente ese enlace creado por esta tarea por una instalación local `npm ci` con el mismo lockfile.
- `node scripts/verify-a-way-out-research-import.mjs`: PASS. Conserva exactamente las 81.461 fichas previas, 50.604 detalles ajenos, todos los precios, la cola, el resultado original y los escaneos. Resultado en `preservation.json`.
- `git diff --check`: PASS.

Los registros de hashes protegidos de compañías/personas incluyen una nueva entrada de auditoría con hashes anteriores y posteriores, sin reescribir las entradas históricas. La prueba de expansión del catálogo conserva los hashes anteriores y admite únicamente la ficha adicional documentada.

Detalle por variante y campos aceptados/retenidos: `decisions.json`. No se ejecutó ninguna escritura remota, push, PR, merge ni despliegue. Rama local: `codex/research-a-way-out-import`. Se conserva el worktree porque el cambio no está fusionado y su publicación queda pendiente de revisión.

## Revisión del commit ae3c8af3 y cierre de la primera prueba

Clasificación de los archivos auxiliares del commit, sin modificar los datos ya validados:

| Archivo | Clasificación | Motivo |
|---|---|---|
| `data/meta.json` | Regeneración derivada esperada | Incrementos de una ficha listada, total y con detalles, y contador Xbox One. No se recalculan datos históricos ajenos. |
| `package.json` | Necesaria | Registra las seis regresiones de A Way Out en la suite física que ejecuta `test:unit`; sin cambios de dependencias. |
| `data/research/company-study/manifest.json` | Necesaria | Actualiza los hashes protegidos de detalles/índice de compañías e incorpora un registro before/after. Conserva todos los registros históricos. |
| `data/research/person-study/manifest.json` | Necesaria | Ese estudio protege los mismos dos archivos globales: registra el cambio autorizado sin alterar biografías ni investigación de personas. |
| `src/lib/company-research.test.ts` | Necesaria | Añade el identificador de esta importación a la secuencia esperada de auditorías; mantiene las verificaciones de hashes. |
| `src/lib/person-research.test.ts` | Necesaria | Misma actualización de la secuencia de auditoría, sin relajar las verificaciones de personas. |
| `src/lib/catalog-physical-editions-v2.test.ts` | Necesaria | Admite exactamente la ficha Xbox One adicional y sigue exigiendo las 32 anteriores y sus hashes de preservación. |
| `src/lib/catalog-runtime-overlay.ts` | Necesaria | Evita transferir CUSA/EAN de la ficha principal española a la estadounidense al compartir guía; mantiene los escaneos propios prioritarios. No modifica datos persistidos de otros juegos. |
| `data/index/companies.json` | Regeneración derivada esperada | Añade exclusivamente la ficha Xbox One a Hazelight Studios/Electronic Arts y ajusta sus contadores. |
| `data/index/catalog-browse-index.json.gz` | Regeneración derivada esperada | Publica en el índice existente las guías y la nueva ficha. |
| `data/index/catalog-card-lookup.json.gz` | Regeneración derivada esperada | Incorpora la nueva identidad al índice de fichas. |
| `data/index/catalog-editorial-filter-index.json.gz` | Regeneración derivada esperada | Refleja los identificadores y la ficha añadida en búsqueda/filtros. |
| `data/index/company-browse-index.json.gz` | Regeneración derivada esperada | Refleja los enlaces y contadores de las dos compañías. |
| `scripts/verify-a-way-out-research-import.mjs` | Necesaria | Auditoría reproducible contra la base: bloquea cambios en otros juegos, precios, cola y resultado original. No es un importador automático. |
| `artifacts/research-import/a-way-out-2026-09-20/README.md` | Necesaria | Informe de fuentes, conflictos, alcance, validación y revisión solicitada. |
| `artifacts/research-import/a-way-out-2026-09-20/decisions.json` | Necesaria | Trazabilidad por variante y campo, incluidos datos retenidos. |
| `artifacts/research-import/a-way-out-2026-09-20/preservation.json` | Necesaria | Evidencia de preservación y hashes anteriores/posteriores. |

No se detectaron modificaciones incidentales/prescindibles en el commit; no se retira ninguna. `data/catalog.json`, `data/game-details.json`, `data/catalog-edition-guides.json` y `src/lib/catalog-a-way-out-research.test.ts` son los datos y pruebas directos de A Way Out.

El cierre añade únicamente la regla anti-repetición a `research/README.md` y esta revisión al informe. La regla compara exactamente `triggerQueueEntry.queueId` con `canonicalId`, salta los resultados ya existentes en la primera pasada y reserva los parciales para otra pasada específica. No ejecuta la cola ni cambia su formato o sus estados.

Revalidación de cierre, 21/09/2026: todos los comandos terminaron con código 0.

- `npm run test:unit`: PASS (850 pruebas sumando pretest, suite principal y posttest).
- `npm run test:scanner`: PASS (64).
- `npm run test:published-price-views`: PASS (62).
- `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck`: PASS.
- `npm run build`: PASS (296 páginas estáticas), incluidos los generadores habituales de índices/detalles; no produjeron cambios adicionales en archivos versionados.
- `npm run lint`: PASS (0 errores, 32 advertencias existentes).
- `node scripts/verify-a-way-out-research-import.mjs`: PASS; 81.461 fichas previas y 50.604 detalles ajenos preservados, 0 cambios de precios y 0 cambios de estados de cola.
- Comprobación de selección: el resultado de A Way Out coincide exactamente con su `canonicalId`; la entrada permanece `pending`. El texto documenta expresamente la segunda pasada `unresolved`/`partial`.
- `git diff ae3c8af3 -- data src scripts package.json`: vacío. No se alteró ningún dato ni código validado durante este cierre.
- `git diff --check`: PASS.

El diff acumulado frente a `f3f25892` contiene 22 archivos: los 21 del commit revisado (enumerados arriba) más `research/README.md`. El nuevo commit de cierre modifica sólo los dos README. No se procesó otro juego, no se cambió la estructura de la cola y no se hizo push, merge ni despliegue. El worktree se conserva al estar pendiente de fusión/publicación autorizada.
