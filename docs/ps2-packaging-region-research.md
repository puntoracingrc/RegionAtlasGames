# PS2: conocimiento de cajas y combinaciones de piezas

Revision: 2026-09-08. Base: `80c7d0aea7b19136f55a4efd2b76c21432aa4f96`.
Fuente aportada: [Disenos de caja de PS2 en Espana](https://foro.spinecard.com/t/disenos-de-caja-de-juegos-de-playstation-2-en-espana/7193/2).

## Cobertura

- Leidas las 70 publicaciones disponibles mediante la API publica Discourse,
  incluyendo preguntas, rectificaciones y respuestas posteriores al post inicial.
  La numeracion llega a 71; el post 20 no aparece en el stream disponible.
- Inspeccionadas 12 fotografias originales en el navegador, no solo miniaturas.
  No se afirma haber revisado todas las fotos, videos o enlaces externos del hilo.
- Siete guias generales y ocho referencias de juegos, con nueve IDs existentes
  PAL Espana vinculados explicitamente. Most Wanted tiene dos IDs, estandar y
  Platinum, porque la foto compara precisamente esas ediciones.
- Ocho afirmaciones pendientes, separadas del contexto que recibe el modelo.
  No es un inventario exhaustivo de variantes, ni un catalogo de falsificaciones.

`data/region-research/ps2.json` conserva URL, post, atribucion, observacion visual,
limites y preguntas pendientes. La atribucion del post no presupone derechos de
las fotos. Se guardan enlaces: cero imagenes copiadas al repositorio o servidor,
cero fotos de referencia enviadas como si fueran las del anuncio/usuario.

## Comparaciones incorporadas

| Juego | Detalle que buscar | Limite de la conclusion |
| --- | --- | --- |
| Final Fantasy XII | Tamano del logo PS2, bloque legal y EAN de las dos impresiones | No imponer una sola portada ni fechar tiradas por el logo |
| Kingdom Hearts II | Disney/BVG en portada y manual; disco BVG junto al conjunto blanco fotografiado | Logos diferentes no prueban cambiazo; foto de segunda mano no certifica fabrica |
| Gran Turismo 3 | Ejemplar rojo; el autor refiere tambien negro | Rojo no significa caja de Buzz; no extrapolar al Platinum |
| Gran Turismo 4 | Ejemplar blanco | No rechazar blanco por esperar azul ni confundir con Prologue |
| Jak and Daxter: The Lost Frontier | Naranja con ranura Memory Card visible | Fecha tardia no hace incorrecta esa caja; cronologia del molde sin ranura pendiente |
| Lord of the Rings Collection | Soporte central elevado FLEXBOX y tres discos | No exigir AMARAY o tres bandejas; inventario completo de manuales no demostrado |
| Budokai Tenkaichi 2 | Caja roja de un anuncio comentado en el hilo | Es una duda, no evidencia de caja oficial roja ni de un cambiazo concreto |
| Need for Speed Most Wanted | 12+ en Platinum frente a 3+ en la otra portada | No inferir falsificacion, cambio legal o software distinto |

La foto de caja sin Memory Card corresponde a Silent Hill Origins; el Sega
Superstars Tennis contiguo esta cerrado. El interior rojo abierto corresponde
a Buzz, no al Gran Turismo 3 que esta al lado. Se conserva esta separacion de
piezas para no aprender asociaciones a partir de la proximidad en una foto.

## Integracion y limites

El collector Python y el escaner TypeScript cargan el mismo documento. El worker
solo incorpora las referencias especificas del `catalog_id` indicado; el escaner
las obtiene con su mecanismo existente de coincidencias exactas de identidad.
Esas coincidencias son candidatos, no identificacion de la edicion observada.
No se anaden aliases, heuristicas de titulo, regiones, fichas o decisiones humanas.

Se mantiene la observacion fotografica separada de la interpretacion del escaner.
Dos instrucciones de observacion recuerdan distinguir carcasa/papel, logos,
soportes y codigos legibles. No contienen nombres de juegos, referencias ni colores
esperados. Las guias llegan despues de cerrar las observaciones.

Las referencias ayudan a describir coincidencias, explicar alternativas y pedir
una foto concreta, sin agregar requisitos universales. No activan nuevas
`distributionVariants` ni `knownVariantIds`: ninguno de estos conjuntos de segunda
mano se ha verificado como una asociacion exhaustiva de fabrica. El estado de
composicion puede seguir siendo `unknown` y mostrar hallazgos utiles y citados.
No se endurecen umbrales, aceptacion regional o requisitos de contenido completo.

No es fine-tuning ni una medicion de precision del modelo. No se hicieron nuevas
llamadas de pago a OpenAI. Las pruebas de vision usan respuestas simuladas y
demuestran la conexion, no que Mini detecte todos los detalles. Una evaluacion
real posterior debe medir aciertos y errores con fotos actuales y su coste real.
El contexto del worker ocupa 3.197 caracteres generales y como maximo 3.790 para
una ficha de este lote: no son tokens facturados ni una estimacion de coste.

## Preservacion de datos

Comparacion byte a byte con la base, sin reescrituras:

| Archivo | SHA-256 identico |
| --- | --- |
| `data/catalog.json` | `5c5b194526580af55fc34d6ce74f311c47cdf7ffc2840c2eefebebd4790f8d8b` |
| `data/index/companies.json` | `e7dec236270d670d42b4b0fbf6c74f02425e3e66484adb0f4ed5b2f376391f0a` |
| `data/game-details.json` | `14469e97884f47fb744f929b53ff80bcb412a7fadabc7d042c031e445a65fb66` |
| `data/meta.json` | `999818e6b9dd3a000d21b7b55eb440a7f4960d09a149280def05a300bea25d44` |

73.107 filas y 73.107 IDs unicos en este corte, sin alterar precios, portadas,
URLs, creditos o entidades. El numero es evidencia historica, no limite del test.
No cambia `public/` ni ningun dato anterior de investigacion GB/SNES/NES/Mega Drive.

## Evidencia reproducible

La descarga local se conserva fuera de Git en el directorio de artefactos
`ps2-packaging-knowledge-2026-09-08` del workspace de la tarea.

- JSON inicial: SHA-256 `d4a3016959f7f03c640f30c50e129554376109c204c3705a66ecc8007d0890c4`.
- JSON de las 50 publicaciones restantes: SHA-256 `80c72ab9273abbd2a3750ad30bc1938a6f1625ade530df627bf9d62b61b0b8e3`.
- Endpoint inicial: `https://foro.spinecard.com/t/disenos-de-caja-de-juegos-de-playstation-2-en-espana/7193.json`.
- Las restantes se recuperan con `/t/7193/posts.json` y los `post_ids[]` presentes
  en `post_stream.stream`, sin adivinar publicaciones ni acceder a contenido privado.

## Verificacion local

- `python3 scripts/test_region_research.py`: 39/39.
- `python3 scripts/test_region_vision_components.py`: 15/15.
- `npm run test:scanner`: 38/38.
- `npm run typecheck`: PASS.
- `npm run lint`: cero errores, 35 avisos preexistentes.
- `git diff --check`: PASS.
- `npm run test:unit`: 220/220 y todos los controles pre/post (7, 25, 18,
  14, 12 y 43 pruebas, mas comprobacion del indice de creditos).
- `npm run build`: PASS. No se ha desplegado esta extension a Production.

Nuevas pruebas: trazabilidad; aislamiento de IDs, plataformas y ediciones;
exclusion de afirmaciones pendientes; referencias no convertidas en imagenes del
anuncio; composicion desconocida compatible con hallazgos utiles; y separacion
de percepcion/interpretacion. No se necesita QA visual de UI: no cambia layout,
componentes visibles ni assets. La inspeccion de las 12 fotos es una revision
documental, no un smoke test del reconocimiento real en Production.

Rollback: retirar PS2 de los dos cargadores y las dos instrucciones de observacion
desactiva esta extension sin revertir catalogo o aprendizaje humano. El worktree
propio se conserva hasta que merge, checks, despliegue y QA autorizados terminen;
no se retiran worktrees ajenos.
