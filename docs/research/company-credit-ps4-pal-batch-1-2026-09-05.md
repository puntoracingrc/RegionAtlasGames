# Lote verificado de creditos de companias de PS4 PAL

Fecha de revision: 5 de septiembre de 2026

## Alcance cerrado

- Plataforma y region: PlayStation 4, PAL Espana.
- Snapshot de investigacion: `e6e0d88793e5ac0a6d5ea4b3bfb665427f90abfa`.
- Base final de aplicacion: `2ab671e1e974ef627434edd2ab3d2a2aec2e7468`.
- Paquete fuente: `RegionAtlas_PS4_PAL_investigacion_companias_2026-09-05.zip`.
- SHA-256 del paquete: `b19148e273b952d18854623b4b4f07f85b6b07277d4917a0d0bea0899082a081`.
- CSV autorizado: `data/research/company-credit-ps4-pal-batch-1.csv`.
- SHA-256 del CSV original del paquete: `6e8b53dc470258b2625f6a9a82523d1ef67731a0f617a8a9dbc2418b278c4192`.
- SHA-256 de la copia reproducible con finales LF: `aeeccf9f3d007fcc7cf772c25f947513f8ac12bf6e1ac8fbe7109a6ab15f6ecc`.
- Informe estructurado: `data/research/company-credit-ps4-pal-batch-1-report.json`.

No se importo ningun dato de los CSV de propuestas, identificadores, conteos o revision. El CSV autorizado se conserva con los mismos 53 registros y valores; solo se normalizaron sus finales de linea de CRLF a LF. El CSV de propuestas se uso solamente para comprobar que no existia una compania competidora con confianza `HIGH` o `VERY_HIGH` para ninguno de los 53 campos singulares.

## Dry-run

| Control | Resultado |
| --- | ---: |
| Filas listas | 53 |
| Filas `STALE_INPUT` | 0 |
| `ADD_MISSING` | 48 |
| `REPLACE_OR_ADD_VERIFIED` | 5 |
| Fichas afectadas | 49 |
| Creditos de desarrolladora | 49 |
| Creditos de publisher/distribuidor fisico PAL | 4 |
| Candidatos competidores `HIGH/VERY_HIGH` | 0 |
| Diferencias respecto al contrato esperado | 0 |
| Archivos del manifiesto comprobados | 34 |
| Controles semanticos del paquete | 21/21 |

Se normalizaron entidades HTML exclusivamente para comparar los titulos de control (`&#39;` y `&amp;`). Los IDs, la region, la edicion y los valores previos se compararon sin normalizacion ni aproximaciones.

## Aplicacion

Las 53 mutaciones quedaron aplicadas con `source=official`, URL de evidencia, resumen, fecha de revision y lote en `fieldProvenance`. Las cinco sustituciones conservaron su objeto anterior completo en el informe antes/despues.

Los ocho IDs que no tenian objeto en `data/game-details.json` recibieron un registro con los valores neutros del esquema y exclusivamente sus creditos autorizados. No se creo ninguna ficha de catalogo ni ninguna compania.

| Control | Antes | Despues |
| --- | ---: | ---: |
| Fichas de catalogo | 73.104 | 73.104 |
| IDs unicos | 73.104 | 73.104 |
| Companias | 4.326 | 4.326 |
| Objetos de detalle | 32.255 | 32.263 |

`main` avanzo durante la preparacion por una actualizacion de precios eBay. El lote se rebaso sin conflictos y sus 53 precondiciones se evaluaron individualmente contra la nueva base: 53 `WOULD_APPLY`, 0 `STALE_INPUT`. `git range-diff` confirmo que el commit funcional previo y el rebasado eran equivalentes.

`data/catalog.json` conserva el mismo SHA-256 antes y despues del lote sobre la base final: `461eb63430f82153c8685c3acce937ffa26912efa37bd34d88ad2e93a6a62704`. Por tanto, esta PR no cambia IDs, URLs, titulos, regiones, ediciones, portadas ni precios.

La referencia previa `namco-bandai-entertainment` de `One Piece World Seeker` ya era un slug huerfano en el indice. La sustitucion de su campo `developer` por Ganbarion no crea ni repara lateralmente esa entidad; su publisher permanece intacto.

La primera comprobacion de Preview detecto que el Blob de publicacion en caliente contenia objetos de detalle anteriores al lote y sustituia por completo los detalles estaticos del despliegue. Por ello las paginas de compania ya reflejaban los indices corregidos, pero algunas fichas seguian ocultando sus nuevos creditos. La lectura publica combina ahora exclusivamente los campos `developer` y `publisher` cuando el valor estatico tiene procedencia completa y el overlay carece de procedencia equivalente, tiene una revision anterior o deja el campo vacio. Un valor de runtime con procedencia completa y una revision igual o posterior conserva prioridad; la fecha global del overlay no se usa como evidencia de un credito y ningun otro campo se modifica.

