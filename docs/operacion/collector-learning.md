# Aprendizaje supervisado de los recolectores

La cola de revisión es el conjunto de verdad del motor. Una decisión humana no
entrena un modelo de forma automática: primero se destila a una memoria común,
auditable y reversible que consumen los recolectores y los analizadores de
imágenes.

## Evidencia que se conserva

- Aceptaciones: región, estado, señales regionales, fotos de referencia, consulta
  que funcionó y contenido original confirmado.
- Rechazos: motivo estructurado y, solo cuando aporta una diferencia visual,
  hasta cuatro imágenes como contraejemplo.
- Imágenes analizadas: posición, tipo de vista, sistema de clasificación,
  idiomas, códigos de producto, EAN/UPC, distribuidor y marcador de edición.
- Resumen agregado de rechazos por fuente y motivo.

No se publica el título libre, la descripción, la URL privada ni una consulta
fallida de un anuncio rechazado.

## Motivos de rechazo

`duplicate`, `wrong_game`, `wrong_platform`, `wrong_edition`, `wrong_region`,
`non_game`, `lot_or_bundle`, `condition_unverified`, `price_anomaly`,
`insufficient_evidence` y `other`.

Un duplicado, un precio anómalo o un estado no verificable no son una mala
carátula. Esos casos solo alimentan estadísticas; no se pasan al modelo como
ejemplos visuales negativos.

## Reglas regionales

- PEGI confirma la familia europea, no PAL España.
- ESRB identifica USA, CERO Japón y USK Alemania.
- PAL España requiere contraportada/manual en español, distribuidor español o
  un código territorial explícito.
- CUSA y PPSA no identifican USA por sí solos.
- Un EAN se conserva para compararlo con referencias verificadas, pero su
  prefijo no demuestra el país de la edición.
- Idioma jugable y región física son atributos independientes.

## Operación

El archivo `collector-learning.json` se regenera al guardar la cola y se
sincroniza con el PC worker. El motor usa ejemplos aprobados y contraejemplos en
modo conservador. Las decisiones automáticas deben medirse primero en sombra
contra revisiones humanas antes de elevar sus umbrales de aplicación.

La acción `Cerrar sin resolver` marca los casos filtrados como rechazados por
evidencia insuficiente en una sola escritura. No borra fichas del catálogo y
mantiene el rastro de auditoría para que el mismo anuncio no reaparezca.
