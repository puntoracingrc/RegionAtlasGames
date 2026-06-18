# GAME_FACETS_TAXONOMY_V2

## Estado

Implemented, not public.

Esta fase amplía la taxonomía controlada de Region Atlas Games para que pueda recibir señales de Steam, webs oficiales, Vandal, IGDB/RAWG u otras fuentes sin convertir cada fuente en etiquetas libres desordenadas.

No asigna facetas a juegos, no modifica fichas, no crea landings públicas y no cambia la UI pública.

## Objetivo

Crear un vocabulario amplio y cerrado para:

- géneros principales;
- subgéneros;
- facetas transversales;
- aliases en español e inglés;
- compatibilidad con términos gaming usados por usuarios españoles;
- futuro mapeo de etiquetas externas como Steam tags.

La fuente real sigue siendo:

```txt
data/game-facets-taxonomy.json
```

## Criterio de idioma

Regla editorial:

- ID técnico interno: inglés estable en `kebab-case`.
- Nombre visible: español cuando sea natural.
- Mantener en inglés términos adoptados por jugadores españoles: `RPG`, `JRPG`, `Shooter`, `Metroidvania`, `Soulslike`, `Roguelike`, `Co-op`, `PvP`, `Pixel Art`, `FMV`, `Beat 'em up`, `Shoot 'em up`.
- Añadir aliases en español, inglés y variantes habituales.

Ejemplo:

```json
{
  "id": "psychological-horror",
  "name": "Terror psicológico",
  "nameEn": "Psychological Horror",
  "slug": "terror-psicologico",
  "canonicalSlug": "psychological-horror",
  "aliases": ["psychological horror", "horror psicológico", "terror psicologico"]
}
```

## Campos V2

Cada entidad puede incluir:

- `id`: identificador estable interno.
- `name`: nombre visible principal.
- `nameEn`: nombre en inglés cuando aporta compatibilidad.
- `slug`: slug visible preparado para futuras rutas.
- `canonicalSlug`: slug técnico estable.
- `type`: `genre`, `subgenre` o `facet`.
- `family`: familia cerrada para subgéneros/facetas.
- `group`: agrupación editorial opcional para paneles.
- `subfamily`: agrupación secundaria opcional.
- `aliases`: sinónimos editoriales y traducciones reutilizables.
- `searchAliases`: sinónimos invisibles solo para búsqueda, frases naturales y formas coloquiales.
- `priority`: `A`, `B`, `C` o `D`.
- `publicEligible`: si puede aparecer en filtros/landings públicas futuras.
- `seoEligible`: si puede generar páginas SEO futuras.
- `status`: estado editorial.

## Cobertura añadida

V2 amplía la taxonomía para cubrir grandes bloques:

- Géneros principales y educativo.
- Acción/aventura/RPG/shooter/carreras/terror/estrategia/simulación/deportes/lucha/puzle.
- Visuales y perspectiva.
- Temas, ambientación, épocas, criaturas y personajes.
- Mood/tono.
- Mecánicas de combate, progresión y narrativa.
- Actividades del jugador.
- Modos de jugador.
- Estructura del juego.
- Deportes, vehículos y simulación.
- Content flags.
- Música/audio.
- Hardware, controles y periféricos retro.
- Contenido no-juego marcado como no prioritario.


## Conteos V2

Estado actual de la taxonomía ampliada:

- `genres`: 18
- `subgenres`: 96
- `facets`: 296

Estos conteos son vocabulario disponible, no asignaciones aplicadas a juegos.


## Sinónimos invisibles de búsqueda

V2 separa dos conceptos:

- `aliases`: equivalencias editoriales relativamente limpias.
- `searchAliases`: frases que puede escribir una persona aunque no deban mostrarse como etiqueta pública.

Ejemplos:

- `tipo Dark Souls` → `Soulslike`
- `yo contra el barrio` → `Beat 'em up`
- `estilo Metal Gear` → `Acción sigilosa`
- `aventura gráfica` → `Point & Click`
- `simulador de caminar` → `Walking Simulator`

Los `searchAliases` se consultan antes que los aliases normales para poder resolver frases coloquiales hacia una categoría concreta sin crear duplicados visibles.

### Tanda RPG/Shooter/Carreras/Terror/Estrategia/Deportes

Se ha añadido una segunda tanda de `searchAliases` para términos habituales de búsqueda y etiquetas externas, incluyendo:

- RPG: `estilo Final Fantasy`, `RPG tipo Baldur's Gate`, `ARPG`, `TRPG`, `SRPG`, `estilo Pokémon`.
- Shooter: `estilo Quake`, `estilo Rainbow Six`, `estilo Overwatch`, `estilo Borderlands`, `matamarcianos`, `danmaku`.
- Carreras: `estilo Mario Kart`, `estilo Need for Speed`, `WRC`, `F1`, `estilo Wipeout`.
- Terror: `estilo Resident Evil`, `estilo Silent Hill`, `horror cósmico`, `Jump Scare`.
- Estrategia/simulación: `RTS`, `TBS`, `Tower Defense`, `City Builder`, `Tycoon`, `estilo Populous`.
- Deportes/puzle: `FIFA`, `PES`, `eFootball`, `Tony Hawk`, `estilo Street Fighter`, `estilo Tekken`, `hidden object`, `Match 3`.

Las frases ambiguas se han resuelto con destino único para evitar duplicados de búsqueda:

- `combate por turnos` apunta a `RPG por turnos`.
- `SRPG` apunta a `Strategy RPG`.
- `conducción realista` apunta a `Simulación de carreras`.

### Tandas finales de sinónimos principales

Se han añadido las tandas finales de `searchAliases` para mejorar la búsqueda de categorías, géneros, subgéneros, tags y etiquetas principales sin crear etiquetas visibles duplicadas.

Cobertura añadida:

- Visual y cámara: `2D`, `2.5D`, `Pixel Art`, `anime`, `cámara al hombro`, `vista cenital`, `sobre raíles`.
- Temas y tono: `fantasía oscura`, `postapocalíptico`, `crimen`, `espionaje`, `cozy`, `melancólico`, `satírico`.
- Mecánicas: `loot`, `crafteo`, `árbol de habilidades`, `permadeath`, `score attack`, `speedrun`, `decisiones morales`.
- Estructura: `mundo abierto`, `lineal`, `por misiones`, `episódico`, `roguelike structure`, `campaña narrativa`.
- Deportes, vehículos y simulación: `FIFA`, `NBA`, `motocross`, `BMX`, `simulador de vuelo`, `tycoon`, `job simulator`.
- Terror y contenido sensible: `survival horror`, `jump scare`, `body horror`, `gore`, `contenido adulto`.
- Épocas, criaturas y personajes: `Roma`, `Guerra Fría`, `años 80`, `dragones`, `vampiros`, `samuráis`, `protagonista femenina`.
- Música, controles y periféricos: `OST`, `chiptune`, `VR`, `light gun`, `multitap`, `link cable`, `Expansion Pak`.

También se han añadido subgéneros de simulación que faltaban para poder recibir señales externas sin forzarlas a facetas genéricas:

- `Hobby Sim`
- `Job Simulator`
- `Simulación médica`
- `Simulación económica`

Los términos ambiguos se mantienen con un único propietario. Si una búsqueda puede significar varias cosas, se prioriza la entidad más concreta ya existente.

## Uso futuro con IA y Steam

Cuando el editor IA encuentre tags externos como `Psychological Horror`, `Open World`, `Co-op`, `Soulslike` o `Pixel Graphics`, no debe guardarlos como texto libre.

La fase futura debe:

1. normalizar el texto externo;
2. buscar coincidencia por `id`, `name`, `nameEn`, `slug`, `canonicalSlug` o `aliases`;
3. proponer una asignación con fuente y confianza;
4. permitir revisión humana antes de aplicar masivamente.

## Regla crítica

No volvemos al enfoque de reglas por título tipo “si el título contiene X”.

Ese enfoque queda descartado porque no escala a miles de juegos y genera ruido. La V2 se apoya en vocabulario controlado + señales externas + revisión.

## No assignments todavía

Esta fase no crea ni modifica:

```txt
data/game-facet-assignments.json
data/game-facet-assignments.local.json
data/game-details.json
```

## No landings todavía

Esta fase no crea rutas públicas nuevas como:

```txt
/tag/
/tags/
/facet/
/faceta/
/genre/
/genres/
```

Las landings llegarán después, con paginación, filtros por plataforma/región y control SEO.

## Prohibiciones

- No modificar juegos.
- No asignar facetas.
- No crear landings públicas.
- No modificar UI pública.
- No usar IA.
- No scraping Steam.
- No tocar Vercel.
- No tocar eBay.
- No tocar Rakuten.

## Siguiente fase recomendada

```txt
FACET_EXTERNAL_SIGNAL_MAPPING_V1
```

Objetivo:

- tomar tags de Steam/web oficial/Vandal como señales;
- mapear contra la taxonomía V2 por aliases;
- generar previews/reporte de calidad;
- permitir aplicar solo tras revisión.
