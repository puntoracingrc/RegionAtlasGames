# PS4 PAL - recopilatorios y créditos verificados

Lote: `company-credit-ps4-pal-compilations-2026-09-05`
Fuente: `RegionAtlas_PS4_PAL_recopilatorios_resueltos_2026-09-05.xlsx` (`f3e63293c80e30723a17f1447001fb2be3b7bc6a08c24808caad09f4035b52ef`)

## Resultado

- Fichas editoriales localizadas: 58.
- Recopilatorios documentados: 24; enlazados a ficha: 23.
- Componentes conservados: 82; enlaces exactos al catálogo: 42.
- Variantes relacionadas: 15 (13 verificadas; el resto conserva revisión física pendiente).
- Alias normalizados: 19.
- Relaciones corporativas verificadas: 6.
- Redirecciones permanentes seguras: 6.
- Casos bloqueados: 9.

## Acciones del dry-run

- ADD_COMPONENT: 82.
- ADD_CORPORATE_RELATION: 6.
- ADD_CO_DEVELOPER: 4.
- LINK_VARIANT: 13.
- MERGE_DUPLICATE: 2.
- MOVE_PLATFORM: 4.
- NORMALIZE_ALIAS: 19.
- REMOVE_GENERIC_NON_GAME: 1.
- REQUIRES_REVIEW: 9.
- UPDATE_CREDITS: 77.

## Invariantes

- Fichas: 73104 -> 73104.
- IDs únicos: 73104 -> 73104.
- IDs, slugs, plataforma, región, edición y URLs: conservados.
- Portadas y todos los campos de precio: conservados.
- Sin propagación a otras regiones, plataformas o títulos parecidos.
- catalogRowsPreserved: PASS.
- catalogIdsPreserved: PASS.
- catalogIdsUnique: PASS.
- urlInputsRegionsEditionsPreserved: PASS.
- coversAndPricesPreserved: PASS.
- detailsOnlyWorkbookScope: PASS.
- companiesOnlyCreditScope: PASS.
- noCrossRegionPropagation: PASS.
- allBlockedCasesRemainUnpublished: PASS.

## Casos no aplicados

- `playstation-vr-demo-disc-pal-europe`: No existe una ficha PAL Europa identificable; no se mezcla con el disco USA de 18 demos.
- `ps4-cyberpunk-2077-samurai-pack:physical`: La editora física depende del EAN concreto, ausente en la ficha.
- `ps4-observer-system-redux:physical`: El editor físico cambia por territorio y la ficha no aporta EAN suficiente.
- `ps4-street-power-football:publisher`: Maximum Games y Nacon cambian según territorio/SKU; no se elige uno sin identificador.
- `ps4-young-souls-deluxe-edition:physical`: La editora física debe confirmarse por EAN de la Deluxe concreta.
- `ps4-youtubers-life-2:physical`: El distribuidor físico depende del territorio de la edición.
- `ps4-mindtaker:publisher`: El propio libro deja el publisher por confirmar.
- `dishonored-arkane-physical-consolidation`: La errata está demostrada, pero faltan EAN/CUSA para eliminar una ficha física.
- `truth-out-there-physical-consolidation`: La variante de título está demostrada, pero faltan EAN/CUSA para eliminar una ficha física.

## Verificación

- semanticTest: PASS (83 fichas acreditadas, 247 créditos de compañía, 82 componentes, 13 variantes verificadas, 6 redirects y 9 casos bloqueados).
- typecheck: PASS.
- lint: PASS (0 errores; 35 avisos preexistentes fuera del alcance).
- unitTests: PASS (220/220).
- collectorControls: PASS.
- affiliateOffersV1: PASS.
- build: PASS.
- localQa: PASS en 1440 × 1000 y 390 × 844. Revisados recopilatorios, co-desarrollos, roles históricos, variantes, relaciones corporativas y redirects; sin overflow, imágenes rotas ni errores de consola.
- previewQa: PASS en `dpl_DrtKQkYZw1gvtBnYFsj6PTLpqZVA`, escritorio 1440 × 1000 y móvil 390 × 844. Diez vistas semánticas sin overflow, imágenes rotas ni errores de consola; las 11 rutas legacy responden 308 al destino exacto y los 6 destinos canónicos responden 200.

La PR permanece en borrador y no autoriza fusión ni despliegue a Production.
