# GAME_FACETS_V1

## Estado

Implemented, not public.

Esta fase crea la taxonomía real controlada de géneros, subgéneros y facetas para Region Atlas Games, pero no asigna facetas a juegos, no crea landings públicas y no cambia la UI pública.

## Objetivo

Convertir el diseño auditado en `GAME_FACETS_TAXONOMY_AUDIT_V1` en una fuente real y validable:

```txt
data/game-facets-taxonomy.json
```

La taxonomía servirá como vocabulario cerrado para fases posteriores de clasificación, administración y búsqueda avanzada.

## Taxonomía real

La taxonomía se compone de tres colecciones:

- `genres`: familias principales de clasificación.
- `subgenres`: especializaciones dependientes de uno o varios géneros principales.
- `facets`: rasgos transversales que no deben convertirse en géneros.

Cada entidad incluye:

- `id`: identificador estable interno.
- `name`: nombre visible editorial.
- `slug`: slug estable para futuras rutas o filtros.
- `type`: `genre`, `subgenre` o `facet`.
- `aliases`: nombres alternativos para normalización futura.
- `description`: criterio editorial.
- `status`: estado editorial.

## Diferencia entre género, subgénero y faceta

### Género

Un género es una familia principal. Debe responder a la pregunta: “¿qué tipo grande de juego es?”.

Ejemplos:

- Acción
- Aventura
- RPG
- Deportes
- Carreras
- Terror

### Subgénero

Un subgénero concreta un género principal y siempre apunta a uno o varios `parentGenreIds` existentes.

Ejemplos:

- Survival Horror → Terror + Aventura
- JRPG → RPG
- Kart Racing → Carreras
- FPS → Shooter

### Faceta

Una faceta es una etiqueta controlada y transversal. Sirve para describir rasgos combinables sin romper la estructura de géneros.

Ejemplos:

- Cooperativo local
- Pixel art
- Zombis
- Portada PAL España
- Demo / Promo
- Remaster

## Familias de facetas

Las facetas se agrupan por familias cerradas:

- `content`: licencias, contenido o naturaleza del producto.
- `edition`: edición, versión, promo, demo o reedición.
- `format`: formato interactivo o presentación.
- `gameplay`: patrón jugable.
- `market`: región, portada o edición física relevante para mercado.
- `mechanic`: mecánica concreta.
- `perspective`: cámara o punto de vista.
- `player_mode`: modo de jugador.
- `setting`: ambientación.
- `sport`: deporte concreto.
- `technical`: rasgos técnicos.
- `theme`: tema narrativo o visual.
- `visual`: estilo gráfico.

## Librería

La fase añade una librería interna:

```txt
src/lib/game-facets/
  taxonomy.ts
  types.ts
  normalize.ts
  validate.ts
```

La librería permite:

- leer la taxonomía real;
- validar estructura y relaciones;
- normalizar texto y slugs;
- buscar entidades por id, slug, nombre o alias;
- consultar conteos.

## Validación

El comando principal es:

```bash
npm run validate:game-facets-v1
```

Comprueba:

- existencia de `data/game-facets-taxonomy.json`;
- ids únicos globales;
- slugs únicos por tipo;
- `parentGenreIds` válidos;
- familias de facetas permitidas;
- ausencia de asignaciones juego-faceta;
- ausencia de landings públicas nuevas;
- ausencia de IA y scraping Steam;
- inclusión en `validate:all`.

## No assignments todavía

Esta fase no crea:

```txt
data/game-facet-assignments.json
data/game-facet-assignments.local.json
```

Tampoco modifica `data/game-details.json` ni aplica taxonomía a los 36.000 juegos.

## No landings todavía

Esta fase no crea rutas públicas nuevas como:

```txt
/tag/
/genre/
/facet/
/faceta/
```

Las futuras landings deberán esperar a una fase posterior y a una revisión SEO/UX específica.

## Prohibiciones de V1

- No modificar masivamente juegos.
- No crear asignaciones juego-faceta.
- No crear landings públicas.
- No modificar UI pública.
- No usar IA.
- No hacer scraping.
- No hacer scraping Steam.
- No tocar eBay.
- No tocar Rakuten.
- No tocar Vercel.
- No hacer deploy.
- No hacer push.

## Siguiente fase recomendada

La siguiente fase debe ser:

```txt
GAME_FACET_ASSIGNMENT_RULES_V1
```

Objetivo futuro:

- definir reglas transparentes para sugerir géneros/subgéneros/facetas;
- usar alias, títulos, series, compañías y géneros existentes;
- funcionar primero en dry-run;
- no escribir asignaciones hasta validación humana.

## Evolución V2

La ampliación controlada posterior queda documentada en:

```txt
docs/game-facets-taxonomy-v2.md
```

`GAME_FACETS_TAXONOMY_V2` amplía aliases, subgéneros y facetas para preparar el futuro mapeo de señales externas como Steam, webs oficiales o Vandal, pero mantiene las mismas prohibiciones: no asigna juegos, no crea landings y no modifica UI pública.
