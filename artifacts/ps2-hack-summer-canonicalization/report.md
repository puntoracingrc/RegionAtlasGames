# PS2 `_summer##` + `.hack` — auditoría en curso

Fecha: 2026-09-23. Orden de referencia: `regionatlas_ps2_hack_summer_codex_pack (1).zip`.

## Recuento corregido

El objetivo conceptual es **11 entidades de nivel superior: 9 works de juego y 2 productos `COMPILATION`**. Las 18 familias/tarjetas propuestas son un objetivo de presentación, no una orden para ocultar productos físicos legítimos.

## Estado inicial contrastado

- `before.json` conserva 45 filas PS2 estáticas del alcance, con IDs, rutas, seriales y todos los campos de precio existentes. La consulta pública con `includePending=1` devuelve 32 tarjetas relacionadas con `.hack` y 3 de `_summer##`; estos números no son directamente comparables con las 18 familias objetivo porque incluyen filas pendientes, una demo y un objeto complementario.
- La API pública muestra las 3 familias de `_summer##` (Standard, First Print Limited y Best). La Best existe en el overlay de Admin como `ps2-japon-summer-jp-best-version` y no en `data/catalog.json`.
- G.U. Vol.2 ya tiene un grupo público runtime que vincula la edición japonesa y la estadounidense. El resto de la tetralogía y G.U. aún muestra tarjetas regionales separadas. No se debe sobrescribir esa agrupación viva basándose solo en el catálogo estático.
- `ps2-jp-slps-73233-playstation-2-the-best` se muestra hoy como una Best individual de Quarantine. La fuente de investigación la identifica como el segundo disco del producto `.hack//Vol. 3 x Vol. 4`, de EAN `4543112415332`. Se conserva su ID y su ruta durante la reconciliación.
- `ps2-usa-hack-infection` contiene precios legacy (incluido `recommendedPrice: 25.42`); no se han modificado. Ningún precio se ha publicado ni movido.

## Imágenes

- Se copiaron, sin borrar los originales, 11 archivos front/back o front exactos identificados por el manifest del paquete: 6 de `_summer##`, 2 de Infection JP, 1 front de Infection US y 2 de la compilación Vol.1 x Vol.2.
- Se apartaron 5 front PAL de Infection en `images/hack-original/infection-pal-unassigned/`; no se asignaron a ES, FR, DE, IT ni otro país sin EAN.
- `image-manifest.json` recoge SHA-256 de los 16 archivos copiados, originales, mercado, serial, EAN y estado. Los 22 productos que todavía requieren scans externos permanecen `PENDING_REVIEW`.

## Mapa de identidad, todavía no aplicado

`mapping-old-to-canonical.json` clasifica las 45 filas: 21 coincidencias sustentadas por serial, 19 asociaciones de título cuya identidad física sigue sin demostrar, 2 títulos de compilación pendientes de enlace al producto físico, 1 fila `SLPS-73233` que requiere un puente de compatibilidad y 2 objetos fuera de los 9 works de juego. La Best de `_summer##`, que vive solo en el overlay de Admin, figura por separado. Ninguna fila `INT` se ha convertido en una nueva caja ni se ha redirigido; su identidad exacta queda pendiente.

## Incidencia reproducida al subir front/back por Admin

La ficha existente de `_summer##` ya contenía Standard y First Print Limited; la Best está en el overlay. Se probaron las seis imágenes originales del repositorio con la ruta de Admin. La ruta anterior pasaba `catalogId` a `uploadCoverToCdn`, cuyo `buildCoverFileSlug` prioriza ese ID sobre el `slug` que contiene papel y versión. Para Standard y Best, front y back terminaban en la **misma URL**. El segundo archivo sobrescribía al primero y la galería pública solo mostraba `1 de 1`. Por eso una respuesta exitosa de Admin no demuestra que ambas caras hayan quedado publicadas.

Se añadió una corrección mínima a la ruta de subida para generar rutas distintas e inmutables por `catalogId`, papel y versión, más un test de regresión. **No está desplegada**: ninguna de las seis parejas se declara verificada en producción. No volver a subir las contraportadas de Standard o Best a la ruta antigua. La Limited conserva front y back con URL distintas, pero también requiere comprobación pública final.

## QA ejecutado

- 61 tests de imágenes físicas, rutas CDN, overlay y guías V2: correctos. El primer intento en el checkout disperso no tenía los assets `public/` requeridos por cuatro pruebas de integridad; tras incorporar esa carpeta al worktree, las 61 pasaron.
- ESLint de los tres archivos de código cambiados: correcto.
- Typecheck: correcto con `NODE_OPTIONS=--max-old-space-size=8192`; el primer intento con el límite de memoria por defecto agotó el heap.
- Build de Next.js: correcto (296 páginas estáticas generadas).
- QA visual final, rutas/aliases regionales, conteo 11/18 y colección: **pendientes**, porque aún no se ha aplicado una migración canónica completa.

## Condiciones de parada y trabajo pendiente

- `SLPS-73233` se ofrece actualmente como Quarantine Best individual aunque la investigación lo sitúa dentro del producto de dos discos `.hack//Vol. 3 x Vol. 4`. Absorberlo sin resolver ruta y collection identity violaría la regla de conservación.
- Las 19 filas sin serial propio no pueden agruparse o redirigirse por similitud de título. Hay que contrastar cada identidad física o mantenerla como puente legacy explícito.
- Cinco front PAL de Infection no tienen EAN asignado; permanecen sin país. Los 22 productos sin scan externo exacto continúan `PENDING_REVIEW`.
- La ruta de Admin reparada debe integrarse y desplegarse; después, volver a subir y verificar front/back de Standard y Best en URL separadas.
- No se han editado `data/catalog.json`, guías V2, precios, aliases ni redirects. La auditoría no constituye la migración de los 9 works + 2 compilaciones y no debe anunciarse como tal.
