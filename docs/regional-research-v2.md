# Game Boy y SNES: segunda lectura documental

Revision: 2026-09-07. PR #208 en DRAFT. Sin merge ni Production.
Esta ampliacion no cambia el cargador ni el clasificador: enriquece documentos
y pruebas de aislamiento. No cambia catalogo, precios, decisiones humanas,
consultas de busqueda ni umbrales. No es fine-tuning ni precision demostrada.

## Cobertura real

| Fuente | Trabajo realizado | Limite |
| --- | --- | --- |
| [SpineCard Game Boy](https://foro.spinecard.com/t/guia-regiones-juegos-game-boy/20014/3) | Lectura de sus siete publicaciones mediante Discourse, mas fuentes enlazadas | Guia comunitaria, no evidencia de cada anuncio |
| [Game Boy Database](https://www.game-boy-database.com/fullset-ESP.html) | Recorrido del indice ESP y once fichas adicionales con codigos por pieza | No es una auditoria del fullset completo ni de todas sus fotos |
| [Hardware Database](https://gbhwdb.gekkio.fi/cartridges/gb.html) | Se mantienen los contrastes de etiqueta/ROM de la primera pasada | Una entrada sin ejemplares no demuestra una etiqueta fotografiada |
| [SpineCard SNES](https://foro.spinecard.com/t/super-nintendo-pal-espana-la-guia-del-coleccionista-definitiva/1176/2) | Primeras 20 publicaciones y 30 ultimas disponibles, incluidas respuestas 320-349 | El hilo tenia 345 publicaciones disponibles; no se ha leido entero |
| [SNES Central](https://snescentral.com/gameindex.php) | Tablas de seis juegos: Yoshi, Evermore, Illusion, Mana, Lufia y Zelda | Tablas independientes e incompletas; no certifican parejas de fabrica |
| [Inventario de Ereza](https://snes.ereza.cat/) | Contraste de componentes y documentos de ejemplares de su coleccion | Posesion actual no demuestra conjunto original |
| [RF Generation](https://www.rfgeneration.com/cgi-bin/search.pl) | Localizado buscador por titulo, plataforma y region | Sin nueva ficha individual contrastada: solo ruta futura |
| [Retroplace](https://www.retroplace.com/en/games?system_short=gameboy&item_type=2&order=title&genre_id=&release_id=&condition=) | Intentos de consulta del indice y ficha enlazada | Timeout; no se extraen hechos de una pagina no recuperada |

Los cuatro elementos vistos en el navegador fueron: etiqueta de Pokemon Rojo,
tabla de idiomas de Zelda ESP-2, caja trasera de Yoshi's Island y etiqueta de
Secret of Evermore. Las observaciones y atribuciones estan en `visualReview`.
No se descargan ni redistribuyen las imagenes, no se envian a OpenAI y no se
convierten en ejemplos humanos aprobados. Las URLs permiten volver a la fuente.

## Resultado acumulado

| Plataforma | Reglas generales | Referencias | Guia utilizable | Pendientes | IDs con guia especifica |
| --- | ---: | ---: | ---: | ---: | ---: |
| Game Boy | 7 | 14 | 13 | 1 | 16 |
| SNES | 7 | 13 | 10 | 3 | 10 |
| Total | 14 | 27 | 23 | 4 | 26 |

Hay 29 IDs distintos al contar tambien vinculaciones pendientes. Son
referencias de variantes, no 27 juegos nuevos, precios ni decisiones tomadas.
`reviewed_guidance` significa que sirve para orientar la inspeccion, no que la
variante o el anuncio del catalogo se hayan certificado como originales.

### Game Boy

- Pokemon Rojo y Amarillo: diferencias documentadas entre NESP de embalaje
  y ESP de cartucho. No exigir igualdad ciega de sufijos entre componentes.
- Donkey Kong Land: revisiones diferentes entre embalaje y cartucho;
  Donkey Kong Land 2: referencia NEAI con manual NITA y cartucho EUR.
- Super Mario Land, Tetris y Aladdin: mas combinaciones documentadas por pieza;
  ni NEAI ni NESP bastan para inventar idiomas de manual o ROM.
- Wario Land y Zelda: la fuente ofrece alternativas de manual. Se conserva
  la formulacion ambigua sin crear dos manuales obligatorios ni completar
  automaticamente un codigo abreviado.
- [Zelda ESP-2](https://www.game-boy-database.com/game-ZL-2797-ESP-2.html):
  la tabla distingue embalaje/manual en espanol de juego en ingles. La bandera
  se inspecciono visualmente; no se dedujo del nombre numerico de su imagen.
- Mickey Mouse: identidad contrastada con el titulo de la fuente. No se
  interpreta su identificador como otro juego por parecido.

### Super Nintendo

- [Yoshi's Island](https://snescentral.com/article.php?id=0674): caja espanola
  documentada, varias etiquetas PAL y una placa PAL revision 2. Se bloquean
  las generalizaciones sobre etiqueta unica o solo dos revisiones. Sigue sin
  demostrarse que una caja ESP y un cartucho NOE concreto salieran juntos.
- [Secret of Evermore](https://snescentral.com/article.php?id=0602) e
  [Illusion of Time](https://snescentral.com/article.php?id=0387): referencias
  distintas de etiqueta y chip; orientan que codigo fotografiar, sin inventar
  el interior del cartucho ni resolver el contenido de una Big Box.
- Secret of Mana: el inventario incluye piezas ESP que no aparecen en la
  tabla de etiquetas consultada. La ausencia en un indice no demuestra
  inexistencia ni que el juego estuviera traducido.
- Lufia: se distingue el titulo europeo de su nombre estadounidense y del
  primer juego; no se deduce un idioma comun para todos los PAL.
- Zelda: diferencias de idioma dentro de un mismo mercado en la fuente;
  no se adopta la lista de traducciones de una respuesta tardia del foro.
- Terranigma y Breath of Fire II: referencias adicionales de inventario,
  sin imponer sus piezas o suplementos a todas las ediciones.

## Pendientes que NO se habilitan

1. Asterix & Obelix Comic Classics: falta vinculacion exacta de esa edicion.
2. Yoshi's Island NOE/ESP: falta prueba del conjunto y distribucion original.
3. Illusion of Time Big Box: falta verificar guia/manual de la edicion exacta.
4. Yoshi's Cookie Arcadia: faltan fotos accesibles del conjunto y suplemento.

Ademas se registran las contradicciones sobre traducciones oficiales en las
respuestas [344](https://foro.spinecard.com/t/1176/344) y
[347](https://foro.spinecard.com/t/1176/347). Ni la afirmacion ni su negacion
global pasan a ser idiomas verificados. Algunas fotos antiguas del foro
redirigen a HTML: un HTTP 200 no significa que la imagen siga disponible.

## Engine y comprobacion

El cargador existente solo usa el resumen `text` de reglas revisadas y las
referencias de su `catalog_id` exacto. Los codigos estructurados son la
transcripcion documental del mismo resumen, no observaciones de un anuncio.
Las fuentes se guardan para trazabilidad, sin abrir una web por cada consulta.

Las pruebas comprueban procedencia, IDs existentes, aislamiento de plataformas
y ediciones, exclusion de pendientes, alternativas no inventadas, separacion
de escaneos, fallback, cache y ausencia de observaciones fabricadas. Hay un
presupuesto de longitud de prompt, no un limite al numero de juegos. En este
corte los maximos son 3.153 caracteres GB y 2.877 SNES, no tokens facturados.

No se modifica `infer_region_from_visual_observations`: su prioridad NOE hacia
Alemania sigue siendo una limitacion pendiente para conjuntos espanolizados.
Esta PR no afirma resolver ese descarte. Hace falta una auditoria de anuncios
reales antes de modificar la inferencia o afirmar una mejora de precision.

La revision invalida cache cuando cambie el prompt. Al publicarse puede
aumentar consumo futuro; este estudio no lanza tandas ni llamadas OpenAI.

Rollback y arquitectura: `gameboy-region-research.md` y
`snes-region-research.md`. Worktree conservado al seguir la PR sin fusionar.

## Resultados locales de v2

- `python3 scripts/test_region_research.py`: 15/15, offline, OpenAI simulado.
- `python3 scripts/test_collector_intelligence.py`: PASS.
- `python3 scripts/test_wallapop_evidence.py`: PASS.
- `python3 scripts/test_ai_balance_pause.py`: 3/3. Avisos y tokens simulados,
  no representan consumo ni estado real del worker.
- `git diff --check`: PASS.
- Comparacion con base `5bdea9d983506f3e413639424bc434a88a77e603`: sin
  diferencias en `data` salvo `data/region-research`, ni en `src`, `public`,
  inferencia determinista o memoria humana.

Blobs identicos de base/working tree comprobados:

| Archivo | Blob |
| --- | --- |
| `data/catalog.json` | `871c939d3bf1ea0721eaa360a93143bd95b741d7` |
| `data/index/companies.json` | `f1499edd5650d013ac3d9c9a3b1948b14262b4af` |
| `data/meta.json` | `dd374536f9af50184ee35c99df0fbd3d00dbc338` |
| `data/game-details.json` | `68bef382cb1b84c051b0404ac12c991cbc888e55` |

El snapshot local mantiene 73.104 filas y 73.104 IDs unicos. Es evidencia del
corte, no un numero fijo en una prueba permanente ni una afirmacion sobre
Production en tiempo real. Los mismos blobs preservan precios, URLs, portadas
y creditos. No se ejecuta build local por alcance documental/Python; el
resultado de Quality y Preview del nuevo HEAD se informa por separado en la PR.
