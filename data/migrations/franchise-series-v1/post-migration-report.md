# Verificación pre/post de franquicias y sagas

Base: `e69fb94f72ca51080eb6c5abcee47a9099e57524`.

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
- PASS: `promotionMembershipParity`
- PASS: `promotionEditorialPreserved`
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

- Fichas: 59.626 antes / 59.626 después; 59.626 IDs únicos.
- Compañías: 4326 antes / 4326 después.
- URLs legacy: 427; 8 redirects permanentes y 419 páginas conservadas.
- Franquicias: 9; relaciones ficha-franquicia: 340; relaciones saga-franquicia: 8.
- Clasificación conservadora: 8 promociones, 7 sagas y 412 entradas legacy ambiguas intactas.

## Promociones

- final-fantasy: 140 → 140 fichas; membresía PASS; editorial PASS; redirect PASS.
- lego: 18 → 18 fichas; membresía PASS; editorial PASS; redirect PASS.
- mega-man: 6 → 6 fichas; membresía PASS; editorial PASS; redirect PASS.
- need-for-speed: 35 → 35 fichas; membresía PASS; editorial PASS; redirect PASS.
- resident-evil: 35 → 35 fichas; membresía PASS; editorial PASS; redirect PASS.
- sonic-the-hedgehog: 30 → 30 fichas; membresía PASS; editorial PASS; redirect PASS.
- star-wars: 21 → 21 fichas; membresía PASS; editorial PASS; redirect PASS.
- time-crisis: 6 → 6 fichas; membresía PASS; editorial PASS; redirect PASS.

## Identificadores y rollback

El campo persistido `gameId` significa `catalog_id`: identifica una ficha/edición ya existente, no una obra lógica nueva. El rollback descarta el estado de franquicias y vuelve al lector legacy conservado; los hashes de catálogo, precios, créditos, compañías, series y contenido editorial se verifican contra la base `e69fb94f72ca51080eb6c5abcee47a9099e57524`.

Los resultados HTTP, canonical, sitemap y QA visual se validan adicionalmente contra Preview; este informe verifica el estado de datos y el contrato de rutas esperado.
