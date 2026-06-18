# FACET_PUBLIC_TAG_INDEX_V1

## Estado

Implemented.

Esta fase hace que `/etiqueta` sea el índice público real de subgéneros y facetas controladas.

## Objetivo

- Reutilizar la taxonomía pública ya agrupada.
- Excluir géneros principales de `/etiqueta`.
- Mantener `/genero` como vista completa de géneros + taxonomía.
- Mantener `/etiqueta/[slug]` compatible con tags antiguos y facetas nuevas.

## Archivos

- `src/app/etiqueta/page.tsx`
- `scripts/validate-facet-public-tag-index-v1.mjs`

## Reglas

- No elimina compatibilidad con tags antiguos.
- No crea rutas nuevas.
- No modifica datos.
