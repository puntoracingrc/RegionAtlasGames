# Verificación pre/post de franquicias y sagas

Base: `51ffae99dfed693c893b99ff7d29ba166a69e2f7`.

## Invariantes

- PASS: `catalogCount`
- PASS: `catalogIdsUnique`
- PASS: `catalogIdsAndOrder`
- PASS: `catalogUrlsAndOrder`
- PASS: `catalogIdentityChecksum`
- PASS: `companyCount`
- PASS: `companyIdentityChecksum`
- PASS: `protectedBaseFiles`
- PASS: `exactApprovedClassification`
- PASS: `exactApprovedMigrationScope`
- PASS: `ambiguousLegacyUntouched`
- PASS: `approvedMembershipExclusions`
- PASS: `effectiveMembershipsExact`
- PASS: `positiveNonTitleMembershipsPreserved`
- PASS: `gameBoyHistoricalBrandingClassified`
- PASS: `finalFantasyEditorialCorrected`
- PASS: `promotionMembershipParity`
- PASS: `promotionEditorialEffective`
- PASS: `promotionRedirects`
- PASS: `everyLegacyUrlHasOutcome`
- PASS: `exactLegacyUrlOutcomes`
- PASS: `seriesPropagation`
- PASS: `noDuplicateMemberships`
- PASS: `noMultiplePrimaryMemberships`
- PASS: `noOrphanRelations`
- PASS: `manyToManyMembership`
- PASS: `approvedEntityRelationship`
- PASS: `gameIdMeansExistingCatalogId`
- PASS: `rollbackManifest`

## Conteos

- Fichas: 73.104 antes / 73.104 después; 73.104 IDs únicos.
- Compañías: 4326 antes / 4326 después.
- URLs legacy: 427; 8 redirects permanentes y 419 páginas conservadas.
- Franquicias: 9; relaciones ficha-franquicia: 333; relaciones saga-franquicia: 8.
- Clasificación conservadora: 8 promociones, 7 sagas y 412 entradas legacy ambiguas intactas.

## Exclusiones editoriales verificadas

La pertenencia efectiva se calcula como la pertenencia legacy menos las exclusiones aprobadas. El snapshot legacy y los ficheros protegidos no se modifican.

| catalog_id | Entidad | Clasificación | Confianza | Evidencia |
| --- | --- | --- | --- | --- |
| `gameboy-japon-seiken-densetsu-final-fantasy-gaiden` | franchise `final-fantasy` | historical_branding | high | [1](https://www.jp.square-enix.com/game/detail/seiken/) · [2](https://mana.square-enix-games.com/en-us/games/collection-of-mana) |
| `gameboy-usa-final-fantasy-adventure` | franchise `final-fantasy` | historical_branding | high | [1](https://mana.square-enix-games.com/en-gb) · [2](https://mana.square-enix-games.com/en-us/games/collection-of-mana) |
| `gameboy-usa-final-fantasy-legend` | franchise `final-fantasy` | regional_rebranding | high | [1](https://www.square-enix.com/saga/en-us/about/) · [2](https://www.square-enix-games.com/en_GB/home/collection-of-saga-final-fantasy-legend-is-available-now) |
| `gameboy-usa-final-fantasy-legend-ii` | franchise `final-fantasy` | regional_rebranding | high | [1](https://www.square-enix.com/saga/en-us/about/) · [2](https://www.square-enix-games.com/en_GB/home/collection-of-saga-final-fantasy-legend-is-available-now) |
| `gameboy-usa-final-fantasy-legend-iii` | franchise `final-fantasy` | regional_rebranding | high | [1](https://www.square-enix.com/saga/en-us/about/) · [2](https://www.square-enix-games.com/en_GB/home/collection-of-saga-final-fantasy-legend-is-available-now) |
| `ps1-wanted` | franchise `need-for-speed` | false_positive | high | [1](https://www.mobygames.com/game/111925/wanted/) · [2](https://psxdatacenter.com/games/P/W/SLES-04158.html) |
| `ps2-harry-potter-collection` | series `lego-harry-potter` | false_positive | high | [1](https://www.mobygames.com/game/30951/harry-potter-collection/) · [2](https://www.bestbuy.com/site/harry-potter-collection-playstation-2/8441484.p?skuId=8441484) |
| `ps2-harry-potter-collection` | franchise `lego` | false_positive | high | [1](https://www.mobygames.com/game/30951/harry-potter-collection/) · [2](https://www.bestbuy.com/site/harry-potter-collection-playstation-2/8441484.p?skuId=8441484) |

Final Fantasy queda sin la biografía corporativa de Square Enix: la descripción efectiva es `null` y la decisión permanece trazada en `editorial-overrides.json`.

### Revisión Game Boy

- `gameboy-japon-seiken-densetsu-final-fantasy-gaiden`: origen japonés de Mana/Seiken Densetsu; “Final Fantasy Gaiden” queda como contexto histórico de marca, no pertenencia directa.
- `gameboy-usa-final-fantasy-adventure`: versión norteamericana de la primera entrega de Mana; marca histórica, no pertenencia directa.
- `gameboy-usa-final-fantasy-legend`, `-ii` y `-iii`: primeras entregas de SaGa con denominación regional Final Fantasy Legend; rebranding regional, no pertenencia directa.
No se crea todavía una pertenencia a Mana o SaGa porque esas franquicias no forman parte del lote aprobado.

## Promociones

- final-fantasy: 140 legacy − 5 exclusiones = 135 efectivas; membresía PASS; editorial PASS; redirect PASS.
- lego: 18 legacy − 0 exclusiones = 18 efectivas; membresía PASS; editorial PASS; redirect PASS.
- mega-man: 6 legacy − 0 exclusiones = 6 efectivas; membresía PASS; editorial PASS; redirect PASS.
- need-for-speed: 35 legacy − 1 exclusiones = 34 efectivas; membresía PASS; editorial PASS; redirect PASS.
- resident-evil: 35 legacy − 0 exclusiones = 35 efectivas; membresía PASS; editorial PASS; redirect PASS.
- sonic-the-hedgehog: 30 legacy − 0 exclusiones = 30 efectivas; membresía PASS; editorial PASS; redirect PASS.
- star-wars: 21 legacy − 0 exclusiones = 21 efectivas; membresía PASS; editorial PASS; redirect PASS.
- time-crisis: 6 legacy − 0 exclusiones = 6 efectivas; membresía PASS; editorial PASS; redirect PASS.

## Identificadores y rollback

El campo persistido `gameId` significa `catalog_id`: identifica una ficha/edición ya existente, no una obra lógica nueva. El rollback descarta el estado de franquicias y vuelve al lector legacy conservado; los hashes de catálogo, precios, créditos, compañías, series y contenido editorial se verifican contra la base `51ffae99dfed693c893b99ff7d29ba166a69e2f7`.

Los resultados HTTP, canonical, sitemap y QA visual se validan adicionalmente contra Preview; este informe verifica el estado de datos y el contrato de rutas esperado.
