# PS2: fotos verificadas de eBay, lotes 2 y 3

Revisión del 11 de septiembre de 2026: 20 fichas PAL España sin portada principal y el ejemplo de Alone in the Dark PAL Italia facilitado por el usuario.

- 50 anuncios abiertos para comprobar disponibilidad, país de origen y galería. En 28 se revisaron fotografías originales; los restantes se descartaron por galería insuficiente, procedencia o artículo inadecuado.
- 35 fotografías nuevas, sin modificar sus bytes, para 18 fichas.
- 16 portadas principales: 15 españolas y una italiana.
- Buzz! El Gran Reto y Manager de Liga 2003 incorporan fotos de componentes en galería, sin frontal individual como imagen principal.
- FIFA 2001, Manager de Liga 2004 y NBA Live 2001 quedan sin incorporación: los candidatos accesibles no aportaron una caja española verificable de PS2.
- Se preservan las 11 fotografías del piloto, incluida la composición de Bratz, ahora completada con un frontal individual.

El informe JSON adjunto contiene las fichas, las decisiones, las URL originales, los índices de las fotos y las huellas SHA-256 de los 35 archivos publicados. La revisión combina las ofertas de las fichas con búsquedas ampliadas por título exacto; no se presenta como una revisión estrictamente secuencial de todos los resultados de eBay.

## Criterios aplicados

El origen del envío permite priorizar anuncios, pero no determina la región de la caja. Se contrastan título, plataforma, año, reedición, idioma impreso, códigos y coherencia de las fotos del mismo ejemplar. El frontal puede vincularse al mercado del reverso cuando ambos pertenecen al mismo objeto coherente. Esto no certifica la combinación original de fábrica con disco o manual.

Los anuncios con variantes requieren elegir el juego concreto y aislar sus fotos. En Manager de Liga 2003 se eligió la variante 516017596878 y se revisaron las imágenes 235 y 236 de 238. Las demás imágenes del anuncio no se asignan a ese juego.

Se distingue el texto comercial de la caja del idioma observado al ejecutar el juego. La caja de Kingdom Hearts II declara manual, textos y subtítulos en castellano, con voces en inglés. No se modifica el registro documental del software a partir de esa afirmación del envase.

Ejemplos que sirven para evaluar el worker:

- FIFA 2002, anuncio 376076813273: envío desde España, pero caja británica con reverso inglés. Descartado para PAL España.
- Buzz! El Gran Reto, anuncios 128070282260 y 305607645714: cajas de pack con «Prohibida la venta por separado». No se usan como presentación individual.
- NBA Live 08: las banderas de FIBA del frontal representan selecciones, no idiomas ni territorios comerciales.
- Manager de Liga: los anuncios de J.League Tactics Manager y las versiones de Xbox no son equivalentes a las fichas de PS2.

Estas observaciones se entregaron al task del worker como material de evaluación. Publicar las fotos y documentar el método no equivale a entrenar o activar automáticamente el worker.

## Validación

La prueba regional comprueba el conjunto exacto de portadas añadidas, las identidades y URLs conservadas, el bloqueo de cruces entre regiones o ediciones, las fotos que solo deben aparecer en galería y las huellas de todos los originales publicados.

## Caso adicional: Ricky Ponting International Cricket 2005, Australia

El informe `2026-09-11-ricky-ponting-australia.json` documenta el segundo anuncio de la ficha PAL Australia, 145754180741. Se revisaron sus cuatro fotos con la galería, el zoom y los originales a resolución completa. Se publican únicamente el frontal individual y el reverso, conservando sus bytes y la URL de la ficha.

La carátula estándar lleva clasificación australiana G / General; el reverso indica venta autorizada exclusivamente en Australia y Nueva Zelanda y muestra el código de barras 5024866329322. La foto del disco muestra SLES-53058/ANZ. La bandera británica del bloque de características y los textos en inglés no sustituyen esa evidencia territorial explícita. El alcance ANZ queda documentado sin cambiar la identidad PAL Australia de la ficha.

La ausencia de manual se registra aparte como contexto del precio del ejemplar. No impide aprovechar fotos de una carátula identificada y no se presenta como una característica de todos los juegos de esta edición. Tampoco convierte un precio solicitado en una venta verificada. No se modifica ni activa el worker.
