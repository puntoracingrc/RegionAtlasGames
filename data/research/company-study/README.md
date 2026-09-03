# Investigación de compañías 2026-09-03

Esta carpeta contiene una capa aditiva de investigación. No sustituye los índices, perfiles,
slugs, relaciones canónicas ni créditos de juegos existentes.

## Frontera de publicación

- `core.json`, `provenance.json`, `sources.json`, `review.json`, `editorial.json` y
  `relationship-decisions.json` son datos internos. Solo pueden importarse desde módulos de
  servidor bajo `/admin`.
- `public.json` es la única proyección pública. Contiene cuatro historias, siete hitos y tres
  correcciones de identidad autorizadas.
- Un QID compartido nunca implica una fusión. Los 259 grupos permanecen en revisión.
- No se publica ninguna relación corporativa en esta fase.

## Reproducción

El generador es `scripts/import_company_research.py`. Sin `--write` ejecuta un dry-run; con
`--check` verifica que los archivos versionados coinciden byte a byte con sus fuentes auditadas.
El manifiesto registra los hashes de los archivos canónicos protegidos.

## Reversión

La importación no sobrescribe datos canónicos. Para revertirla se retiran esta carpeta y las
importaciones de `company-public-research.ts` y `admin-company-research.ts`. Git conserva el diff
completo y no es necesario reconstruir perfiles ni créditos históricos.
