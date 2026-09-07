# Mega Drive: variantes y comparacion visual

Revision: 2026-09-07. Extension de PR #208 en DRAFT, sin merge ni Production.
Fuente aportada: [hilo de SpineCard](https://foro.spinecard.com/t/mega-drive-variantes-diferencias-en-un-mismo-juego/29528/14).

## Cobertura y naturaleza de la evidencia

- Leidas las 81 publicaciones disponibles mediante la API publica Discourse.
  El enlace recibido apunta a una respuesta; se estudio tambien el resto del hilo.
- Inspeccionadas visualmente 17 imagenes originales en el navegador. No son
  anuncios de la cola del worker: son comparadores publicados en el foro.
- Nueve guias por juego, siete precauciones generales y diez IDs PAL explicitos.
  Maximum Carnage tiene dos fichas existentes vinculadas como comparacion.
- Seis afirmaciones pendientes o excluidas, nunca incorporadas al prompt.
- El hilo mezcla mercados y no constituye un inventario exhaustivo PAL Espana.
  Las fotos repetidas en el post inicial y en respuestas no se cuentan como
  corroboraciones independientes.

Las URLs originales, publicacion de procedencia, atribucion al autor del post
(no presuncion de titularidad fotografica) y hallazgo visual estan en
`data/region-research/megadrive.json`. No se copian, alojan ni envian esas imagenes
a OpenAI. Derechos de reutilizacion no establecidos. Tampoco se incorporan a
`approvedExamples` ni a decisiones humanas de la memoria del engine.

## Que mirar en cada juego

| Juego | Pista visual de las fotos | Limite |
| --- | --- | --- |
| [Aladdin, post 26](https://foro.spinecard.com/t/29528/26) | Composicion inferior de portada, franja cuadriculada y leyenda de fabricacion/ensamblaje trasera; mismo codigo de barras en dos impresiones | Fabricacion japonesa no equivale a mercado japones; EAN o tono no identifican solos la tirada |
| [The Lion King, post 18](https://foro.spinecard.com/t/29528/18) | Titulo localizado de caja, posicion del distintivo de megas y titulo ingles del cartucho en el conjunto de caja espanola | La diferencia de titulo no demuestra mezcla por si sola, ni confirma idioma jugable o conjunto de fabrica |
| [World of Illusion, post 1](https://foro.spinecard.com/t/29528/1) | Apertura fotografiada 2-3 con advertencias frente a dibujos; paginas 4-5 similares | El texto menciona 1-2: se conserva la discrepancia. Causa economica, orden de tiradas y completitud no demostrados |
| [Psycho Pinball, post 19](https://foro.spinecard.com/t/29528/19) | Textos y bandera de la esquina inferior derecha, comparando funda y caja | Impresion localizada no autentica el conjunto ni verifica ROM |
| [Micro Machines Military, posts 21/32](https://foro.spinecard.com/t/29528/32) | Portada/manual alemanes, pegatina de instrucciones y papel separado en espanol | Distribuidor y origen de la asociacion pendientes; no habilita excepcion espanola |
| [Micro Machines 1, post 81](https://foro.spinecard.com/t/29528/81) | Marca Arcadia en pegatina y suplemento, direccion de Madrid; diferencias de puntuacion y manual | Solo presencia visible en ese ejemplar. No trasladar Arcadia a Military ni FIFA |
| [FIFA 98, post 33](https://foro.spinecard.com/t/29528/33) | Titulo/foto de portada, idiomas indicados en manual y suplementos espanoles en la otra presentacion | Distribuidor no identificado; instrucciones no equivalen a idioma del software |
| [Maximum Carnage, post 70](https://foro.spinecard.com/t/29528/70) | Carcasas negras/rojas y diferentes disposiciones de PCB | No deducir cronologia, ventas, rareza, autenticidad o una placa unica por color |
| [Ghouls 'n Ghosts, post 74](https://foro.spinecard.com/t/29528/74) | Dos placas con tamanos/componentes distintos y fechas impresas 1989/1990 | El nombre del juego procede del post; la foto no muestra etiquetas para confirmar identidad. Pedir ambas vistas |

No se ha revisado visualmente cada imagen del hilo. Fantasia, Mega Games 1,
Los Pitufos, Virtua Racing y otras menciones quedan como rutas futuras,
no nuevas variantes certificadas. No se transcriben codigos de chips ilegibles
ni se adopta el inventario del libro fotografiado en el debate.

## Limites preservados

Pendientes: distribucion original de Military y FIFA 98, causa/cronologia de
manuales World of Illusion, orden de colores de Maximum Carnage y la supuesta
promocion alemana de Virtua Racing. Se excluye la broma rectificada sobre
MegaDrivZ: no puede convertirse en detector de reproducciones.

La conexion solo amplia el mapa de plataformas de `region_research_prompt`.
Usa reglas generales y referencias por ID exacto, nunca coincidencias de titulo.
Los resumenes indican la zona que inspeccionar y sus limites. Las referencias
visuales completas quedan en el documento, no en las imagenes del anuncio.
Los pendientes no llegan al modelo. Las fuentes no se consultan por anuncio.

Se mantiene el comportamiento de cache existente, sensible al texto documental.
No se modifica inferencia determinista, busquedas, umbrales, idiomas del catalogo,
precios, decisiones, contenido obligatorio ni memoria humana. Esta PR no afirma
corregir todos los descartes regionales ni medir una mejora de precision.
No es fine-tuning. No se ejecutaron llamadas OpenAI reales ni tandas de pago.
Si se integra posteriormente, el contexto adicional puede aumentar el consumo
futuro; en este corte el prompt documental MD ocupa como maximo 3.003 caracteres,
no una medicion de tokens facturados.

## Verificacion local

- `python3 scripts/test_region_research.py`: 21/21, offline y vision simulada.
- `python3 scripts/test_collector_intelligence.py`: PASS.
- `python3 scripts/test_wallapop_evidence.py`: PASS.
- `python3 scripts/test_ai_balance_pause.py`: 3/3, saldo y tokens simulados.
- Nuevos controles: trazabilidad de las 17 imagenes, IDs PAL existentes,
  aislamiento frente al resto del catalogo Mega Drive y otras plataformas,
  exclusiones pendientes, y separacion entre referencias e imagenes del anuncio.
- No build local por alcance Python/documental; Quality y Vercel del nuevo HEAD
  se notifican por separado en la PR, sin presentar checks anteriores como nuevos.

Comparacion con base `5bdea9d983506f3e413639424bc434a88a77e603`:

| Archivo | Blob identico en base y estado local |
| --- | --- |
| `data/catalog.json` | `871c939d3bf1ea0721eaa360a93143bd95b741d7` |
| `data/index/companies.json` | `f1499edd5650d013ac3d9c9a3b1948b14262b4af` |
| `data/meta.json` | `dd374536f9af50184ee35c99df0fbd3d00dbc338` |
| `data/game-details.json` | `68bef382cb1b84c051b0404ac12c991cbc888e55` |

73.104 filas e IDs unicos en el snapshot local, sin cambios de precios, creditos,
URLs, portadas o identidades. Es evidencia de este corte, no restriccion permanente
ni comprobacion en vivo de Production. La extension Mega Drive no cambia los
documentos anteriores GB/SNES, `src` o `public`.

Acumulado documental: 21 reglas, 36 referencias, 32 utilizables para 36 IDs,
cuatro referencias anteriores pendientes. Las seis afirmaciones MD excluidas
se registran aparte y no cuentan como referencias aceptadas.

Rollback: retirar la entrada `megadrive` del mapa del cargador deja de inyectar
esta guia; conservar el documento permite auditoria. No requiere revertir datos
del catalogo o memoria humana. Worktree propio conservado mientras PR #208 siga
sin fusionar; no se retiran worktrees ajenos.
