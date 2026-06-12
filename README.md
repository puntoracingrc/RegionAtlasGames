# Region Atlas

**RegionAtlasGames** (RAG) — catálogo multiregión de videojuegos con precios orientados al mercado español.

- **Web:** [regionatlas.games](https://regionatlas.games) (`.com` y `.es` redirigen)
- **Logo:** Region Atlas

## Estructura de datos

| Capa | Archivo | Descripción |
|---|---|---|
| **Plataformas** | `data/platforms.json` | Sistemas retro y semi-cerrados |
| **Catálogo maestro** | `data/catalog.json` | Juegos por plataforma y región |
| **Colección usuario** | `data/collections/` | Inventario por usuario (gitignored) |

## Arrancar

```bash
npm install
cp .env.example .env.local   # opcional
npm run dev
```

Producción: `NEXT_PUBLIC_SITE_URL=https://regionatlas.games`

## Rutas principales

- `/` — Inicio + plataformas
- `/plataforma/[slug]` — Catálogo por consola
- `/catalogo/[slug]` — Ficha de juego (SEO)
- `/coleccion` — Inventario importado
- `/compania`, `/genero`, `/saga` — Índices museo

## Scripts útiles

```bash
npm run sync:prices      # precios ES desde ingest P2P
npm run museum:details   # fichas enriquecidas
npm run covers:seed      # portadas locales
```
