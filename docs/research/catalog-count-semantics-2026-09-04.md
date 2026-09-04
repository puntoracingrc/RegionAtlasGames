# Semántica pública de los contadores del catálogo

Fecha: 2026-09-04  
Base auditada: `65ee15f9f8b137b0477d74f20a66138a97407b4e`

## Hallazgo

Los valores históricos `gameCount`, `games.length` y los recuentos por rol o plataforma miden
fichas identificadas por `catalog_id`. Una misma obra puede aportar varias fichas por plataforma,
región o edición. Estos valores no son un recuento de obras únicas.

## Contrato aplicado

- En la capa pública, el recuento se llama `catalogEntryCount`.
- Los recuentos por rol se llaman `developerCatalogEntryCount` y
  `publisherCatalogEntryCount`.
- Los desgloses por plataforma, precio y alto valor también declaran expresamente que cuentan
  fichas.
- La interfaz usa `1 ficha` y `N fichas`, con pluralización centralizada.
- `IndexEntry.gameCount`, `CatalogMeta.catalogListed`, `listedByPlatform` y
  `gamesWithDetails` se conservan para compatibilidad interna y quedan documentados como
  recuentos de `catalog_id`.
- Los valores de query existentes `games-desc` y `games-asc` se conservan para no romper URLs o
  estado guardado; sus rótulos públicos pasan a «Más fichas» y «Menos fichas».
- Los recuentos auxiliares de los filtros de plataforma y género miden compañías coincidentes,
  no fichas: su contrato público usa `companyCount` y la interfaz los identifica como compañías.

## Antes y después

| Superficie | Antes | Después |
| --- | --- | --- |
| Cabecera de compañía | `312 juegos en el catálogo` | `312 fichas en el catálogo` |
| Rol de compañía | `106 como desarrolladora` | `106 fichas como desarrolladora` |
| Tarjeta de compañía | `490 juegos` | `490 fichas` |
| Filtro de tamaño | `200 o más juegos` | `200 o más fichas` |
| Filtro de plataforma de compañías | `PS4 (2054)` | `PS4 (2054 compañías)` |
| Saga | `49 títulos` | `49 fichas` |
| Género | `12.154 juegos` | `12.154 fichas` |
| Plataforma | `8.496 títulos listados` | `8.496 fichas catalogadas` |
| Resultados | `48 resultados` | `48 fichas` |
| Portada pública | `Juegos` | `Fichas catalogadas` |

## Superficies auditadas

- Índices y fichas de compañías, sagas, géneros y etiquetas.
- Tarjetas, filtros de tamaño, opciones de orden y métricas por función.
- Desgloses por plataforma y compañías relacionadas.
- Catálogo general, catálogo de plataforma y paginación compartida.
- Metadatos generados de compañías y géneros.
- Accesibilidad de los rótulos numéricos visibles.
- JSON-LD y sitemap: no contienen recuentos ambiguos en estas entidades; sus URLs y estructura
  no cambian.

Los textos editoriales que hablan de videojuegos como concepto se mantienen. No se ha hecho un
reemplazo global de la palabra «juego».

## Corte de esta PR

La comparación entre la base `65ee15f9f8b137b0477d74f20a66138a97407b4e` y el HEAD
de la PR confirma para este corte:

- 59.626 fichas antes y después;
- 59.626 IDs únicos antes y después;
- 4.326 compañías antes y después;
- `data/catalog.json` sin cambios;
- `data/index/companies.json` sin cambios;
- cero cambios en IDs, URLs, portadas, precios o créditos, al no existir cambios en los datos
  que contienen esos campos.

La comprobación reproducible es:

```bash
git diff --exit-code 65ee15f9f8b137b0477d74f20a66138a97407b4e -- \
  data/catalog.json data/index/companies.json
```

El comando termina con código `0`. Además, los blobs Git de la base y de la rama coinciden
exactamente: `data/catalog.json` es `8ecde38c6dbbd2729ad92723be9662fb8a0f0c8a` y
`data/index/companies.json` es `131114090dacc8e35492deb1b551184524b9fbd4` en ambos
extremos.

Estas cifras documentan la ausencia de mutaciones de datos en esta PR. No son restricciones
permanentes de producto ni se incluyen como igualdades en la suite global.

## Verificación reproducible

`npm run test:catalog-count-semantics` comprueba:

- que el catálogo existe y todos sus IDs son válidos y únicos;
- que el número de IDs únicos coincide dinámicamente con el número de fichas;
- que el índice de compañías existe, tiene entradas válidas y solo referencia IDs del
  catálogo;
- paridad entre `meta.catalogListed` y las fichas públicas no excluidas;
- ausencia de campos de conteo ambiguos en DTO y componentes públicos;
- pluralización española;
- coherencia entre fichas, roles y plataformas para Square Enix, Activision y Nintendo;
- una saga con varias plataformas y regiones;
- un género y sus metadatos;
- rótulos semánticos de filtros y orden.

El script informa los tamaños actuales calculándolos en tiempo de ejecución. Añadir una ficha
o una compañía válida no exige editar la prueba.

## QA local

La compilación de producción se sirvió localmente y se comprobó en escritorio
(`1440 × 1000`) y móvil (`390 × 844`).

- Rutas revisadas: `/compania`, `/compania/square-enix`, `/compania/activision`, `/saga`,
  `/saga/call-of-duty`, `/genero`, `/genero/action`, `/etiqueta` y
  `/etiqueta/pixel-art`.
- No se detectaron errores de consola, imágenes rotas ni desbordamiento horizontal.
- Se corrigieron las restricciones de anchura del navegador de géneros y etiquetas para que
  sus controles se ajusten a 390 px sin alterar el contenido.
- Los metadatos de Square Enix y del género Acción expresan el total como fichas y mantienen
  sus canonical de producción.
- La API pública de compañías expone `catalogEntryCount` y los recuentos explícitos por rol,
  precio, valor y plataforma; no devuelve los nombres ambiguos anteriores.
- Los filtros de plataforma y género muestran expresamente que sus cifras corresponden a
  compañías.

## Fuera de alcance

- No se crea `game_work` ni se agrupan o deduplican títulos.
- No cambian datos, IDs, URLs, precios, portadas, créditos, personas, sagas o franquicias.
- No se modifica ni se rebasa la PR #175.

## Implicación para la PR #175

Al actualizarse sobre este `main`, la capa pública de franquicias deberá exponer
`catalogEntryCount` para sus métricas. Puede seguir leyendo `IndexEntry.gameCount` como dato
legacy interno, siempre que lo adapte antes de presentarlo. Esta PR no altera su modelo ni sus
datos.
