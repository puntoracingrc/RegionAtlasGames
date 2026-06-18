# FACET_EXTERNAL_SIGNAL_MAPPING_V1

## Estado

Implemented, not applied.

Esta fase crea una capa segura para traducir señales externas de fuentes como Steam, Vandal o páginas oficiales a la taxonomía controlada de Region Atlas Games.

No modifica juegos. No crea landings. No cambia UI pública. No usa IA. No hace scraping. No toca Vercel, eBay ni Rakuten.

## Objetivo

Cuando una fuente externa devuelva una etiqueta como `Metroidvania`, `Souls-like`, `Open World` o `Survival Horror`, Region Atlas debe poder entenderla como una entidad interna única y estable.

Ejemplo:

- Steam `Soccer` → `football`
- Steam `Pixel Graphics` → `pixel-art`
- Vandal `Aventura de acción` → `action-adventure`
- PlayStation Store `1 jugador` → `single-player`

## Archivos

- `data/facet-external-signal-mapping.json`
- `data/facet-external-signal-mapping.example.json`
- `src/lib/game-facets/external-signal-mapping.ts`
- `scripts/test-facet-external-signal-mapping-v1.mjs`
- `scripts/validate-facet-external-signal-mapping-v1.mjs`

## Modelo

Cada señal externa declara:

- `source`: fuente de la señal (`steam`, `vandal`, `official`, etc.)
- `signal`: texto original encontrado
- `targetId`: entidad interna de `data/game-facets-taxonomy.json`
- `targetType`: `genre`, `subgenre` o `facet`
- `confidence`: confianza de 0 a 1
- `status`: `approved`, `review` o `blocked`
- `notes`: explicación opcional

## Resolución

El resolver funciona en dos pasos:

1. Busca una coincidencia explícita en `data/facet-external-signal-mapping.json`.
2. Si no existe, intenta una coincidencia suave con `name`, `nameEn`, `aliases` y `searchAliases` de la taxonomía.

Las coincidencias explícitas pueden ser `approved`. Las coincidencias implícitas por alias quedan en `review` para evitar aplicar señales dudosas sin revisión.

## Reglas de seguridad

- No se crean entidades nuevas desde señales externas.
- Si `targetId` no existe en la taxonomía, el validador falla.
- Si `targetType` no coincide con la entidad interna, el validador falla.
- Las señales `review` pueden mostrarse como sugerencia, pero no deberían aplicarse automáticamente sin confirmación.
- Las señales `blocked` nunca deben aplicarse.

## Uso previsto

Esta capa será consumida por futuras fases:

- IA individual de ficha: mostrar señales encontradas y su mapeo.
- IA por lote: medir cobertura por fuente y confianza.
- Admin: permitir aceptar/rechazar facetas sugeridas.
- Búsqueda: mejorar equivalencias de usuarios sin duplicar categorías.

## No incluido en V1

- No asigna facetas a juegos.
- No modifica `data/game-details.json`.
- No añade campos nuevos a las fichas.
- No crea páginas públicas de facetas.
- No consulta Steam ni Vandal en vivo.
- No usa IA.

## Siguiente paso recomendado

`GAME_DETAILS_FACETS_STORAGE_V1`: añadir almacenamiento explícito de `subgenres` y `facets` en ficha de juego, manteniendo `genres` y `tags` separados.
