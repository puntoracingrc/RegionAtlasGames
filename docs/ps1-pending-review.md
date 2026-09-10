# PS1: navegación y revisión de fichas pendientes

Revisión del 10 de septiembre de 2026 sobre el catálogo regional V2 de `351ec0a`.

El catálogo de PS1 tiene 8.123 ediciones documentadas y 2.311 fichas pendientes. La revisión agrupa siete nombres repetidos en los listados, por lo que la opción **Incluir fichas pendientes** incorpora 2.304 entradas. Las siete direcciones agrupadas siguen resolviendo su ficha original; no se eliminan IDs, precios, datos de colección ni URLs.

## Relaciones documentadas

391 fichas pendientes tienen una relación de obra documentada con ediciones regionales resueltas. Sus páginas muestran enlaces visibles con portada, región, códigos e idiomas; las primeras cuatro priorizan España, la misma familia regional y la disponibilidad de portada. El resto permanece accesible mediante un desplegable.

La relación de obra no confirma que la caja de la ficha pendiente corresponda a una edición concreta. Los candidatos obtenidos solo por similitud de título no entran en `relatedPs1Editions`, ni se trasladan sus portadas al campo `coverUrl` de la ficha pendiente.

## Variantes

| Familia | Fichas revisadas | Con referencia explícita de embalaje | Sin referencia explícita |
| --- | ---: | ---: | ---: |
| Platinum | 161 | 75 | 86 |
| Greatest Hits | 169 | 45 | 124 |
| Long Box | 93 | 10 | 83 |
| Total | 423 | 130 | 293 |

La revisión busca títulos de la misma familia regional y exige que la galería etiquete expresamente la gama o formato de caja en una portada o contraportada. Recupera también material Long Box clasificado como escaneo de papel de caja y omitido de la galería general. No se infiere Long Box solo por la proporción de una imagen.

124 fichas tienen alguna referencia ya alojada y otras seis permiten consultar la referencia en la fuente. Las imágenes se presentan en un apartado para comparar, con procedencia y mercado indicado por la fuente. Las 423 siguen con `physicalVariantResolved: false`: falta contrastar el conjunto concreto de caja, lomo, manual y discos. No se descargan ni publican imágenes nuevas en este cambio.

`data/ps1-variant-review.json` contiene los 423 registros, referencias, candidatos de investigación y requisitos pendientes. Se genera sin red mediante:

```sh
python3 scripts/ps1-regional/build_pending_review.py
python3 scripts/ps1-regional/build_pending_review.py --check
```

## Los once grupos de posibles duplicados

`data/ps1-catalog-curation.json` recoge la decisión y sus fuentes para las 22 fichas:

- Se agrupan nombres de FIFA 2002 / FIFA Football 2002, Gex 3D, Shadow Master, Starfighter 3000, NBA Fastbreak '98, Donpachi y Koneko mo Issyo. Esta agrupación afecta a la navegación y a las búsquedas por nombres alternativos; no declara equivalencia de edición física.
- Pool Shark / Actua Pool se conservan separados: las publicaciones documentadas usan SLES-01537 y SLES-01647, y la referencia heredada de Actua Pool contradice su título. [Fuente](https://psxdatacenter.com/games/P/P/SLES-01537.html).
- 1Xtreme / ESPN Extreme Games se conservan separados: hay una reedición Greatest Hits con cambios de licencia y contenido pese al código compartido. [Fuente](https://psxdatacenter.com/games/U/E/SCUS-94503.html).
- Lunar genérico / 4 Disc se conservan separados hasta contrastar caja y extras. El CD de audio no se contabiliza entre los tres códigos de software documentados. [Fuente](https://psxdatacenter.com/games/U/L/SLUS-00628.html).
- Resident Evil 3 genérico / 2 Disc se conservan separados: las primeras copias podían incluir el disco de demos de Capcom con Dino Crisis. El código del juego no demuestra la presencia de ese extra. [Fuente](https://psxdatacenter.com/games/U/R/SLUS-00923.html).

## Contrato de navegación y engine

La política común de los listados está en `src/lib/catalog-review-policy.ts`. La plataforma, el catálogo general, los navegadores de género/faceta y las dos APIs públicas aplican el mismo filtro. `includePending=1` habilita las pendientes; `pendingEdition=platinum|greatest-hits|long-box|other` permite revisarlas por separado. La API devuelve `reviewCounts` independiente de la paginación y de la subfamilia seleccionada, aplicando los restantes filtros activos.

El catálogo autoritativo, los perfiles regionales V2, las obras, los aliases de IDs y las redirecciones permanecen idénticos. El worker y el escáner no deben utilizar una agrupación de nombres o una referencia de esta cola para aprobar una región, edición, precio o pareja de componentes. Las fuentes y la incertidumbre están conservadas para una futura integración coordinada.

## Verificación

- Pruebas de política: separación de recuentos, opt-in, filtros de variantes, conservación de las 22 URLs, búsquedas por nombres alternativos, 391 relaciones documentadas y cuarentena de portadas.
- Pruebas regionales V2 y regresiones de escáner, navegación regional, aliases y redirecciones.
- Reproducción de los 26 archivos de la migración y de la cola de variantes, sin diferencias.
- Verificación en navegador y comprobación de imágenes alojadas, registradas en el informe de entrega de esta tarea.
