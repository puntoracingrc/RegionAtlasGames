# Auditoría de imágenes de Historia de plataformas · 2026-09-15

## Alcance y punto de partida

La página pública mostraba 33 historias: Nintendo (14), Sony (6), Microsoft (4), Sega (5) y SNK (4). Nueve tarjetas publicadas no tenían arte local: Game & Watch, Game Boy Advance, Virtual Boy, Wii U, Xbox, Xbox 360, Xbox One, Xbox Series X|S e Hyper Neo Geo 64. PlayStation 4 tampoco aparecía como historia, aunque ya existían una imagen local y un informe editorial completo aportado por el usuario.

No había un PR abierto de Historia de fabricantes con el que coordinar esta edición. Los PR abiertos de juegos PS4 afectan al catálogo y no comparten los archivos de este corte. La incorporación de PS4 queda en un commit separado para que pueda revisarse independientemente de la cobertura gráfica.

## Cambios de este corte

| Plataforma | Acción | Modelo representado | Resultado |
| --- | --- | --- | --- |
| Game & Watch | Imagen nueva | Ball (1980) | Correcta, transparente, proporción conservada |
| Game Boy Advance | Imagen nueva | GBA original Indigo | Correcta, transparente, proporción conservada |
| Super Nintendo | Sustitución | SNES PAL europea SNSP-001 | Corrige el modelo norteamericano gris/morado anterior |
| Virtual Boy | Imagen nueva | Conjunto norteamericano | Correcta; excepción regional porque no tuvo lanzamiento europeo |
| Wii U | Imagen nueva | Consola blanca y Wii U GamePad | Correcta, transparente, proporción conservada |
| Xbox | Imagen nueva | Xbox original | Correcta, transparente, proporción conservada |
| Xbox 360 | Imagen nueva | Xbox 360 Pro/Premium de lanzamiento | Correcta, transparente, proporción conservada |
| Xbox One | Imagen nueva | Xbox One de lanzamiento, mando y Kinect | Correcta, transparente, proporción conservada |
| Xbox Series X|S | Imagen nueva | Series X y Series S con mandos | Representa las dos configuraciones de la misma generación |
| Hyper Neo Geo 64 | Imagen nueva | Placa arcade Hyper Neo Geo 64 | Fuente exacta; el fondo blanco se conserva porque el original es JPEG |
| PlayStation 4 | Historia e imagen documentada | PS4 original con DualShock 4 | Sustituye el recurso heredado sin procedencia; la historia aparece entre Vita y PS5 |

Todas las tarjetas usan `object-contain`, tamaños por plataforma y texto alternativo identificativo. La imagen de Hyper Neo Geo 64 recibe un fondo blanco discreto para que el JPEG no choque con los dos temas. Los diez PNG nuevos o sustituidos se entregan como WebP y pasan de unos 4,1 MB a menos de 480 KB en conjunto.

## Fuentes y derechos de los archivos nuevos o sustituidos

Los detalles de autoría, licencia, modelo y modificación se conservan en `public/platform-consoles/ATTRIBUTION.md`. Las fuentes son fichas de Wikimedia Commons con licencia compatible o dedicación al dominio público:

- Game & Watch: CC BY-SA 2.0.
- GBA, Virtual Boy, Xbox, Xbox 360 y Xbox One: dominio público por Evan-Amos; algunas fichas incluyen una extracción transparente documentada.
- SNES PAL, Wii U e Hyper Neo Geo 64: CC BY-SA 3.0.
- Xbox Series X|S: CC BY 4.0.

## Revisión de las imágenes que ya existían

Se inspeccionaron visualmente los 28 archivos previos. La identidad de consola, proporción y recorte resultan coherentes en 3DS, Dreamcast, DS, Game Boy, GameCube, Game Gear, Master System, Mega-CD, Mega Drive PAL, Nintendo 64, Neo Geo AES, Neo Geo AES Plus, Neo Geo CD, Neo Geo Pocket Color, NES, PS1, PS2, PS3, PS4, PS5, PSP, PS Vita, Saturn, Sega 32X, Wii, Switch y Switch 2. SNES era la excepción material y se reemplazó por la consola PAL europea.

PSP y PS Vita ya tenían procedencia y licencia registradas. SNES y PS4 se han sustituido por fuentes documentadas. Para los otros 24 archivos heredados no se encontró metadata de autoría o licencia en el repositorio ni en los commits que los introdujeron. La revisión visual confirma el hardware, pero no permite certificar derechos. Es un pendiente de procedencia y debe resolverse con sustitución documentada o con la fuente original antes de declarar la biblioteca histórica completa desde el punto de vista legal.

## Resumen PS4

El nuevo registro de PS4 deriva exclusivamente del informe completo facilitado por el usuario y de sus fuentes oficiales. Incluye lanzamiento regional, arquitectura AMD y memoria GDDR5, responsables públicos ya existentes, estudios internos y socios independientes con sus intervalos, modelos CUH, DualShock 4, PlayStation Camera, PlayStation VR, servicios, juegos, hitos y legado. La adquisición de Insomniac en 2019 no se aplica de forma retrospectiva a sus juegos anteriores.

No se crean perfiles personales, retratos ni candidatos internos adicionales en este corte. Esa ampliación detallada del informe queda separada para no mezclar investigación de personas con el objetivo visual y el resumen de plataforma solicitado.

## Validación requerida antes de revisión humana

- Validación de JSON y referencias internas.
- Pruebas de Historia de plataformas, incluida la nueva cobertura PS4 y la presencia de una imagen por historia.
- Typecheck y lint.
- Build de producción.
- QA visual en escritorio y móvil, temas claro y oscuro, tanto en el índice como en PS4.
- Preview separado; no fusionar sin revisión humana.
