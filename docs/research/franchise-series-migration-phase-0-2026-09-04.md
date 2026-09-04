# Migración franquicias/sagas — Fase 0

Base auditada: `8a1b296359ed2108590067602e5c8d2442e57031`.

## Estado congelado

- 59.626 fichas de catálogo; 57.550 no excluidas.
- 4326 compañías indexadas.
- 427 agrupaciones legacy.
- 2718 fichas declaran `details.series`; 2963 juegos únicos están en el índice efectivo.
- Overlay administrativo incluido: sí.

## Clasificación conservadora

- Franquicias seguras: 8.
- Sagas/subseries seguras: 7.
- Ambiguas, sin migración destructiva: 412.
- Franquicias nuevas sin redirect legacy: 1.

Las decisiones seguras proceden exclusivamente de los casos aprobados en la especificación. El resto permanece legacy; no se usa coincidencia de título como fuente de verdad.

## Consumidores

La búsqueda reproducible encontró 328 coincidencias en 54 archivos. El detalle exacto, con línea y patrón, está en `consumer-audit.json`.

## Bloqueos previos a escritura canónica

1. Incorporar el overlay administrativo de Production al snapshot final.
2. Mantener la discrepancia de `details.series` identificada y no ocultarla con la migración.
3. Demostrar por checksum que IDs, URLs y compañías no cambian.
4. Aplicar únicamente las decisiones `high`; todo `ambiguous` conserva su URL y membresía.