Para que esta garantia no dependa de una peticion HTTP interna ni cargue los 41 MB de `data/game-details.json`, el despliegue incluye `data/index/verified-company-credits.json`: un derivado reproducible de 68 KB con 63 fichas y 72 campos que ya tenian procedencia completa. El generador no decide creditos; solo copia los valores, fuentes y evidencias ya aceptados, y el test exige igualdad exacta con `data/game-details.json`. Si Preview no puede leer sus assets publicos protegidos y tampoco dispone del JSON completo en el bundle, este indice aporta un detalle minimo valido con los creditos verificados.

## Lista exacta

| # | `catalog_id` | Campo | Accion | Antes | Despues |
| -: | --- | --- | --- | --- | --- |
| 1 | `ps4-airport-simulator-2019` | `developer` | `ADD_MISSING` | Sin dato | Toplitz Productions |
| 2 | `ps4-ben-10` | `developer` | `ADD_MISSING` | Sin dato | Torus Games |
| 3 | `ps4-big-bobby-car-the-big-race` | `developer` | `ADD_MISSING` | Sin dato | Independent Arts Software GmbH |
| 4 | `ps4-candle-the-power-of-the-flame` | `developer` | `ADD_MISSING` | Sin dato | Teku Studios |
| 5 | `ps4-chicken-range` | `developer` | `ADD_MISSING` | Sin dato | NYX Digital |
| 6 | `ps4-crazy-machines-vr` | `developer` | `ADD_MISSING` | Sin dato | FAKT Software |
| 7 | `ps4-dead-synchronicity-tomorrow-comes-today` | `developer` | `ADD_MISSING` | Sin dato | Fictiorama Studios |
| 8 | `ps4-destiny-2` | `developer` | `REPLACE_OR_ADD_VERIFIED` | Wolf Team | Bungie |
| 9 | `ps4-destiny-2` | `publisher` | `REPLACE_OR_ADD_VERIFIED` | Namco | Activision |
| 10 | `ps4-destiny-2-collector%27s-edition` | `developer` | `ADD_MISSING` | Sin dato | Bungie |
| 11 | `ps4-destiny-2-collector%27s-edition` | `publisher` | `ADD_MISSING` | Sin dato | Activision |
| 12 | `ps4-destiny-2-limited-edition` | `developer` | `ADD_MISSING` | Sin dato | Bungie |
| 13 | `ps4-destiny-2-limited-edition` | `publisher` | `ADD_MISSING` | Sin dato | Activision |
| 14 | `ps4-destiny-2-promo-not-for-resale` | `developer` | `ADD_MISSING` | Sin dato | Bungie |
| 15 | `ps4-destiny-2-promo-not-for-resale` | `publisher` | `ADD_MISSING` | Sin dato | Activision |
| 16 | `ps4-dirt-rally-20` | `developer` | `ADD_MISSING` | Sin dato | Codemasters |
| 17 | `ps4-dragons-dawn-of-new-riders` | `developer` | `ADD_MISSING` | Sin dato | Climax Studios |
| 18 | `ps4-ducati-90th-anniversary` | `developer` | `ADD_MISSING` | Sin dato | Milestone srl |
| 19 | `ps4-farming-simulator-19` | `developer` | `ADD_MISSING` | Sin dato | GIANTS Software |
| 20 | `ps4-flockers` | `developer` | `ADD_MISSING` | Sin dato | Team17 Digital Limited |
| 21 | `ps4-heart-&amp;-slash` | `developer` | `ADD_MISSING` | Sin dato | aheartfulofgames |
| 22 | `ps4-hogwarts-legacy` | `developer` | `REPLACE_OR_ADD_VERIFIED` | Avalanche Studios | Avalanche Software |
| 23 | `ps4-hogwarts-legacy-collector%27s-edition` | `developer` | `ADD_MISSING` | Sin dato | Avalanche Software |
| 24 | `ps4-hogwarts-legacy-deluxe-edition` | `developer` | `ADD_MISSING` | Sin dato | Avalanche Software |
| 25 | `ps4-hunting-simulator` | `developer` | `ADD_MISSING` | Sin dato | Neopica |
| 26 | `ps4-injustice-2` | `developer` | `ADD_MISSING` | Sin dato | NetherRealm Studios |
| 27 | `ps4-marvel-avengers` | `developer` | `REPLACE_OR_ADD_VERIFIED` | TT Games | Crystal Dynamics |
| 28 | `ps4-marvel-avengers-deluxe-edition` | `developer` | `ADD_MISSING` | Sin dato | Crystal Dynamics |
| 29 | `ps4-marvel-avengers-earth%27s-mightiest-edition` | `developer` | `ADD_MISSING` | Sin dato | Crystal Dynamics |
| 30 | `ps4-marvel-avengers-steelbook-edition` | `developer` | `ADD_MISSING` | Sin dato | Crystal Dynamics |
| 31 | `ps4-memorrha` | `developer` | `ADD_MISSING` | Sin dato | Korion Interactive |
| 32 | `ps4-metro-redux` | `developer` | `ADD_MISSING` | Sin dato | 4A Games |
| 33 | `ps4-monster-jam-steel-titans` | `developer` | `ADD_MISSING` | Sin dato | Rainbow Studios |
| 34 | `ps4-moto-racer-4` | `developer` | `ADD_MISSING` | Sin dato | Artefacts Studio |
| 35 | `ps4-motogp-18` | `developer` | `ADD_MISSING` | Sin dato | Milestone srl |
| 36 | `ps4-mountain-rescue-simulator` | `developer` | `ADD_MISSING` | Sin dato | UIG Entertainment |
| 37 | `ps4-mx-vs-atv-all-out` | `developer` | `ADD_MISSING` | Sin dato | Rainbow Studios |
| 38 | `ps4-my-life-riding-stables-3` | `developer` | `ADD_MISSING` | Sin dato | Korion Interactive |
| 39 | `ps4-my-little-riding-champion` | `developer` | `ADD_MISSING` | Sin dato | Caipirinha Games |
| 40 | `ps4-one-piece-world-seeker` | `developer` | `REPLACE_OR_ADD_VERIFIED` | Namco Bandai Entertainment | Ganbarion |
| 41 | `ps4-pillars-of-eternity-complete-edition` | `developer` | `ADD_MISSING` | Sin dato | Obsidian Entertainment |
| 42 | `ps4-professional-farmer-2017` | `developer` | `ADD_MISSING` | Sin dato | Visual Imagination Software |
| 43 | `ps4-professional-farmer-american-dream` | `developer` | `ADD_MISSING` | Sin dato | UIG Entertainment |
| 44 | `ps4-ride-2` | `developer` | `ADD_MISSING` | Sin dato | Milestone srl |
| 45 | `ps4-rugby-18` | `developer` | `ADD_MISSING` | Sin dato | EKO Software |
| 46 | `ps4-space-hulk-tactics` | `developer` | `ADD_MISSING` | Sin dato | Cyanide Studio |
| 47 | `ps4-terminator-2d-no-fate-day-one-edition` | `developer` | `ADD_MISSING` | Sin dato | Bitmap Bureau |
| 48 | `ps4-the-unicorn-princess` | `developer` | `ADD_MISSING` | Sin dato | Caipirinha Games |
| 49 | `ps4-tt-isle-of-man-ride-on-the-edge-2` | `developer` | `ADD_MISSING` | Sin dato | KT Racing |
| 50 | `ps4-until-dawn-rush-of-blood` | `developer` | `ADD_MISSING` | Sin dato | SuperMassive Games Ltd. |
| 51 | `ps4-wonder-boy-the-dragon%27s-trap` | `developer` | `ADD_MISSING` | Sin dato | Lizardcube |
| 52 | `ps4-world-quiz` | `developer` | `ADD_MISSING` | Sin dato | NYX Digital |
| 53 | `ps4-xeno-crisis` | `developer` | `ADD_MISSING` | Sin dato | Bitmap Bureau |

