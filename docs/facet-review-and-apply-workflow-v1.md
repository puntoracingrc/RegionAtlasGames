# FACET_REVIEW_AND_APPLY_WORKFLOW_V1

## Estado

Implemented, admin-only.

Esta fase añade un flujo de revisión para pasar de facetas sugeridas o incompletas a facetas aplicadas en fichas reales, sin asignaciones masivas automáticas.

## Objetivo

Permitir que admin revise juegos con huecos de clasificación y aplique:

- subgéneros controlados;
- facetas controladas;
- sugerencias derivadas de tags o géneros existentes;
- cambios en modo añadir o reemplazar.

## Archivos

- `src/lib/admin-facet-review.ts`
- `src/app/api/admin/facet-review/route.ts`
- `src/components/admin/admin-facet-review-panel.tsx`
- `src/app/admin/facetas/page.tsx`
- `scripts/validate-facet-review-and-apply-workflow-v1.mjs`

## Reglas

- Solo acepta entidades que existan en `data/game-facets-taxonomy.json`.
- No crea entidades desde texto libre.
- No aplica cambios sin acción explícita del admin.
- No toca `data/game-details.json` durante la validación.
- En local puede escribir disco si `canWriteCatalogFiles()` lo permite.
- En producción aplica por overlay, igual que el editor de ficha.

## No incluido

- No aplica facetas a los 36.000 juegos.
- No crea landings SEO nuevas.
- No cambia reglas de IA.
- No modifica la fase 2 de enriquecimiento.

## Siguiente fase recomendada

`FACET_COVERAGE_DASHBOARD_V1`: ampliar métricas de calidad, detectar entidades saturadas, revisar juegos sin señales y preparar lotes de trabajo por plataforma/saga/compañía.
