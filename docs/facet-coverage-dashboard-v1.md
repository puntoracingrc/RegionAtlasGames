# FACET_COVERAGE_DASHBOARD_V1

## Estado

Implemented, admin-only.

Esta fase amplía `/admin/facetas` con métricas de cobertura para decidir qué revisar primero.

## Objetivo

Mostrar en admin:

- porcentaje de juegos con subgéneros;
- porcentaje de juegos con facetas;
- juegos completos y vacíos;
- plataformas principales por cobertura;
- subgéneros más usados;
- facetas más usadas.

## Archivos

- `src/lib/admin-facet-review.ts`
- `src/components/admin/admin-facet-review-panel.tsx`
- `scripts/validate-facet-coverage-dashboard-v1.mjs`

## Reglas

- Solo lectura para métricas.
- No modifica `data/game-details.json`.
- No aplica facetas automáticamente.
- Reutiliza el panel de revisión existente.

## Siguiente fase recomendada

`FACET_PUBLIC_TAXONOMY_POLISH_V1`: limpiar la navegación pública de taxonomía, separar mejor subgéneros/facetas y evitar grupos vacíos o poco útiles.
