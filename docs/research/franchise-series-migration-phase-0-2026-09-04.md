# Migración franquicias/sagas — Fase 0

Base auditada: `e69fb94f72ca51080eb6c5abcee47a9099e57524`.

## Estado congelado

- 59.626 fichas de catálogo; 57.550 no excluidas.
- 4326 compañías indexadas.
- 427 agrupaciones legacy.
- 2718 fichas declaran `details.series`; 2963 fichas únicas están en el índice efectivo.
- Overlay administrativo incluido: sí.

## Clasificación conservadora

- Franquicias seguras: 8.
- Sagas/subseries seguras: 7.
- Ambiguas, sin migración destructiva: 412.
- Franquicias nuevas sin redirect legacy: 1.

Las decisiones seguras proceden exclusivamente de los casos aprobados en la especificación. El resto permanece legacy; no se usa coincidencia de título como fuente de verdad.

## Consumidores

La búsqueda reproducible encontró 338 coincidencias en 58 archivos. El detalle exacto, con línea y patrón, está en `consumer-audit.json`.

## Bloqueos previos a escritura canónica

1. Incorporar el overlay administrativo de Production al snapshot final.
2. Mantener la discrepancia de `details.series` identificada y no ocultarla con la migración.
3. Demostrar por checksum que IDs, URLs y compañías no cambian.
4. Aplicar únicamente las decisiones `high`; todo `ambiguous` conserva su URL y membresía.

## Semántica de identificadores y rollback

En los ficheros persistidos de esta migración, `gameId` es el `catalog_id` existente de una ficha/edición catalogada. No representa una obra lógica futura. `rollback-manifest.json` conserva hashes de la base, membresías legacy y contenido editorial para volver al lector anterior sin tocar el catálogo.
