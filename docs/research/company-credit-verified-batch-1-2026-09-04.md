# Lote verificado 1 de créditos de compañías

Fecha de revisión: 4 de septiembre de 2026

## Alcance cerrado

- Rama: `codex/company-credit-verified-batch-1`.
- Base: `8a1b296359ed2108590067602e5c8d2442e57031`.
- Paquete fuente: `regionatlas-company-credit-study-2026-09-03.zip`.
- SHA-256 del paquete: `5f1ef245ff18cf855896d8f8e5e42bf4959befbb723a5fa92665e91f82e740a8`.
- Decisiones importadas sin modificaciones: `data/research/company-credit-verified-batch-1.csv`.
- Informe estructurado antes/después: `data/research/company-credit-verified-batch-1-report.json`.

Se aplican exclusivamente 19 decisiones `VERY_HIGH`: 8 `ADD_MISSING` y 11 `REPLACE`. No se propagan créditos a otras regiones, plataformas ni ediciones.

## Diff por ficha

| Catalog ID | Desarrolladora | Publisher |
| --- | --- | --- |
| `ds-007-quantum-of-solace` | Sin dato -> Vicarious Visions | Sin dato -> Activision |
| `ps2-007-quantum-of-solace` | Sin cambios | Square Enix -> Activision |
| `ps2-usa-007-quantum-of-solace` | Sin cambios | Sin dato -> Activision |
| `ps3-007-quantum-of-solace` | Eurocom -> Treyarch | Square Enix -> Activision |
| `ps3-usa-007-quantum-of-solace` | Eurocom -> Treyarch | Sin dato -> Activision |
| `ps3-call-of-duty-advanced-warfare` | Sin cambios | Square Enix -> Activision |
| `ps3-usa-call-of-duty-advanced-warfare` | Sin cambios | Sin dato -> Activision |
| `ps4-call-of-duty-advanced-warfare` | Sin cambios | Square Enix -> Activision |
| `ps4-usa-call-of-duty-advanced-warfare` | Sin cambios | Square Enix -> Activision |
| `ps3-skylanders-spyro%27s-adventure` | XPEC Entertainment -> Toys for Bob | Square Enix -> Activision |
| `ps3-usa-skylanders-spyro-s-adventure` | Sin dato -> Toys for Bob | Sin dato -> Activision |
| `ps3-splinter-cell-blacklist` | Sin cambios | Square Enix -> Ubisoft |
| `ps3-usa-splinter-cell-blacklist` | Sin cambios | Sin dato -> Ubisoft |
| `gameboy-es-mystic-quest` | Square Enix -> Square | Sin cambios |

Cada campo cambiado conserva `source=official`, URLs de evidencia, resumen, fecha de revisión y el identificador del lote en `fieldProvenance`.

## Filas conservadas

Estas siete decisiones ya eran correctas y no se han reescrito:

| Catalog ID | Rol | Valor conservado | Confianza |
| --- | --- | --- | --- |
| `ps2-007-quantum-of-solace` | developer | Eurocom | VERY_HIGH |
| `ps2-usa-007-quantum-of-solace` | developer | Eurocom | VERY_HIGH |
| `ps3-call-of-duty-advanced-warfare` | developer | High Moon | HIGH |
| `ps3-usa-call-of-duty-advanced-warfare` | developer | High Moon | HIGH |
| `ps4-japon-call-of-duty-advanced-warfare` | regional publisher | Square Enix | VERY_HIGH |
| `ps3-splinter-cell-blacklist` | developer | Ubisoft Toronto | VERY_HIGH |
| `ps3-usa-splinter-cell-blacklist` | developer | Ubisoft Toronto | VERY_HIGH |

Las tres sustituciones `HIGH` de High Moon por Sledgehammer Games en PS4 PAL, USA y Japón siguen bloqueadas y no tienen procedencia de publicación añadida.

## Invariantes

| Control | Antes | Después |
| --- | ---: | ---: |
| Fichas de catálogo | 59.626 | 59.626 |
| IDs únicos de catálogo | 59.626 | 59.626 |
| Fichas con `game-details` | 32.254 | 32.255 |
| `catalog_id` con campos modificados | 0 | 14 |

El único objeto de detalle nuevo pertenece a `ps3-usa-skylanders-spyro-s-adventure`, ficha ya existente que no tenía detalle y recibe exclusivamente sus dos créditos verificados.

## Páginas afectadas

El índice cambia solo para Activision, Eurocom, Square, Square Enix, Toys for Bob, Treyarch, Ubisoft, Vicarious Visions y XPEC Entertainment. Sus rutas exactas y recuentos antes/después están en el informe JSON.

Reproducción y validación:

```bash
python3 scripts/apply_company_credit_verified_batch.py
python3 scripts/apply_company_credit_verified_batch.py --apply
python3 scripts/test_company_credit_verified_batch.py
```

La primera orden es un dry-run. La aplicación es idempotente: una segunda ejecución valida el estado y conserva el informe original sin reescribir archivos.
