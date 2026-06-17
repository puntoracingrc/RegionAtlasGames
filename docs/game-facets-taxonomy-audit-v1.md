# GAME_FACETS_TAXONOMY_AUDIT_V1

## Objetivo

Esta fase define una arquitectura segura para clasificar juegos de Region Atlas Games sin publicar cambios, sin etiquetar masivamente el catálogo y sin crear landings SEO nuevas. El sistema separa claramente géneros principales, subgéneros y facetas/etiquetas controladas.

La idea central es evitar un catálogo con cientos de géneros mezclados y pasar a un modelo más limpio:

- pocos géneros principales;
- subgéneros editoriales claros;
- facetas/tags controlados para rasgos combinables;
- asignaciones con fuente, confianza y estado;
- reglas automáticas conservadoras;
- IA solo como sugerencia revisable.

## Problema

El campo clásico de género no basta para describir bien un videojuego. Un juego puede tener un género amplio, varios subgéneros y muchos rasgos descriptivos. Si todo se mezcla en géneros, aparecen duplicados, categorías pobres y landings SEO débiles.

Ejemplo correcto para `Hollow Knight`:

- Género principal: `Adventure`.
- Subgéneros: `Metroidvania`, `Platformer`.
- Facetas: `2D`, `Side Scroller`, `Exploration`, `Difficult`, `Boss Fights`, `Atmospheric`, `Dark Fantasy`, `Singleplayer`.

Ejemplo incorrecto:

- Género: `Adventure Metroidvania Platformer 2D Difficult Dark Fantasy Boss Fights`.

## Diferencia entre género, subgénero y faceta

### Género principal

Es el cajón grande, estable y con pocos valores. Debe servir para navegar el catálogo sin convertir cada matiz en una categoría nueva.

Ejemplos iniciales:

- Action
- Adventure
- RPG
- Racing
- Sports
- Shooter
- Fighting
- Platformer
- Puzzle
- Strategy
- Simulation
- Horror
- Music
- Party
- Visual Novel

### Subgénero

Es un tipo concreto dentro de uno o varios géneros. Puede cruzar varias familias, pero debe seguir siendo editorialmente útil.

Ejemplos:

- Metroidvania
- Survival Horror
- JRPG
- Tactical RPG
- Arcade Racing
- Simulation Racing
- Kart Racing
- Roguelike
- Roguelite
- Beat 'em up
- Bullet Hell
- Point and Click
- Deckbuilder
- Farming Sim
- Life Sim

### Faceta / tag

Es un rasgo combinable. No debe sustituir a los géneros. Describe gameplay, perspectiva, tema, tono, estructura, modo de juego o característica técnica.

Ejemplos:

- 2D
- 3D
- Pixel Art
- Hand-drawn
- First Person
- Third Person
- Side Scroller
- Top Down
- Isometric
- Open World
- Linear
- Singleplayer
- Multiplayer
- Local Co-op
- Online PvP
- Boss Fights
- Exploration
- Difficult
- Atmospheric
- Dark Fantasy
- Sci-Fi
- Zombies
- Cyberpunk
- Split Screen
- Story Rich
- Multiple Endings

Regla de oro:

> Género = cajón principal. Subgénero = tipo concreto. Faceta/tag = rasgo descriptivo combinable.

## Modelo de entidades

### GenreEntity

```ts
type GenreEntity = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: "approved" | "draft" | "deprecated";
};
```

### SubgenreEntity

```ts
type SubgenreEntity = {
  id: string;
  name: string;
  slug: string;
  parentGenreIds: string[];
  aliases?: string[];
  description?: string;
  status: "approved" | "draft" | "deprecated";
};
```

### FacetEntity

```ts
type FacetEntity = {
  id: string;
  name: string;
  slug: string;
  family:
    | "gameplay"
    | "visual"
    | "perspective"
    | "theme"
    | "mood"
    | "player_mode"
    | "structure"
    | "technical_feature";
  aliases?: string[];
  description?: string;
  status: "approved" | "draft" | "deprecated";
};
```

### GameFacetAssignment

```ts
type GameFacetAssignment = {
  gameId: string;
  facetId: string;
  weight: number;
  confidence: number;
  source: "manual" | "rule" | "imported_source" | "ai_suggestion";
  status: "approved" | "suggested" | "rejected";
  reviewed: boolean;
  reviewedAt: string | null;
};
```

## Fuente, confianza y estado

Cada asignación debe guardar `source`, `confidence` y `status`.

### Confidence

- `0.95 - 1.00`: muy seguro.
- `0.85 - 0.94`: seguro.
- `0.70 - 0.84`: posible.
- `< 0.70`: no asignar automáticamente.

### Status

- `approved`: puede mostrarse públicamente cuando la fase pública exista.
- `suggested`: existe internamente, pendiente de revisión o validación.
- `rejected`: descartado.

### Sources

- `manual`: revisado por humano.
- `rule`: regla automática interna.
- `imported_source`: fuente externa permitida/licenciada/API clara.
- `ai_suggestion`: sugerencia de IA, nunca dato final automático.

## Política sobre Steam

Steam puede servir como referencia conceptual, pero no como fuente scrapeada masiva.

No se permite:

