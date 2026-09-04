# Verificación pre/post de franquicias y sagas

Base: `8a1b296359ed2108590067602e5c8d2442e57031`.

## Invariantes

- PASS: `catalogCount`
- PASS: `catalogIdsAndOrder`
- PASS: `catalogIdentityChecksum`
- PASS: `companyCount`
- PASS: `companyIdentityChecksum`
- PASS: `promotionMembershipParity`
- PASS: `promotionEditorialPreserved`
- PASS: `promotionRedirects`
- PASS: `everyLegacyUrlHasOutcome`
- PASS: `seriesPropagation`
- PASS: `noDuplicateMemberships`
- PASS: `noMultiplePrimaryMemberships`
- PASS: `noOrphanRelations`

## Conteos

- Juegos: 59.626 antes / 59.626 después.
- Compañías: 4326 antes / 4326 después.
- URLs legacy: 427; 8 redirects permanentes y 419 páginas conservadas.
- Franquicias: 9; relaciones game-franchise: 340; relaciones series-franchise: 8.

## Promociones

- final-fantasy: 140 → 140; membresía PASS; editorial PASS; redirect PASS.
- lego: 18 → 18; membresía PASS; editorial PASS; redirect PASS.
- mega-man: 6 → 6; membresía PASS; editorial PASS; redirect PASS.
- need-for-speed: 35 → 35; membresía PASS; editorial PASS; redirect PASS.
- resident-evil: 35 → 35; membresía PASS; editorial PASS; redirect PASS.
- sonic-the-hedgehog: 30 → 30; membresía PASS; editorial PASS; redirect PASS.
- star-wars: 21 → 21; membresía PASS; editorial PASS; redirect PASS.
- time-crisis: 6 → 6; membresía PASS; editorial PASS; redirect PASS.

Los resultados HTTP, canonical, sitemap y QA visual se validan adicionalmente contra Preview; este informe verifica el estado de datos y el contrato de rutas esperado.
