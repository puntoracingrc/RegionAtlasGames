# Game Boy: Legado del Pixel, pasada documental v3

Revision: 2026-09-07. PR #208 en DRAFT; sin merge ni Production.

## Fuente y cobertura real

- [Listado de Daniels, post 132](https://www.legadodelpixel.es/foro/general/listado-completo-juegos-gameboy-esp-espanoles-en-actualizacion/).
- [Aportacion de Kwirk de alfheim, post 248](https://www.legadodelpixel.es/foro/general/listado-completo-juegos-gameboy-esp-espanoles-en-actualizacion/#post-248).
- Primera pagina leida, incluidos comentarios sobre variantes pendientes. La segunda pagina devolvio HTTP 502 en navegador y no se declara revisada.
- El autor da 445 entradas a 25/08/2020 y avisa de que el listado sigue incompleto. No se interpreta como inventario actual ni como 445 obras diferentes.
- Inspeccion DOM: 401 bloques desplegables, 792 URLs de imagen distintas dentro de ellos y 41 menciones de fotos pendientes en el post principal. Son medidas de estructura, no fotos validadas.
- Muestra visual: 11 fotos de cuatro juegos, abiertas en navegador o en el desplegable. No se han comprobado todas las fotos del listado.
- Las fotos antiguas tienen marcas de agua y resolucion desigual. Solo se anotan rasgos legibles. Las referencias conservan URL, atribucion y limitaciones individuales en `data/region-research/gameboy.json`.
- No se descargan, rehostean ni reutilizan como portadas. Licencia no establecida; referencias para investigacion, no assets de la web.

## Resultado de la muestra

| Referencia | Fotos | Observacion y limite | Vinculacion de comparacion |
| --- | ---: | --- | --- |
| Batman The Video Game | 2 | Caja con texto aleman y adhesivo SPACO; manuales con encabezados aleman/espanol. Las marcas de varios papeles no demuestran conjunto de fabrica. | `gameboy-es-batman-the-video-game` |
| Waterworld | 2 | Descripcion de caja en espanol, encabezado italiano de manual y marcas GiG/Ocean. Codigo de cartucho ITA afirmado por el pie, no verificado en las fotos. | `gameboy-es-waterworld` |
| Kwirk | 5 | Nintendo Espana en lateral y DMG-AP / ESP-2 en solapas. Se normaliza a DMG-AP-ESP-2 solo para caja. | `gameboy-es-kwirk` |
| The Flintstones, pelicula | 2 | Actores en la portada, Ocean, trasera multilingue y hoja francesa. No es King Rock Treasure Island. | `gameboy-es-flintstones` |

Estas observaciones son sobre ejemplares fotografiados por terceros. No verifican la autenticidad, integridad, idioma de ROM o distribucion del anuncio que analice el worker.

## Pendientes expresos

- Darkwing Duck: la afirmacion de textos jugables en castellano queda en `pending_rom_evidence`, fuera del prompt. Falta evidencia jugable o documentacion primaria vinculada a una variante. Sus fotos no se revisaron en esta muestra.
- Boxxle II espanolizado: `pending_catalog_binding`, sin ID. No asignar al Boxxle I de Espana ni reclasificar fichas USA/PAL genericas. Falta inspeccion de componentes y vinculacion exacta.
- Asterix & Obelix Comic Classics conserva su pendiente anterior, sin ID.
- King Rock Treasure Island mantiene intacta la advertencia de falta de prueba de espanolizacion. Las fotos de la pelicula no resuelven esa pregunta.
- Segunda pagina del foro pendiente por fallo de acceso; no asumir que no contiene rectificaciones.

## Integracion conservadora

Solo cambian `gameboy.json`, la prueba documental y este informe.

- Dos reglas generales nuevas: inclusion en un listado ESP no prueba idioma jugable; inspeccionar por separado embalaje, adhesivos, suplementos y manuales.
- Cuatro guias nuevas por `catalog_id` exacto. Dos referencias nuevas pendientes que el lector existente omite.
- No hay coincidencia aproximada por titulo, propagacion de regiones, plataformas, secuelas, Classics o packs.
- Los 14 registros y siete reglas de Game Boy anteriores se conservan literalmente, incluidos los pendientes.
- No se modifica el lector, la inferencia determinista, los umbrales, las consultas ni las decisiones humanas. No se crean `approvedExamples` ni observaciones de anuncios.
- Las URLs de foto quedan como procedencia documental; no se envian al modelo como imagenes del anuncio.
- El lector existente ya incorpora las reglas de plataforma y solo las referencias del ID solicitado. El cambio de contexto invalida su cache de vision mediante el hash existente.
- Esto no es fine-tuning, ni una medicion de precision real. La prioridad determinista preexistente de NOE hacia Alemania sigue sin modificarse.
- No se ejecutan tandas ni llamadas reales a OpenAI. El contexto adicional puede aumentar el consumo futuro al integrarse.

## Acumulado de investigacion

| Plataforma | Reglas | Referencias | Utilizables | Pendientes | IDs con guia | IDs incluyendo pendientes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Game Boy | 9 | 20 | 17 | 3 | 20 | 21 |
| SNES | 8 | 17 | 14 | 3 | 13 | 16 |
| Mega Drive | 7 | 9 | 9 | 0 | 10 | 10 |
| NES | 8 | 8 | 5 | 3 | 5 | 7 |
| Total | 32 | 54 | 45 | 9 | 48 | 54 |

Los recuentos son el corte de este informe, no limites permanentes del producto.

## Verificacion local

- `python3 scripts/test_region_research.py`: 35/35. Cuatro tests nuevos: fotos/procedencia, aislamiento por ID/plataforma/componente, pendientes fuera del prompt y separacion Flintstones/King Rock.
- `python3 scripts/test_collector_intelligence.py`: PASS.
- `python3 scripts/test_wallapop_evidence.py`: PASS.
- `python3 scripts/test_ai_balance_pause.py`: 3/3, tokens y saldo simulados; sus avisos no corresponden a una tanda real.
- Maximo contexto Game Boy: 4.176 caracteres. No son tokens facturados. El test dinamico comprueba todas las vinculaciones y un limite de contexto, no un numero fijo de juegos.
- `git diff --check`: PASS.
- Sin build local: esta ampliacion no cambia UI ni runtime. Quality/Preview del nuevo commit deben comprobarse por su SHA; los checks anteriores no validan esta ampliacion.

## Datos y comportamiento protegidos

Comparacion por blob con la base de la PR `5bdea9d983506f3e413639424bc434a88a77e603`:

| Archivo | Blob identico |
| --- | --- |
| `data/catalog.json` | `871c939d3bf1ea0721eaa360a93143bd95b741d7` |
| `data/index/companies.json` | `f1499edd5650d013ac3d9c9a3b1948b14262b4af` |
| `data/meta.json` | `dd374536f9af50184ee35c99df0fbd3d00dbc338` |
| `data/game-details.json` | `68bef382cb1b84c051b0404ac12c991cbc888e55` |
| `scripts/collectors/regional_packaging.py` | `57da339f13fea642ffbae190ddc8e4b368ce7194` |
| `scripts/collectors/game_region_learning.py` | `8cbbddfaa5809dab076167520162d1516ab526f5` |

Snapshot local: 73.104 filas y 73.104 IDs unicos. Es el corte de esta rama, no una lectura actual de Production. Identidades, URLs, portadas, precios y creditos permanecen intactos.

PR en borrador y worktree propio conservado al no estar fusionado. El resultado de checks remotos y SHA se registra en la PR, sin convertir la validacion local en una afirmacion de despliegue.
