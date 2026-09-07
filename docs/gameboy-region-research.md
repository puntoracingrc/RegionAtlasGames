# Game Boy: investigacion documental v1

Fecha de revision: 2026-09-07. Alcance exclusivo: orientar la inspeccion del
engine. No modifica el catalogo, precios, regiones, decisiones ni umbrales.
No es fine-tuning de OpenAI ni aprendizaje de pesos.

## Fuentes y limites

El [hilo de SpineCard](https://foro.spinecard.com/t/guia-regiones-juegos-game-boy/20014/3)
sirve para descubrir referencias, no como verdad automatica. Se ha leido su
contenido mediante la API publica Discourse. RF Generation y Retroplace quedan
como rutas de investigacion, no como evidencia ya contrastada.

La [base de hardware de Gekkio y colaboradores](https://gbhwdb.gekkio.fi/cartridges/)
distingue referencias de etiqueta, ROM y placa. Datos bajo CC-BY-SA-4.0; el JSON
conserva atribucion y licencia por fuente. Las notas derivadas de esas entradas
se distribuyen bajo esa misma licencia. No se han copiado fotografias.

Tres referencias documentales, asociadas explicitamente a seis IDs PAL
(Europa/Espana), SOLO como comparacion entre variantes, no como prueba de la
region o idioma de esas seis fichas:

- [Asterix](https://gbhwdb.gekkio.fi/cartridges/DMG-XAX-0/): etiqueta FAH,
  ROM descrita con cinco idiomas incluido espanol. No equivale a distribucion ESP.
- [The Addams Family](https://gbhwdb.gekkio.fi/cartridges/DMG-AFX-0/): tambien
  etiqueta FAH, pero la ROM descrita tiene ingles, frances y aleman. Por tanto
  el mismo sufijo no establece el conjunto de idiomas.
- [Flintstones: King Rock Treasure Island](https://www.game-boy-database.com/game-FE-730-FRG.html):
  registra DMG-FE-FRG en solapa, manual y cartucho. La pregunta del foro sobre
  distribucion espanola no es una confirmacion. No se adopta la afirmacion de
  igualdad de todas las ROM ni se interpreta como evidencia ESP.

El [fullset FRG](https://www.game-boy-database.com/fullset-FRG.html) incluye
revisiones 2, 3 y 4: no se incorpora la regla del foro que las limita a 1.
La expansion geografica RDA para FRG y los mapas universales letra-idioma quedan
bloqueados. No se han inspeccionado fisicamente los ejemplares ni validado
autenticidad de las fotos de anuncios.

## Conexion con el engine

`data/region-research/gameboy.json` conserva procedencia, fecha, lote, reglas
de inspeccion, afirmaciones bloqueadas y referencias por `catalog_id` exacto.
`region_research_prompt` incorpora al analisis visual cinco precauciones
generales y solo las referencias de la ficha solicitada. No busca por titulo
ni propaga a secuelas, otras plataformas o variantes USA/Japon.

Es una capa documental separada de `game_region_profile`, que conserva la
memoria de decisiones humanas. No escribe `approvedExamples`, ni introduce
codigos de la referencia en `observations`. Las URLs son trazabilidad, no
peticiones web nuevas por anuncio. La revision del contenido invalida la cache
visual de Game Boy, incluso con claves personalizadas; puede generar nuevas
llamadas pagadas cuando el worker vuelva a analizar esos anuncios.

No se han cambiado las consultas de busqueda ni sus reglas de aprobacion.
No se debe confundir esta orientacion con una mejora de precision medida:
faltan anuncios reales revisados a mano en la nueva cola para evaluar aciertos,
falsos positivos y descartes antes/despues. No se lanza una tanda para medirlo.

## Verificacion y rollback

Prueba offline `python3 scripts/test_region_research.py`: procedencia/IDs,
aislamiento de plataforma y ficha, fallback, consumo del prompt sin inventar
observaciones e invalidacion de cache. OpenAI se simula; coste de API cero.

Rollback: retirar la llamada a `region_research_prompt` en el clasificador.
No hay migracion de datos ni decisiones que deshacer. La memoria humana se
mantiene intacta. Publicacion y evaluacion real quedan separadas del estudio.

Resultados locales: 6/6 pruebas nuevas, `test_collector_intelligence.py`,
`test_wallapop_evidence.py` y 3/3 `test_ai_balance_pause.py` correctos.
Los avisos de saldo en esta ultima prueba son simulados, no estado del worker.
`git diff --check` correcto; catalogo, detalles, companias y meta sin cambios
frente a la base `5bdea9d983506f3e413639424bc434a88a77e603`.
No se ha ejecutado un build local: no hay cambios de interfaz ni TypeScript.
