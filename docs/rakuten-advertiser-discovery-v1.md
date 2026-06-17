# RAKUTEN_ADVERTISER_DISCOVERY_V1

Primera fase real de integración Rakuten para Region Atlas Games.

Objetivo: descubrir anunciantes/MIDs candidatos usando el endpoint backend:

```txt
GET https://api.linksynergy.com/advertisersearch/1.0?merchantname={query}
```

Este módulo no muestra ofertas públicas, no genera deep links, no usa Product Search y no activa Rakuten en producción.

## Salida normalizada

```json
{
  "provider": "rakuten",
  "advertiserId": "99999",
  "advertiserName": "Example Merchant",
  "source": "advertisersearch-1.0",
  "query": "game",
  "discoveredAt": "2026-06-17T00:00:00.000Z",
  "partnershipStatus": "unknown"
}
```

## Seguridad

- Usa `getRakutenAccessToken()` del backend.
- Envía `Authorization: Bearer {access_token}` solo en servidor/script.
- Envía `Accept: application/xml`.
- Maneja `401` limpiando token y reintentando una vez.
- Maneja `403` como rate limit, sin bucles.
- No imprime `access_token`, `refresh_token`, `client_secret`, `token-key` ni `Authorization`.
- No usa `NEXT_PUBLIC_RAKUTEN_*`.
- No se llama desde frontend público.

## Smoke local

```bash
RAKUTEN_ADVERTISER_SEARCH_QUERY=game npm run smoke:rakuten-advertiser-search
```

Salida segura esperada:

```txt
Rakuten advertiser search OK
Query: game
Results: 2
- 12345 Example Merchant
```

## Batch local de candidatos

Para buscar candidatos de forma local en varias palabras clave:

```bash
npm run discover:rakuten-advertisers
```

El script ejecuta búsquedas como `game`, `gaming`, `console`, `electronics`, `nintendo`, `playstation`, `xbox`, `retro`, `anime`, `manga` y otras relacionadas con Region Atlas Games.

La salida se guarda en:

```txt
data/rakuten-advertiser-candidates.local.json
```

Ese archivo está ignorado por Git y no debe subirse al repositorio porque puede contener resultados reales de tu cuenta Rakuten. El archivo público de ejemplo es:

```txt
data/rakuten-advertiser-candidates.example.json
```

Este batch solo descubre candidatos. No autoriza enlaces, no confirma partnerships, no activa Product Search, no genera Deep Links y no muestra nada en fichas públicas. Después de revisar los candidatos, Alberto debe solicitar manualmente los partnerships desde Rakuten.

## Revisión local de candidatos

Discovery encuentra candidatos, pero no decide si son útiles ni autoriza enlaces. Para crear una lista editable de revisión local:

```bash
npm run review:rakuten-advertisers
```

El script lee:

```txt
data/rakuten-advertiser-candidates.local.json
```

y genera o actualiza:

```txt
data/rakuten-advertiser-review.local.json
```

El archivo de review local está ignorado por Git. Sirve para clasificar candidatos con `relevanceStatus`, `priority`, `decision`, `notes` y `reviewedAt` sin perder decisiones manuales si se vuelve a ejecutar el discovery.

Valores de decisión recomendados:

- `apply`: pedir partnership manualmente en Rakuten.
- `maybe_later`: revisar más adelante.
- `ignore`: no interesa.
- `undecided`: pendiente.

Importante: marcar un advertiser como `apply` no autoriza enlaces afiliados. El partnership debe solicitarse y aprobarse manualmente en Rakuten antes de usar Product Search, Deep Links o cualquier oferta pública.
