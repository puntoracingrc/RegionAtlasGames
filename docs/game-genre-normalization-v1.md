# GAME_GENRE_NORMALIZATION_V1

## Estado

Fase preparada en modo seguro.

No modifica juegos por defecto, no crea facetas, no crea landings públicas, no usa IA, no hace scraping, no toca Vercel y no toca producción.

## Problema detectado en la auditoría

`GAME_GENRE_DATA_QUALITY_AUDIT_V1` detectó 175 géneros únicos y varios problemas de calidad:

- 4 géneros con `amp;`.
- 4 géneros con entidades HTML.
- 6 géneros compuestos.
- 979 registros de detalle con array de géneros vacío.
- `amp; Adventure` aparece como género masivo con 9.350 apariciones.

La comprobación de coocurrencia muestra que `amp; Adventure` aparece junto a `Action` en todos los juegos afectados, por lo que parece venir de `Action & Adventure` mal parseado.

## Estrategia de normalización

La normalización se divide en dos capas:

1. Mapa aprobado en `data/game-genre-normalization.json`.
2. Dry-run obligatorio antes de cualquier aplicación real.

El mapa contiene reglas con:

- `raw`: valor actual detectado.
- `normalized`: lista de valores sugeridos.
- `reason`: motivo editorial/técnico.
- `confidence`: confianza de la regla.
- `action`: `normalize`, `split` o `alias`.
- `status`: `approved` o `review`.

En V1 solo las reglas `approved` entran en el dry-run de cambios aplicables. Las reglas `review` quedan documentadas para revisión humana.

## Reglas para HTML entities

- `&amp;` se interpreta como artefacto HTML.
- `amp;` suelto se considera resto de parsing roto.
- `#39;` se considera artefacto de apóstrofo, pero no se aplica automáticamente si necesita contexto.
- No se borra el valor original en esta fase.
- Toda regla debe ser reversible.

## Reglas para `amp;`

- Si `amp; X` aparece junto al primer término esperado, se normaliza solo a `X`.
- Ejemplo: juegos con `Action` + `amp; Adventure` pasan a propuesta `Action` + `Adventure`.
- Si el valor indica tipo/edición, como `amp; NFR`, se conserva como `NFR` para futura revisión como etiqueta o tipo de edición.

## Reglas para compuestos

- Un compuesto puede dividirse si el separador es claro y la pérdida semántica es baja.
- `Track &amp; Field` se propone como `Track` + `Field` porque esa fue la normalización pedida en auditoría.
- Compuestos editoriales como `Hack and Slash` quedan en `review` hasta decidir si deben ser género, subgénero o etiqueta.

## Reglas para duplicados ES/EN

Se preparan reglas `review` para candidatos como:

- `Action` → `Acción`
- `Adventure` → `Aventura`
- `Sports` → `Deportes`
- `Racing` → `Carreras`
- `Fighting` → `Lucha`

No se aprueban todavía porque pueden tener matices, coexistir con géneros ya traducidos o requerir deduplicación no destructiva.

## Reglas de seguridad

- El dry-run es obligatorio.
- `normalize:game-genres:apply` existe, pero está bloqueado por defecto.
- El apply exige `CONFIRM_GAME_GENRE_NORMALIZATION=YES`.
- En V1 el apply no ejecuta migraciones reales aunque se confirme: queda reservado para una revisión posterior.
- El reporte local va a `data/game-genre-normalization-report.local.json` y no se sube a Git.
- No se modifican `data/catalog.json` ni `data/game-details.json`.
- No se crean landings públicas.
- No se activan facetas reales.

## Dry-run obligatorio

Ejecutar:

```bash
npm run normalize:game-genres:dry-run
```

El reporte incluye:

- Total de juegos escaneados.
- Total de juegos afectados.
- Afectación por género raw.
- Preview before/after.
- Géneros desconocidos no mapeados.
- Warnings.
- `noWritePerformed: true`.

## Rollback y log futuro

Si en una fase futura se permite aplicar normalización real, deberá generar:

