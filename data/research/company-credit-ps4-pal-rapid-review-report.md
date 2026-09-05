# PS4 PAL - repaso rapido de creditos por funcion

Lote: `company-credit-ps4-pal-rapid-review-2026-09-05`
Fuente: `RegionAtlas_PS4_PAL_repaso_rapido_creditos_2026-09-05.xlsx` (`f8a1589ad8cfd168c202a0c6173b64994fd1c127c01ee955861b0c7226531de1`)

## Dry-run

- Roles que declara el resumen del libro: 1760.
- Filas de rol realmente extraidas: 1750 (diferencia de origen: 10).
- ADD: 1499
- REPLACE: 74
- CONFIRM: 82
- SKIP_CHANGED: 0
- Conflictos bloqueados: 95
- Productos no juego: 6

## Aplicacion

- Filas de rol resueltas: 1655 sobre 1123 fichas.
- Desarrolladora: 656.
- Publicadora generica: 2.
- Editora digital: 60.
- Editora o distribuidora fisica: 937.
- Creditos adicionales por co-desarrollo: 5.
- Entidades de compania nuevas: 124.
- Productos excluidos ahora: 4; ya excluidos: 2.

## Semantica

Los creditos de desarrollo, publicacion general, edicion digital y edicion o distribucion fisica se almacenan por separado. Los creditos multiples conservan cada entidad.
La identidad editorial cubre 1199 fichas con 1070 obras explicitas.
El libro fuente indicaba 1071; se corrige una unidad porque Wipeout Omega Collection y su variante Only On PlayStation son la misma obra.
El total general del Resumen declara diez roles mas que las hojas Resueltos y Conflictos. La importacion conserva la discrepancia y no inventa filas ausentes.

## Invariantes

- Catalogo: 73104 -> 73104 fichas.
- IDs unicos: 73104 -> 73104.
- Companias: 4326 -> 4450.
- IDs, URLs, slugs, regiones, plataformas, ediciones, portadas, precios y franquicias: sin cambios.
- Los 95 conflictos siguen bloqueados y no existe propagacion a otras regiones o plataformas.

## Verificacion

- Comparador semantico: PASS.
- Typecheck: PASS.
- Lint: PASS (0 errors; 35 pre-existing warnings).
- Pruebas unitarias: PASS (217/217 plus 74/74 pretests).
- Controles de recolectores: PASS.
- Afiliacion: PASS.
- Build: PASS.
- QA Preview: PENDING (requires remote Preview for the final PR HEAD).

## Estado

Aplicacion realizada.

Quality y QA Preview se documentan tambien en la PR para su HEAD remoto exacto.