- scraping masivo de Steam;
- copiar tags juego por juego desde Steam;
- copiar descripciones;
- copiar imágenes;
- copiar reviews;
- copiar precios;
- copiar assets;
- importar tags masivos por appId.

Region Atlas Games necesita una taxonomía propia orientada a videojuegos físicos, regiones PAL/NTSC, plataformas antiguas, coleccionismo, mercado de segunda mano y ediciones españolas/europeas/japonesas/americanas.

Si en el futuro se evalúa una API oficial de Steam, debe abrirse una fase separada: `STEAM_DATA_SOURCE_AUDIT_V1`.

## Política sobre IA

La IA puede ayudar más adelante, pero solo como motor de sugerencias.

Permitido en fase futura:

- sugerir facetas desde una lista cerrada;
- devolver `confidence` y `reason`;
- señalar dudas o contradicciones;
- priorizar revisión humana.

Prohibido:

- crear tags libremente;
- etiquetar 30.000 juegos y publicar todo;
- modificar producción sin validación;
- sobrescribir datos revisados por humano.

Fase futura propuesta: `GAME_FACET_AI_SUGGESTIONS_V1`.

## Estrategia para no etiquetar 30.000 juegos a mano

La estrategia debe ser por capas:

1. Taxonomía controlada.
2. Diagnóstico de datos actuales.
3. Reglas automáticas conservadoras.
4. IA solo como sugerencia dentro de lista cerrada.
5. Revisión humana parcial.
6. Publicación progresiva.

Prioridad de revisión:

1. Juegos con más tráfico.
2. Juegos con ofertas afiliadas.
3. Juegos caros o coleccionables.
4. Juegos populares.
5. Juegos que puedan generar landings SEO fuertes.
6. Juegos con baja confianza.
7. Juegos con contradicciones.

## Reglas automáticas futuras

No se implementan en esta fase. Solo quedan documentadas para `GAME_FACET_ASSIGNMENT_RULES_V1`.

Ejemplos conservadores:

- Título contiene `FIFA` o `PES`: `Sports`, faceta `Football`, confianza `0.95`.
- Título contiene `NBA`: `Sports`, faceta `Basketball`, confianza `0.95`.
- Título contiene `Gran Turismo`: `Racing`, subgénero `Simulation Racing`, faceta `Cars`, confianza `0.95`.
- Título contiene `Mario Kart`: `Racing`, subgénero `Kart Racing`, faceta `Local Multiplayer`, confianza `0.95`.
- Título contiene `Resident Evil`: `Horror`, subgénero `Survival Horror`, faceta `Zombies`, confianza `0.90`.

## SEO y landings futuras

No se crean landings en esta fase.

Fase futura: `GAME_FACET_LANDINGS_V1`.

Reglas futuras recomendadas:

- Tag con `0-4` juegos: `noindex, follow`.
- Tag con `5-19` juegos: indexable solo si tiene descripción editorial suficiente.
- Tag con `20+` juegos: indexable si supera política anti thin-content.
- Combinaciones de tags: `noindex` por defecto.

Ejemplos de landings buenas futuras:

- `/tag/metroidvania/`
- `/tag/survival-horror/`
- `/tag/jrpg/`
- `/tag/pixel-art/`
- `/tag/local-coop/`
- `/juegos/survival-horror/ps2/`

Ejemplos peligrosos:

- `/tag/cozy/dreamcast/pal-espana/caja-metalica/`

## Riesgos

- Convertir facetas en géneros duplicados.
- Crear demasiadas etiquetas poco útiles.
- Publicar landings sin contenido editorial.
- Importar datos externos sin permiso claro.
- Permitir que la IA invente etiquetas.
- Modificar demasiadas fichas de golpe.
- Mezclar mercado físico retro con taxonomías digitales de PC.

## Fases futuras

Roadmap recomendado:

1. `GAME_FACETS_TAXONOMY_AUDIT_V1`: diseño + diagnóstico, sin cambios públicos.
2. `GAME_FACETS_V1`: crear taxonomía real controlada.
3. `GAME_FACET_ASSIGNMENT_RULES_V1`: reglas automáticas conservadoras.
4. `GAME_FACET_AI_SUGGESTIONS_V1`: IA sugiere desde lista cerrada.
5. `GAME_FACET_REVIEW_V1`: revisión humana parcial.
6. `GAME_FACET_LANDINGS_V1`: landings SEO controladas.
7. `GAME_RECOMMENDATIONS_BY_FACETS_V1`: juegos parecidos por facetas compartidas.

Backlog relacionado:

- `STEAM_DATA_SOURCE_AUDIT_V1`
- `IGDB_DATA_SOURCE_AUDIT_V1`
- `WIKIDATA_GAME_ENTITIES_AUDIT_V1`
- `GAME_FACET_SEO_POLICY_V1`

## Criterios de aceptación

Esta auditoría queda cerrada cuando:

- existe este documento;
- existe `data/game-facets-taxonomy.example.json`;
- existe `npm run analyze:game-facets-coverage`;
- existe `npm run validate:game-facets-taxonomy-audit-v1`;
- `validate:all` incluye el validador;
- `validate:all` pasa;
- TypeScript pasa;
- no hay nuevas landings públicas;
- no se han modificado juegos masivamente;
- no se ha scrapeado Steam;
- no se ha usado IA para escribir producción;
- no se ha tocado afiliación ni Vercel.