- Backup previo.
- Log de cambios por juego.
- Resumen before/after.
- Lista de reglas usadas.
- Capacidad de rollback.
- Confirmación explícita antes de escribir.

## Confirmación V1

Esta fase solo prepara el sistema y ejecuta diagnóstico. No altera juegos, no publica nada y no toca producción.

## GAME_GENRE_NORMALIZATION_APPLY_V1

### Objetivo

Aplicar una normalización real, controlada y reversible sobre géneros con entidades HTML rotas. Esta fase pasa de auditoría a acción, pero solo para reglas `approved` y dentro de una allowlist cerrada.

### Reglas aplicadas

Solo pueden aplicarse estas reglas si están marcadas como `status: "approved"` en `data/game-genre-normalization.json`:

- `amp; Adventure` → `Adventure`
- `amp; NFR` → `NFR`
- `amp; Card` → `Card`
- `Track &amp; Field` → `Track` + `Field`

Cualquier otra regla, aunque aparezca en el mapa, queda fuera si no está aprobada o si no está en la allowlist de `GAME_GENRE_NORMALIZATION_APPLY_V1`.

### Backup

Antes de escribir cambios, el apply crea una copia de seguridad en:

```txt
data/backups/game-genre-normalization/YYYYMMDD-HHMMSS/
```

El backup incluye todos los archivos de datos que la migración puede modificar:

- `data/game-details.json`
- `data/index/genres.json`
- `data/index/genre-entities.json`

La carpeta `data/backups/` está ignorada por Git para evitar subir copias pesadas al repositorio.

### Reporte de aplicación

Cada ejecución genera:

```txt
data/game-genre-normalization-apply-report.local.json
```

El reporte incluye:

- timestamp
- total de juegos escaneados
- total de juegos modificados
- total de entradas de género modificadas
- reglas aplicadas
- conteos por regla
- ejemplos before/after por regla
- archivos modificados
- ruta del backup
- warnings
- errors
- `success`

Este reporte es local y está ignorado por Git.

### Ejecución

El apply está protegido. Sin confirmación explícita aborta:

```bash
npm run normalize:game-genres:apply
```

Para aplicar realmente:

```bash
CONFIRM_GAME_GENRE_NORMALIZATION=YES npm run normalize:game-genres:apply
```

### Idempotencia

La migración debe ser idempotente: una vez aplicada, el dry-run posterior debe mostrar 0 juegos afectados por las reglas aprobadas ya aplicadas.

Flujo obligatorio:

```bash
npm run normalize:game-genres:dry-run
CONFIRM_GAME_GENRE_NORMALIZATION=YES npm run normalize:game-genres:apply
npm run normalize:game-genres:dry-run
```

### Rollback manual

Si hubiera que revertir, copiar de vuelta los archivos desde el backup indicado en el reporte:

```txt
data/backups/game-genre-normalization/YYYYMMDD-HHMMSS/
```

Restaurar manualmente:

- `game-details.json` → `data/game-details.json`
- `index/genres.json` → `data/index/genres.json`
- `index/genre-entities.json` → `data/index/genre-entities.json`

Después ejecutar validaciones y análisis de calidad.

### Prohibiciones

- No se crean facetas.
- No se crean landings públicas nuevas.
- No se modifica UI pública.
- No se usa IA.
- No se hace scraping.
- No se toca Vercel.
- No se modifica eBay/Rakuten ni afiliación.
- No se generan tags nuevos.
- No se convierten géneros en facetas.
- No se modifican géneros fuera de las reglas aprobadas.

### Validaciones posteriores

Después de aplicar se deben ejecutar:

```bash
npm run analyze:game-genre-quality
npm run analyze:game-facets-coverage
npm run validate:game-genre-normalization-v1
npm run validate:game-genre-normalization-apply-v1
npm run validate:game-genre-data-quality-audit-v1
npm run validate:game-facets-taxonomy-audit-v1
npm run validate:all
npx tsc --noEmit --pretty false
```
