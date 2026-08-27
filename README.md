# Region Atlas

**RegionAtlasGames** (RAG) — catálogo multirregión de videojuegos, colección privada y mercado con precios orientados al mercado español.

- **Web:** [www.regionatlas.games](https://www.regionatlas.games) (`.com`, `.es` y el dominio sin `www` redirigen)
- **Logo:** Region Atlas

## Estructura de datos

| Capa | Archivo | Descripción |
|---|---|---|
| **Plataformas** | `data/platforms.json` | Sistemas retro y semi-cerrados |
| **Catálogo maestro** | `data/catalog.json` | Juegos por plataforma y región |
| **Colección usuario** | Vercel Blob privado | Inventario por usuario en producción |
| **Staging catálogo** | Vercel Blob privado | Fichas pendientes, enriquecimiento y publicación |
| **Datos locales** | `APP_DATA_DIR` | Desarrollo y herramientas de worker |

## Arrancar

```bash
npm ci
cp .env.example .env.local   # opcional
npm run dev
```

Comprobación completa:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Producción: `NEXT_PUBLIC_SITE_URL=https://www.regionatlas.games`

## Rutas principales

- `/` — Inicio + plataformas
- `/plataforma/[slug]` — Catálogo por consola
- `/catalogo/[slug]` — Ficha de juego (SEO)
- `/coleccion` — Inventario importado
- `/compania`, `/genero`, `/saga` — Índices museo
- `/admin/sistema` — Estado de almacenamiento, cron, recolección y diagnóstico

## Scripts útiles

```bash
npm run sync:prices      # precios ES desde ingest P2P
npm run museum:details   # fichas enriquecidas
npm run covers:seed      # portadas locales
```

La operación de producción, controles de seguridad y límites actuales están documentados en
[`docs/production-operations.md`](docs/production-operations.md).
