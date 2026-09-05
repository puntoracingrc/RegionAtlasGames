# PS4 PAL - altas HIGH de creditos de companias

Fecha de revision: 2026-09-05

## Separacion de fases

- Base de la primera PR: `2ab671e1e974ef627434edd2ab3d2a2aec2e7468`.
- HEAD de la primera PR y base de esta fase: `2fe23bbaf0980b68b0ecc4ca8388a03c6cd38464`.
- Esta fase solo contiene altas HIGH en campos vacios y depende de la primera PR.
- El HEAD final de la segunda PR se registra en GitHub tras crear el commit, evitando una referencia circular dentro del propio commit.

## Resultado

- 2397 candidatos HIGH iniciales.
- 749 altas aplicadas: 591 desarrolladoras y 158 publishers fisicos.
- 657 fichas afectadas; 92 reciben ambos campos.
- 1428 RETAIN documentados sin reescritura.
- 100 sustituciones HIGH bloqueadas.
- 126 relaciones bloqueadas por identificador o titulo.
- Cero propagaciones, sustituciones HIGH, entidades nuevas o cambios en catalog.json.

## Cola residual

- 3382 fichas pendientes, ordenadas por prioridad, obra provisional y catalog_id.
- COMPANY_ENTITY_UNRESOLVED: 693
- COMPOSITE_CREDIT: 84
- HIGH_REPLACEMENT_CONFLICT: 97
- IDENTIFIER_OR_TITLE_CONFLICT: 225
- MISSING_BOTH_CORE_ROLES: 1785
- MISSING_DEVELOPER: 185
- MISSING_PHYSICAL_PUBLISHER: 831
- MULTIPLE_HIGH_COMPANIES: 66
- MULTI_PRODUCT_REVIEW: 163
- SOURCE_FETCH_FAILED: 99

## Verificacion

- Comparador semantico: PASS.
- Typecheck: PASS.
- Lint: PASS, 0 errores y 35 advertencias preexistentes.
- Pruebas unitarias: 217/217 PASS.
- Semantica de conteos: 7/7 PASS.
- Controles de colectores: PASS.
- Ofertas afiliadas: PASS.
- Build: PASS.
- QA local: 20/20 rutas en 1440x1000 y 390x844; 0 imagenes rotas, 0 errores de consola y 0 desbordamientos.
- QA de Preview: pendiente del deployment del HEAD de la PR.

Incidencia previa fuera de alcance: la portada ya existente de `Asterix & Obelix XXL: Romastered` muestra arte de Nintendo Switch. Este lote no modifica `catalog.json` ni portadas.
