# Integración del lote documental pendiente de SpineCard

El estudio del 8 de septiembre quedó preparado fuera del repositorio y nunca llegó a los lectores activos. Esta integración añade 15 pautas de inspección y seis referencias de juegos, con 25 mensajes como fuentes, para PS1, Dreamcast, DS, 3DS y Xbox 360.

## Comportamiento

- El escáner web incorpora las pautas después de cerrar las observaciones de las fotografías. Las fotos del foro no entran en la percepción.
- En PS1 se combinan las nuevas pautas con el modelo regional V2. Las referencias por juego se limitan a los IDs resueltos que V2 haya seleccionado según los códigos observados. Una identidad múltiple, contradictoria o insuficiente conserva solo la guía general.
- El lector Python común recibe los mismos documentos y respeta sus asociaciones por ID. El manifiesto de sincronización incluye los JSON antes del lector; publicar este cambio no ejecuta la sincronización ni activa el worker V2.
- Las fuentes se mantienen accesibles en el resultado del escáner. Las dudas de la comunidad permanecen documentadas y no se convierten en variantes aceptadas, idiomas observados, contenido de fábrica, precios ni cambios de catálogo.

## Revisión de vínculos actuales

Se contrastaron los seis casos con el catálogo de `93d9262ca1b59663800cf2839d4be839a3650fb7`. Dos vínculos necesitaban corrección:

| Referencia | Vínculo anterior | Vínculo actual |
| --- | --- | --- |
| Heart of Darkness, comparación de pares de discos | `ps1-heart-of-darkness`, ahora edición francesa SLES-00462/10462 | `ps1-es-sles-00465` y `ps1-eu-sles-00461` |
| Ridge Racer, idiomas impresos y software | `ps1-ridge-racer`, ahora mercado pendiente | `ps1-eu-sces-00001` |

Se conservan las referencias estándar de Rayman, Colin McRae Rally, Doom y Aqua GT. Las asociaciones son documentales y no se propagan a reediciones, packs ni secuelas. La referencia de Heart of Darkness compara ambos pares; no convierte una caja fotografiada en española por el idioma de sus discos.

El informe `data/research/spinecard-documentary-integration-20260911.json` conserva los hashes del paquete original y de los archivos integrados. Cada documento distingue la fecha de lectura de las fuentes (8 de septiembre) de la revisión de vínculos (11 de septiembre). El paquete histórico no se modifica.

## Verificación y alcance

Las regresiones comprueban el lector real de PS1, la separación por códigos, los casos negativos de otras regiones y reediciones, el lector Python y el contenido del paquete de sincronización. Una prueba del engine usa su lector real con respuestas de IA simuladas para comprobar que el conocimiento entra exclusivamente después de la observación.

Esto incorpora conocimiento documental consultable. No entrena pesos ni mide una nueva precisión visual. El trabajo local y congelado del worker eBay V2 y sus muestras reservadas se mantienen fuera de este cambio.
