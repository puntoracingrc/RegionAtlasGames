# Dry-run del estudio de créditos de compañías

Fecha: 4 de septiembre de 2026

## Alcance

- Rama aislada: `codex/company-credit-study-dry-run-20260904`.
- Catálogo actual: `06a5b2de0a5752498364adfc7d3e14b338a59907` (incluye la PR #172 de Personas).
- Corte del paquete: `bba3ac89fbc2162483185105174770fc908c2f14`.
- ZIP: `regionatlas-company-credit-study-2026-09-03.zip`.
- SHA-256 del ZIP: `5f1ef245ff18cf855896d8f8e5e42bf4959befbb723a5fa92665e91f82e740a8`.
- Operación: comparación de solo lectura. No se ha modificado ningún dato del catálogo.

El paquete se trató como entrada no confiable. Se descartó ejecutar sus scripts, que generan archivos, y se usó el comparador local de solo lectura `scripts/dry_run_company_credit_study.py`.

Tras fusionar la PR #172, la rama se rebasó sobre el nuevo `main` y se repitió la comparación completa. El resultado de créditos no cambió.

## Integridad

- 37 archivos declarados en el manifiesto.
- 37 hashes y recuentos de CSV correctos.
- 0 entradas inseguras en el ZIP.
- 0 slugs de compañía propuestos ausentes del índice actual.

## Diferencias del catálogo

| Control | Resultado |
| --- | ---: |
| Fichas en el corte | 59.626 |
| Fichas actuales | 59.626 |
| IDs desaparecidos | 0 |
| IDs añadidos | 0 |
| IDs del lote verificado que cambiaron | 0 de 15 |
| Filas del catálogo con algún cambio | 20 |
| Cambios en `game-details.json` | 0 |

`data/game-details.json` conserva exactamente el mismo SHA-256 en ambos cortes:
`108fccad5892f28fb6a7301fcb2754cbcbd7116f889b6ed17a2e10a98ba4e8e3`.

Las 20 diferencias son únicamente la retirada de `marketMin` y `marketMax` en fichas PS4 no incluidas en el lote de créditos:

1. `ps4-fifa-22`
2. `ps4-fifa-23`
3. `ps4-final-fantasy-dissidia`
4. `ps4-final-fantasy-vii-remake`
5. `ps4-final-fantasy-vii-remake-deluxe`
6. `ps4-final-fantasy-viii-remastered`
7. `ps4-final-fantasy-x-x-2-hd-remaster`
8. `ps4-final-fantasy-xii-the-zodiac-age`
9. `ps4-final-fantasy-xv`
10. `ps4-firewall-zero-hour`
11. `ps4-friday-the-13th`
12. `ps4-ghost-of-tsushima`
13. `ps4-ghost-of-tsushima-director%27s-cut`
14. `ps4-god-of-war-ragnarok`
15. `ps4-grand-theft-auto-the-trilogy-definitive-edition`
16. `ps4-gravity-rush-2`
17. `ps4-greedfall`
18. `ps4-homefront-the-revolution`
19. `ps4-infernax`
20. `ps4-just-cause-4`

Estas diferencias proceden de la campaña de precios posterior al corte y no afectan a desarrolladoras ni publishers.

## Resultado de las 29 decisiones

| Estado actual | Filas |
| --- | ---: |
| Mutaciones `VERY_HIGH` ya resueltas por otro cambio | 0 |
| Confirmaciones que ya coinciden con el catálogo | 7 |
| Filas sin cambios desde la auditoría | 22 |
| IDs desaparecidos | 0 |
| Valores actuales distintos tanto del corte como de la propuesta | 0 |

Las 22 filas pendientes se dividen en 19 mutaciones `VERY_HIGH` y 3 sustituciones `HIGH` que deben permanecer en revisión manual.

### Mutaciones `VERY_HIGH` pendientes

| Catalog ID | Rol | Actual | Propuesto | Acción |
| --- | --- | --- | --- | --- |
| `ds-007-quantum-of-solace` | developer | Sin dato | Vicarious Visions | ADD_MISSING |
| `ds-007-quantum-of-solace` | publisher | Sin dato | Activision | ADD_MISSING |
| `ps2-007-quantum-of-solace` | publisher | Square Enix | Activision | REPLACE |
| `ps2-usa-007-quantum-of-solace` | publisher | Sin dato | Activision | ADD_MISSING |
| `ps3-007-quantum-of-solace` | developer | Eurocom | Treyarch | REPLACE |
| `ps3-007-quantum-of-solace` | publisher | Square Enix | Activision | REPLACE |
| `ps3-usa-007-quantum-of-solace` | developer | Eurocom | Treyarch | REPLACE |
| `ps3-usa-007-quantum-of-solace` | publisher | Sin dato | Activision | ADD_MISSING |
| `ps3-call-of-duty-advanced-warfare` | publisher | Square Enix | Activision | REPLACE |
| `ps3-usa-call-of-duty-advanced-warfare` | publisher | Sin dato | Activision | ADD_MISSING |
| `ps4-call-of-duty-advanced-warfare` | publisher | Square Enix | Activision | REPLACE |
| `ps4-usa-call-of-duty-advanced-warfare` | publisher | Square Enix | Activision | REPLACE |
| `ps3-skylanders-spyro%27s-adventure` | developer | XPEC Entertainment | Toys for Bob | REPLACE |
| `ps3-skylanders-spyro%27s-adventure` | publisher | Square Enix | Activision | REPLACE |
| `ps3-usa-skylanders-spyro-s-adventure` | developer | Sin dato | Toys for Bob | ADD_MISSING |
| `ps3-usa-skylanders-spyro-s-adventure` | publisher | Sin dato | Activision | ADD_MISSING |
| `ps3-splinter-cell-blacklist` | publisher | Square Enix | Ubisoft | REPLACE |
| `ps3-usa-splinter-cell-blacklist` | publisher | Sin dato | Ubisoft | ADD_MISSING |
| `gameboy-es-mystic-quest` | developer | Square Enix | Square | REPLACE |

Resumen: 8 altas de campos ausentes y 11 sustituciones. Ninguna está ya aplicada en el catálogo actual.

### Confirmaciones sin mutación

| Catalog ID | Rol | Valor confirmado | Confianza |
| --- | --- | --- | --- |
| `ps2-007-quantum-of-solace` | developer | Eurocom | VERY_HIGH |
| `ps2-usa-007-quantum-of-solace` | developer | Eurocom | VERY_HIGH |
| `ps4-japon-call-of-duty-advanced-warfare` | regional publisher | Square Enix | VERY_HIGH |
| `ps3-splinter-cell-blacklist` | developer | Ubisoft Toronto | VERY_HIGH |
| `ps3-usa-splinter-cell-blacklist` | developer | Ubisoft Toronto | VERY_HIGH |

### Bandeja `HIGH`, no aplicable automáticamente

| Catalog ID | Rol | Actual | Propuesto | Acción |
| --- | --- | --- | --- | --- |
| `ps3-call-of-duty-advanced-warfare` | developer | High Moon | High Moon Studios | RETAIN |
| `ps3-usa-call-of-duty-advanced-warfare` | developer | High Moon | High Moon Studios | RETAIN |
| `ps4-call-of-duty-advanced-warfare` | developer | High Moon | Sledgehammer Games | REPLACE |
| `ps4-usa-call-of-duty-advanced-warfare` | developer | High Moon | Sledgehammer Games | REPLACE |
| `ps4-japon-call-of-duty-advanced-warfare` | developer | High Moon | Sledgehammer Games | REPLACE |

Los dos `RETAIN` conservan el mismo slug `high-moon`; solo difiere el nombre visible propuesto. Las tres sustituciones a Sledgehammer Games siguen bloqueadas por confianza `HIGH`.

## Conclusión

El lote no ha envejecido respecto a los créditos: no hay IDs perdidos, mutaciones ya resueltas ni valores divergentes. Las 19 mutaciones `VERY_HIGH` continúan siendo el diff exacto que se aplicaría en una fase posterior. Este dry-run no autoriza su importación y no modifica datos.

Reproducción:

```bash
python3 scripts/dry_run_company_credit_study.py \
  --package-dir /ruta/al/package \
  --repo .
```
