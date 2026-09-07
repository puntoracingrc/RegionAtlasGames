# SNES: distribuidores, suplementos y etiquetas traseras

Revision: 2026-09-07. PR #208 DRAFT, sin merge ni Production.
Enlaces recibidos: [respuesta 123](https://foro.spinecard.com/t/1176/123)
y [respuesta 339](https://foro.spinecard.com/t/1176/339).

## Cobertura de esta pasada

Leidas mediante Discourse las respuestas 118-137 y 330-349: 40 publicaciones,
20 nuevas respecto al estudio anterior y 20 relecturas. No es una lectura
completa de las 345 publicaciones disponibles del hilo.

22 fotos inspeccionadas en navegador: cinco de Desert Fighter, cinco de
Manchester United (incluida prensa), ocho de Brutal y cuatro de Yoshi's Island.
Dos enlaces adicionales de imgbox devolvieron una imagen de indisponibilidad,
no los folios esperados. No se cuentan como fotos documentales revisadas.

`data/region-research/snes.json` conserva cada URL, publicacion, atribucion
al autor del post y observacion visual. No presupone titularidad de las fotos.
No se han descargado, reimpreso, alojado ni enviado como ejemplos a OpenAI.

## Hallazgos utilizables como guia

| Referencia | Evidencia visible | Que pedir al anuncio actual |
| --- | --- | --- |
| [Desert Fighter, 123](https://foro.spinecard.com/t/1176/123) | Trasera inglesa con pegatina DRO SOFT S.A.; manual a color y portada de suplemento monocromo en castellano | Trasera completa, detalle de pegatina, paginas y codigos de todas las piezas |
| [Manchester United, 122](https://foro.spinecard.com/t/1176/122) | Pegatina Arcadia, trasera multilingue con espanol, manual/cartucho; fotos de resena y portada de Nintendo Accion 31 | Pegatina frontal, solapas, manual y etiqueta del mismo ejemplar |
| [Brutal, 127](https://foro.spinecard.com/t/1176/127) | Pegatina PROEIN sobre GameTek, trasera inglesa/francesa, manual a color y folio de controles en espanol | Ambas caras del folio y texto completo; los acercamientos publicados son de la misma cara |
| [Yoshi's Island, 331](https://foro.spinecard.com/t/1176/331) | Frontales SNSP-YI-NOE y traseras con advertencias alemanas o espanolas | Ambas caras vinculadas del cartucho actual, caja/manual y procedencia; separar codigo del juego de etiqueta generica de advertencias |

La pegatina identifica lo que esta impreso en ese ejemplar, no autentica todos
los anuncios que se le parezcan. Las fotos de prensa corroboran cobertura
contemporanea del juego, no el origen o contenido de cada copia. El suplemento
monocromo de Desert Fighter solo muestra su portada: no se afirma haber leido
su interior ni identificado un numero de paginas obligatorio.

Los cuatro registros nuevos se asocian exclusivamente a estos IDs:

- `snes-desert-fighter`
- `snes-manchester-united-championship-soccer`
- `snes-pal-brutal-paws-fury`
- `snes-super-mario-world-2-yoshi%27s-island`

Son comparadores de variantes para fichas PAL existentes, no nuevas ediciones
del catalogo ni confirmaciones de region del ejemplar anunciado.

## Lo que NO queda demostrado

- La respuesta 339 propone aprovechamiento de stock NOE. Es una hipotesis,
  no una prueba de pedidos, tiradas o emparejamientos de fabrica.
- No se ve una alarma ni una etiqueta inferior en las fotos de Yoshi. Tampoco
  se demuestra una secuencia continua de las capturas del segundo cartucho.
  La excepcion NOE/ESP sigue `pending_primary_evidence`.
- En Brutal se discuten diferencias del folio y un supuesto fallo de impresion.
  Las dos fotos alternativas del post 130 ya no muestran el documento. No se
  certifica defecto original, variante ni falsificacion a partir de ese debate.
- La afirmacion sobre cartucho EUR de Super Tennis Classics no resuelve una
  caja negra. La respuesta de Ranma tampoco se vuelve una regla universal.
- Tintin FAH, Bubsy, Bubsy II, Bugs Bunny, Brett Hull y Bulls vs. Blazers son
  rutas adicionales localizadas en el texto; sus collages no se han revisado
  visualmente en esta pasada. No se crean nuevas guias por sus nombres.
- Kirby FAH rosa con manual espanolizado procede de un anuncio citado en el
  foro, no de confirmacion independiente. La lista tardia de traducciones
  oficiales sigue bloqueada como en v2.

## Conexion, pruebas y preservacion

Sin cambios de cargador, clasificador, inferencia determinista, busquedas,
umbrales o memoria humana. La nueva regla general separa etiqueta frontal
y advertencias traseras. Las otras pistas entran solo por ID exacto; las
afirmaciones pendientes y URLs de imagen no forman parte de las observaciones
del anuncio ni de las imagenes enviadas al modelo.

SNES queda con ocho reglas y 17 referencias: 14 utilizables para 13 IDs y
tres pendientes. El conjunto GB/SNES/MD tiene 22 reglas, 40 referencias,
36 utilizables para 39 IDs y cuatro referencias pendientes. Las afirmaciones
discutidas se registran aparte. Estos son cortes documentales, no limites
permanentes del producto.

- `python3 scripts/test_region_research.py`: 26/26 offline, vision simulada.
- `python3 scripts/test_collector_intelligence.py`: PASS.
- `python3 scripts/test_wallapop_evidence.py`: PASS.
- `python3 scripts/test_ai_balance_pause.py`: 3/3, saldo y tokens simulados.
- Nuevos tests: procedencia de imagenes, placeholders fuera de evidencia,
  distribuidores sin propagacion, excepcion Yoshi aun bloqueada, pendientes
  fuera del prompt y ausencia de observaciones fabricadas.
- Prompt SNES maximo de 3.658 caracteres en este corte; no son tokens facturados.
  Cambiar el lote invalida cache documental SNES. No se lanzaron tandas ni
  llamadas OpenAI reales; el coste futuro puede aumentar cuando se integre.

Comparados con base `5bdea9d983506f3e413639424bc434a88a77e603`, mantienen
los mismos blobs `catalog.json`, `companies.json`, `meta.json` y
`game-details.json` (hashes en el informe v2). El snapshot local conserva
73.104 filas e IDs unicos, con precios, URLs, portadas y creditos intactos.
GB y Mega Drive no se modifican en esta ampliacion. Quality/Preview del nuevo
HEAD se informan en la PR por separado; no se ejecuta build local.

Rollback: revertir solo esta ampliacion recupera el documento SNES v2;
no requiere modificar catalogo o decisiones humanas. Worktree propio
conservado porque la PR permanece sin fusionar.
