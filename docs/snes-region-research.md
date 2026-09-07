# Super Nintendo: preparacion documental del engine v2

Revision 2026-09-07. Ampliacion de la capa documental de la PR #208, aun en
borrador. No altera catalogo, precios, reglas deterministas, memoria humana,
umbrales ni contenido obligatorio de las fichas.

## Lectura y contraste

Se consultaron los capitulos iniciales y entradas concretas de la guia de
SpineCard mediante Discourse. No se afirma haber auditado todas las respuestas
posteriores del hilo. Las URLs por afirmacion estan en
`data/region-research/snes.json`.

Se contrastaron referencias con el inventario del propietario Ereza, que
registra componentes separadamente. Un inventario actual no demuestra que
sus piezas salieran juntas de fabrica. No se copiaron fotos ni textos largos.

Se localizaron tambien los manuales oficiales de Nintendo Classic Mini:
https://www.nintendo.co.jp/clvs/manuals/es/index.html
Esa pagina sirve como ruta futura. No demuestra la distribucion original
espanola de las ediciones fisicas; no se usa como fuente de codigos PAL ESP.

## Primera entrega (v1)

- Cinco precauciones generales de inspeccion, con fuentes.
- Dos referencias documentales por ID exacto: Super Mario Kart y Super Mario
  World. Solo comparacion, nunca prueba automatica de una ficha o anuncio.
- Tres excepciones pendientes para investigacion humana, excluidas del prompt:
  Yoshi's Island, Illusion of Time y Yoshi's Cookie.
- Las seis vinculaciones de investigacion SNES apuntan a IDs PAL existentes.
  No se asignan reglas por coincidencias de nombre, ni a packs o reediciones.

Al comprobar el enlace historico de la imagen `supermw2.JPG`, hubo redireccion
a la portada HTML del foro, no a una foto. Se registra como evidencia no
disponible, aunque la respuesta HTTP final sea 200. No se ha validado
visualmente el ejemplar de esa imagen. La discrepancia de Yoshi queda descrita
en el JSON, no resuelta por conjetura.

## Funcionamiento y limites

El cargador usa una lista cerrada de plataformas; cada documento mantiene su
propia procedencia. Las entradas pendientes no llegan al modelo. Se conserva
la invalidacion de cache por contenido y la separacion de ejemplos humanos.

La inferencia determinista existente sigue priorizando NOE como Alemania.
Este trabajo NO resuelve ese comportamiento para posibles conjuntos
espanolizados: antes de cambiarlo hacen falta ejemplares confirmados y una
prueba por componente que evite tanto falsos rechazos como falsas aceptaciones.
No se debe presentar la investigacion como una excepcion ya operativa.

No se consume OpenAI ni se lanza una campana para investigar. Cuando se
publique, las nuevas instrucciones pueden aumentar tokens de cada analisis
y provocar nuevas consultas al invalidar cache. No hay precision medida.

Rollback: retirar `snes` de la lista del cargador, conservando la investigacion.
No existen cambios de datos o decisiones que revertir.

## Verificacion local de v1

9/9 pruebas de investigacion correctas, incluyendo exclusion de pendientes,
IDs existentes y aislamiento entre juegos/plataformas. Tambien pasan
`test_collector_intelligence.py`, `test_wallapop_evidence.py` y `git diff --check`.
No se ejecuta build local para esta ampliacion Python/documental; los checks
remotos son una fase distinta. No hay verificacion de anuncios reales ni
publicacion en Production.

## Ampliacion v2

Se han revisado tambien las 30 ultimas respuestas disponibles del hilo y las
tablas de etiquetas, cajas y ROM de seis juegos en SNES Central. Hay nuevas
referencias para Yoshi's Island, Secret of Evermore, Illusion of Time, Secret
of Mana, Lufia, Zelda, Terranigma y Breath of Fire II. Total: 13 referencias,
10 utilizables como guia; las tres excepciones originales siguen pendientes.

Las tablas de escaneos no prueban que dos piezas fueran vendidas juntas.
`componentAssociation` conserva expresamente esa limitacion cuando aparecen
referencias de ROM o registros de distintas fuentes. El engine solo recibe
el resumen de inspeccion por ID, no una regla nueva de aceptacion.

Se han inspeccionado visualmente en el navegador la trasera de la caja ESP de
Yoshi's Island y la etiqueta ESP de Secret of Evermore. Eso no valida la pareja
NOE/ESP ni constituye auditoria de anuncios. Las afirmaciones discutidas sobre
traducciones se conservan en `disputedClaims`, fuera del prompt.

Cobertura, hallazgos, pendientes y limites completos:
[repaso conjunto v2](regional-research-v2.md).
