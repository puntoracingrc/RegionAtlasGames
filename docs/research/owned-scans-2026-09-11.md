# Escaneos PAL España — 11 de septiembre de 2026

Se sustituyen las portadas de tres fichas existentes, conservando sus identificadores, URLs, variantes y precios:

| Ficha | Identificación del ejemplar | Imágenes ampliables |
| --- | --- | --- |
| Fortnite · PS4 | CUSA-07669; EAN 4020628781279; carátula ES/IT | 6: frontal, reverso, lomo, carátula completa y dos caras de los folletos |
| Resident Evil Requiem [Lenticular Cover] · PS5 | PPSA-31246; EAN 5055060993637; carátula ES/IT | 7: frontal de papel, reverso, lomo, carátula completa, lámina lenticular, caja con lámina y folleto |
| Assassins Creed Mirage Deluxe Edition · PS4 | EAN 3307216257806; referencia impresa de caja 300128688; textos españoles | 2: frontal y reverso del ejemplar precintado |

El propietario identifica los ejemplares como PAL España. Las observaciones de idioma se registran por componente. La caja de Fortnite imprime textos españoles e italianos y voces inglesas. Mirage imprime «Juego en castellano»; esa frase se conserva sin inventar un desglose de voces/textos. No se deduce un SKU de PlayStation a partir de la referencia numérica del embalaje.

La portada principal de Resident Evil es el frontal de papel del ejemplar lenticular; la lámina se etiqueta por separado, conservando la trama y oscuridad del ángulo escaneado. No se propagan sus imágenes a la edición estándar, a otras regiones o a títulos de nombre parecido. Mirage conserva el plástico, las marcas y los reflejos del precinto; no se afirma haber visto sus componentes interiores.

Los seis PNG finales iniciales y los dos PNG finales de Mirage se seleccionan mediante una lista cerrada de SHA-256. Se conservan los originales locales a 600 ppp. Los derivados publicados usan recortes rectangulares y WebP, sin reconstrucción generativa. Las tres redacciones de códigos de canje estaban integradas como píxeles opacos en los PNG aprobados. No se importan carpetas privadas, originales ni miniaturas con metadatos de las capturas.

El catálogo usa tres versiones de portada de 1400 px de alto y la galería miniaturas de hasta 600 px. Los enlaces de ampliación abren imágenes de hasta 3200 px. Todo se aloja en `public/catalog-covers/.../escaneos-propios/` mediante el despliegue habitual, sin nuevos archivos SFTP.

Fortnite tenía CUSA-07022 y EAN 5051892219037 por cruces documentales anteriores. Se sustituyen por los códigos legibles de este ejemplar, preservando las fuentes previas en los datos y el estado anterior en el informe de integración. Los overlays de precio mantienen sus valores actuales y no restauran una portada antigua sobre una sustitución revisada. Las etiquetas de los nuevos códigos indican que se han leído en el lomo, sin atribuir un país a partir de CUSA/PPSA.

Evidencias: `data/catalog-owned-scans.json`, `data/research/owned-scans/2026-09-11-assets.json` y `data/research/owned-scans/2026-09-11-integration.json`. Los informes públicos no contienen rutas privadas del ordenador. El importador reproduce los derivados recibiendo los dos manifiestos finales del escáner como argumentos.

Validación local: 18 pruebas de asociación, persistencia frente a overlays y hashes de archivos; comprobación de tipos y ESLint. La prueba de archivos recorre los originales publicados y sus miniaturas y rechaza metadatos EXIF/XMP. Se revisan en navegador las tres fichas y sus enlaces de ampliación; los resultados de despliegue y producción se conservan fuera del worktree temporal en el dossier local de integración.

## Segundo lote: Masacre / Deadpool y Fortnite Promo

Masacre (Deadpool) queda en una sola ficha española: `ps4-deadpool`, con su URL `/catalogo/deadpool-ps4-pal-es`. La copia del usuario ya enlazaba a ese ID. Se conserva el precio completo de 206,67 € y los créditos documentados de la antigua ficha localizada. `ps4-deadpool-masacre` se conserva como registro histórico excluido; su ID y URL redirigen al canónico. La edición USA permanece separada. Los lectores de colección, deseos, anuncios y ventas resuelven el alias sin eliminar ejemplares ni fotos. Los deseos repetidos conservan la fecha más antigua y los avisos ya vistos.

Se incorporan frontal y reverso del ejemplar precintado: EAN 5030917185991 y referencia del embalaje 77110206SP. La portada declara manual, textos de pantalla y subtítulos en castellano; el reverso añade «Playable in English». No se atribuye doblaje en castellano ni se abre el precinto. Se retira el BLES-01789 cruzado desde PS3 y se mantiene su fuente anterior en el historial; el CUSA queda sin confirmar.

Fortnite Promo Disc ya existía con la errata `ps4-fornite-ps4-promo`. Se completa ese registro y conserva `/catalogo/fornite-ps4-promo-ps4-pal-es`, aunque su mercado pasa a PAL por determinar. Es una variante promocional separada de Fortnite comercial: CUSA-07669, disco 8781071 y código 1022534LAPRM. Se añaden cinco imágenes: caja y disco, frontal de caja, etiqueta del disco, disco colocado y contraportada despejada con dos códigos de canje ocultos. La tabla del reverso incluye español entre los textos, pero no entre las voces. La etiqueta acredita desarrollo Epic Games, publicación Gearbox Publishing y distribución Koch Media; sustituye el crédito físico anterior basado únicamente en la web de Epic. No se verifican país, tirada, rareza, EAN ni fecha de distribución. Los idiomas son indicaciones impresas; no se ha ejecutado el software.

El lote completo contiene cinco portadas principales y 22 imágenes de galería. Los nombres de fichero se basan en el juego. Los originales del escáner se conservan localmente; la web publica derivados WebP sin metadatos privados.

Los tests históricos de investigación comparaban archivos completos contra el estado anterior a los escaneos. Se registran las modificaciones posteriores con sus hashes, seis IDs de catálogo y cinco índices de compañías. La verificación y reproducción de PS2 comprueban ese registro y utilizan sus entradas históricas exactas, restaurando siempre los archivos actuales. No se omiten comprobaciones ni se aceptan cambios fuera del registro.
