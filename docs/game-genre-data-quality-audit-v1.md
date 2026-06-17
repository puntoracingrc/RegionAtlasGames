# GAME_GENRE_DATA_QUALITY_AUDIT_V1

## Estado

Fase de auditoría únicamente.

No modifica juegos, no elimina categorías, no aplica normalizaciones, no crea facetas reales, no crea landings públicas y no toca producción.

## Problema detectado

Durante `GAME_FACETS_TAXONOMY_AUDIT_V1` apareció un dato basura relevante: `amp; Adventure`.

Ese patrón indica que algunas entidades HTML o cadenas compuestas se parsearon mal antes de entrar al catálogo. El caso más típico viene de valores como `Action & Adventure`, `Action &amp; Adventure` o separaciones similares, donde el `amp;` queda convertido en texto visible y termina comportándose como un género real.

## Impacto en GAME_FACETS futuro

Si `GAME_FACETS_V1` se construye encima de géneros sucios, el sistema heredará problemas como:

- Landings duplicadas o inútiles para valores basura.
- Filtros menos precisos.
- Juegos mal agrupados.
- Etiquetas confundidas con géneros principales.
- Pérdida de confianza editorial en sagas, etiquetas y recomendaciones.
- Normalizaciones destructivas si se intenta corregir demasiado pronto.

Por eso esta fase existe antes de crear facetas reales.

## Qué audita el script

`npm run analyze:game-genre-quality` revisa los géneros actuales desde `data/game-details.json` y `data/index/genres.json` para detectar:

- HTML entities mal parseadas.
- Valores que contienen `amp;`.
- Duplicados por mayúsculas/minúsculas o acentos.
- Géneros compuestos.
- Separadores raros.
- Espacios dobles o espacios al principio/final.
- Valores vacíos o nulos.
- Géneros demasiado específicos que parecen edición, formato, promo o etiqueta.
- Vista previa de un mapa de normalización futura.

El script solo imprime diagnóstico por consola. No escribe datos ni corrige nada.

## Ejemplos de datos sucios

Ejemplos esperados o posibles:

- `amp; Adventure`
- `Action amp; Adventure`
- `Action & Adventure`
- `Action / Adventure`
- `Role-Playing  `
- ` Collector Edition`
- `Demo / Promo`

Estos valores no deben corregirse todavía en juegos reales. Solo se proponen en `data/game-genre-normalization.example.json`.

## Estrategia de normalización futura

La futura normalización debe ser no destructiva:

1. Conservar siempre `rawGenre` u `originalGenre`.
2. Añadir `normalizedGenres` aparte.
3. Permitir rollback.
4. Aplicar cambios solo tras un módulo separado: `GAME_GENRE_NORMALIZATION_V1`.
5. Validar cobertura antes/después.
6. No borrar información original sin backup y revisión.
7. Separar género principal, subgénero y etiqueta sin mezclar conceptos.

## Reglas para no perder información

- Un género compuesto no se borra: se conserva como raw y se propone dividirlo.
- Un `amp;` no se elimina directamente: se registra la propuesta y la razón.
- Un valor demasiado específico puede pasar a etiqueta, pero nunca se descarta automáticamente.
- Demos, promos, NFR o ediciones especiales pueden ser etiquetas o tipos de edición, no necesariamente géneros.
- Cualquier normalización debe poder revertirse.

## Archivo de ejemplo

`data/game-genre-normalization.example.json` contiene propuestas como:

```json
{
  "raw": "Action amp; Adventure",
  "suggestedNormalized": ["Action", "Adventure"],
  "reason": "HTML entity parsing artifact",
  "confidence": 0.95,
  "action": "suggest_split",
  "destructive": false
}
```

## Siguiente módulo propuesto

`GAME_GENRE_NORMALIZATION_V1`

Objetivo futuro:

- Leer el diagnóstico.
- Crear un mapa local revisable.
- Añadir `rawGenre/originalGenre` y `normalizedGenres` sin borrar el valor original.
- Normalizar de forma reversible.
- Generar un informe antes/después.
- Requerir validación antes de afectar UI pública o facetas reales.

## Garantías de esta fase

- No se modifican juegos.
- No se eliminan categorías.
- No se aplican normalizaciones.
- No se crean facetas reales.
- No se crean landings públicas.
- No se cambia la UI pública.
- No se toca producción.
