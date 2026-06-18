# FACET_CATALOG_SEARCH_INTEGRATION_V1

## Estado

Implemented.

Esta fase conecta las facetas ya guardadas en ficha con la búsqueda del catálogo.

## Objetivo

Que el buscador encuentre juegos por:

- `genres`;
- `subgenres`;
- `facets`;
- `tags`;
- aliases editoriales;
- `searchAliases` invisibles.

Ejemplos esperados:

- `tipo Dark Souls` puede encontrar juegos clasificados como `Soulslike`.
- `survival horror` puede encontrar juegos con ese subgénero.
- `cooperativo` puede encontrar juegos con esa faceta o tag controlado.

## Archivos

- `src/lib/catalog-search-aliases.ts`
- `src/lib/catalog-list-game.ts`
- `scripts/validate-facet-catalog-search-integration-v1.mjs`

## Reglas

- No modifica datos.
- No asigna facetas.
- No crea landings.
- Solo amplía el texto normalizado de búsqueda.
- Los `searchAliases` siguen siendo invisibles en UI.

## Siguiente fase recomendada

`FACET_COVERAGE_DASHBOARD_V1`: ampliar métricas y cola admin para entender cobertura por plataforma, género y tipo de entidad.
