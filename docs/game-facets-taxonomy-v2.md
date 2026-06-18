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
- `aliases`: sinónimos, traducciones y búsquedas frecuentes.
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
- `subgenres`: 92
- `facets`: 293

Estos conteos son vocabulario disponible, no asignaciones aplicadas a juegos.

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
