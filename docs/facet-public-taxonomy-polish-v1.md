# FACET_PUBLIC_TAXONOMY_POLISH_V1

## Estado

Implemented.

Esta fase pule la navegación pública de `/genero` para que la taxonomía controlada sea útil y no muestre grupos vacíos.

## Objetivo

- Evitar grupos públicos sin entidades.
- Ordenar familias de facetas con nombres editoriales claros.
- Mantener `searchAliases` invisibles en UI, pero usarlos en la búsqueda interna de la página.
- Mantener enlaces existentes: géneros a `/genero/...`, subgéneros/facetas a `/etiqueta/...`.

## Archivos

- `src/lib/game-taxonomy-groups.ts`
- `src/components/game-taxonomy-group-browser.tsx`
- `scripts/validate-facet-public-taxonomy-polish-v1.mjs`

## Reglas

- No crea rutas nuevas.
- No cambia slugs.
- No muestra `searchAliases` como etiquetas públicas.
- No modifica asignaciones ni fichas.

## Cierre

Con esta fase, la capa pública de facetas queda preparada: listados, búsqueda interna, fichas enlazadas y conteos.