Filas bloqueadas: ninguna.

## Reproduccion

```bash
python3 scripts/apply_company_credit_ps4_pal_batch_1.py \
  --package-dir /ruta/al/package
python3 scripts/apply_company_credit_ps4_pal_batch_1.py \
  --apply \
  --package-dir /ruta/al/package
python3 scripts/test_company_credit_ps4_pal_batch_1.py
```

La aplicacion es idempotente: una segunda ejecucion conserva sin cambios los archivos y el informe original.

## Verificacion

| Control | Resultado |
| --- | --- |
| Controles semanticos del paquete | 21/21 PASS |
| `npm run test:catalog-count-semantics` | 7/7 PASS |
| Prueba especifica de este lote | PASS |
| Regresion del lote de 19 creditos anterior | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 errores y 35 avisos preexistentes |
| Pruebas de precedencia y fallback de creditos | 5/5 PASS |
| `npm run test:verified-company-credits` | PASS, 63 fichas y 72 campos sincronizados |
| `npm run test:unit` | 217/217 PASS |
| `npm run test:collector-controls` | PASS |
| `npm run test:affiliate-offers-v1` | PASS |
| `npm run build` | PASS |

El QA local del artefacto de produccion recorrio 20 vistas: cinco fichas y cinco paginas de compania en `1440 x 1000` y `390 x 844`. Se comprobaron Destiny 2, Hogwarts Legacy, Marvel Avengers, One Piece World Seeker, Airport Simulator 2019, Bungie, Activision, Avalanche Software, Crystal Dynamics y Ganbarion. Resultado: 20/20, con los creditos esperados visibles, cero imagenes rotas, cero errores de consola o pagina y cero desbordamientos horizontales.

## Guardas

La prueba semantica rechaza una confianza inferior a `VERY_HIGH`, roles digitales o de apoyo, nombres compuestos, campos singulares duplicados y precondiciones que hayan dejado de coincidir. El comparador de cambios exige que solo cambien los 49 IDs aprobados y los slugs de compania referenciados. No existe propagacion por titulo, familia, region, edicion o plataforma.
