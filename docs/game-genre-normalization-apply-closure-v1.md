# GAME_GENRE_NORMALIZATION_APPLY_CLOSURE_V1

## Fecha de aplicación

Aplicado el 17 de junio de 2026 a las 19:47:24, hora local Europe/Madrid.

## Objetivo

Cerrar documentalmente la migración controlada de normalización de géneros iniciada en `GAME_GENRE_NORMALIZATION_APPLY_V1`.

La fase corrigió artefactos de entidades HTML y valores `amp;` rotos que estaban contaminando los géneros del catálogo, sin crear facetas, landings, etiquetas nuevas ni cambios de interfaz pública.

## Archivos modificados

La migración modificó únicamente estos archivos de datos:

- `data/game-details.json`
- `data/index/genres.json`
- `data/index/genre-entities.json`

## Reglas aplicadas

Solo se aplicaron reglas con `status: "approved"` en `data/game-genre-normalization.json`.

| Regla | Juegos / entradas afectadas |
| --- | ---: |
| `amp; Adventure` → `Adventure` | 9.350 |
| `amp; NFR` → `NFR` | 57 |
| `amp; Card` → `Card` | 50 |
| `Track &amp; Field` → `Track` + `Field` | 6 |

## Conteo total

- Juegos modificados: 9.463
- Entradas de género modificadas: 9.463

## Backup

Backup generado antes de escribir cambios:

```txt
data/backups/game-genre-normalization/20260617-194724
```

El backup contiene copia de los archivos de datos modificados.

## Reporte de aplicación

Reporte local generado:

```txt
data/game-genre-normalization-apply-report.local.json
```

El reporte queda fuera de Git porque está incluido en `.gitignore`.

## Segundo dry-run

Después de aplicar la migración se ejecutó de nuevo:

```bash
npm run normalize:game-genres:dry-run
```

Resultado:

- 0 cambios pendientes para las reglas aprobadas ya aplicadas.
- La migración queda validada como idempotente para esta fase.

## Resultado de calidad de géneros

Después de aplicar la migración se ejecutó:

```bash
npm run analyze:game-genre-quality
```

Resultado relevante:

- Géneros con `amp;`: 0
- Géneros con entidades HTML: 0
- `amp; Adventure` ya no aparece.
- `amp; NFR` ya no aparece.
- `amp; Card` ya no aparece.
- `Track &amp; Field` ya no aparece.

## Validaciones

Validaciones ejecutadas correctamente:

```bash
npm run validate:all
npx tsc --noEmit --pretty false
```

Resultado:

- `validate:all`: OK
- TypeScript: OK

## Confirmaciones de alcance

Durante la fase de normalización:

- No se han creado facetas.
- No se han creado landings públicas.
- No se ha modificado la UI pública.
- No se ha usado IA.
- No se ha hecho scraping.
- No se ha tocado eBay.
- No se ha tocado Rakuten.
- No se ha tocado Vercel como parte del proceso de migración.
- No se ha ejecutado deploy como parte del proceso de migración.

## Rollback manual

Si fuera necesario revertir esta migración, restaurar manualmente los archivos desde:

```txt
data/backups/game-genre-normalization/20260617-194724
```

Restaurar:

- `game-details.json` → `data/game-details.json`
- `index/genres.json` → `data/index/genres.json`
- `index/genre-entities.json` → `data/index/genre-entities.json`

Después del rollback, ejecutar:

```bash
npm run analyze:game-genre-quality
npm run normalize:game-genres:dry-run
npm run validate:game-genre-normalization-v1
npm run validate:all
npx tsc --noEmit --pretty false
```

## Siguiente paso recomendado

El siguiente paso natural es `GAME_FACETS_V1`, pero solo después de revisar cuidadosamente:

```bash
git diff --stat
git diff
```

No abrir `GAME_FACETS_V1` hasta confirmar que la normalización aplicada es correcta y que no hay cambios no relacionados mezclados.
