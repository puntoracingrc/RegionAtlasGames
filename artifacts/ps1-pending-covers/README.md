# Recuperación de portadas PS1 pendientes — 10 septiembre 2026

El usuario ha indicado que las imágenes que ya están en el SFTP se mantienen allí y que solo el contenido que no pudo entrar por falta de capacidad debe publicarse mediante Git y el despliegue normal de Region Atlas.

## Resultado del archivo

- Referencias objetivo: 8,392 (8.094 en cola y 298 fallos de escritura del SFTP).
- Archivos nuevos únicos: 8,332, 3,150,659,379 bytes.
- Lotes de Git: 10, cada uno de un máximo de 350 MB.
- PAL: 2,751; NTSC USA: 1,266; NTSC Japón: 4,315 archivos.
- Referencias reutilizadas sin duplicar su contenido: 43.
- Referencias gráficas incorporadas a perfiles: 7,675, en 3,593 fichas.
- Portadas principales antes vacías que se han completado: 2,207.
- Referencias recuperadas como miniatura: 253; se identifican como tal y no se eligen como portada principal.
- Referencias aún no disponibles en origen: 2.

Las imágenes se conservan con sus bytes originales, se deduplican por SHA-256 y se guardan en `/catalog-covers/ps1/galeria/{pal,ntsc-u,ntsc-j}/`. Los nombres incluyen título, código y cara; un prototipo sin código comercial se identifica como `sin-codigo`.

Se conserva la atribución a PSX Datacenter, junto con la página de juego y la referencia exacta de cada imagen. La fecha de descarga no se interpreta como evidencia de que una caja, disco y manual formen un conjunto físico original.

## Protección del catálogo y del SFTP

No hay escrituras, borrados ni renombrados en el SFTP. Todos sus archivos y asignaciones existentes se mantienen. La limpieza de espacio queda pospuesta por el usuario.

Los únicos renombrados de archivos existentes corresponden a cuatro imágenes de Ms. Pac-Man que ya estaban en Git. Se conservan sus cuatro URLs antiguas mediante redirecciones permanentes. Las URLs de las fichas no cambian.

La asignación de una portada principal nueva exige ficha regional resuelta, código exacto, un único mercado coincidente y una sola portada estándar. Las reediciones y alternativas se conservan en los datos documentales y la galería sin sustituir la portada principal. Las miniaturas quedan excluidas de la selección automática.

La verificación compara las 77.399 filas del catálogo y todos los perfiles PS1 con el commit previo `cbb09eed8740cec618012ed9e1998b5668ec60f3`: identificadores, regiones, idiomas, fechas, precios, códigos, fuentes y URLs de fichas deben permanecer iguales. La reproducción de la migración regional mantiene sus comprobaciones originales y añade una segunda fase reproducible para recuperar las imágenes.

## Evidencias

- `assets.json.gz`: archivos nuevos, nombres, tamaños y hashes.
- `source-results.json.gz`: resultado de cada referencia y procedencia.
- `integration.json.gz`: asignaciones exactas a galerías y portadas.
- `integration-verification.json`: comparación completa del catálogo y comprobación de cada archivo nuevo.
- `visual-source-verification.json`: alcance y observaciones de tres imágenes inspeccionadas.
- `base-patch.json.gz`: restauración sellada de los dos archivos de datos para reproducir la migración original y la recuperación posterior.
- `summary.json`: recuentos del archivo.

Las pruebas, lotes publicados y comprobaciones HTTP de Preview y producción se conservan fuera del worktree en `/Users/macbookpro14/Documents/New project 2/research/ps1-pending-covers-git-2026-09-10/`. El estado de entrega definitivo consta en `release-status.json` de esa carpeta.

## Referencias no recuperadas

- https://psxdatacenter.com/images/covers/P/G/SLES-01714/SLES-01714-B-F+G+I.html — HTTP 404
- https://psxdatacenter.com/images/thumbs/P/R/SCES-01922/SCES-01922-B-S+P+Gr+E.jpg — HTTP 404
