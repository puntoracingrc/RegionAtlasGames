# GAME_DETAILS_FACETS_STORAGE_V1

## Estado

Implemented. Esta fase prepara las fichas de juego para guardar géneros, subgéneros y facetas controladas sin migrar masivamente el catálogo.

## Objetivo

Las fichas de Region Atlas ya podían tener géneros clásicos. Ahora también pueden almacenar:

- `subgenres`: subgéneros controlados por `data/game-facets-taxonomy.json`.
- `facets`: facetas controladas, como tema, mecánica, formato, modo de jugador o estilo visual.

Esto permite que la IA, el editor manual y los paneles masivos guarden información más fina sin romper los géneros existentes.

## Flujo

1. El editor de ficha permite introducir subgéneros y facetas separados por coma.
2. La IA sigue usando fuentes oficiales y Steam como señal externa.
3. Las etiquetas externas de Steam solo se convierten en subgéneros/facetas si encajan con `FACET_EXTERNAL_SIGNAL_MAPPING_V1` o con alias existentes en la taxonomía.
4. Al guardar o publicar, los valores se escriben dentro de `GameDetails`.
5. La ficha pública muestra subgéneros y facetas enlazados a `/etiqueta/[slug]`.
6. Los perfiles de etiquetas también cuentan facetas guardadas directamente en la ficha.

## Reglas de seguridad

- No se modifica `data/game-details.json` de forma masiva.
- No se crean landings nuevas.
- No se crean entidades libres fuera de la taxonomía.
- No se usa scraping nuevo.
- No se toca Vercel, eBay ni Rakuten.
- Los borradores antiguos sin estos campos siguen funcionando.

## Siguiente paso

Con `FACETS_TAXONOMY_V2` y este almacenamiento ya preparados, la siguiente fase puede ser un panel de revisión de señales externas por lote: ver qué detectó Steam/Vandal/fuentes oficiales, aprobar o descartar, y después aplicar de forma controlada a fichas concretas.
