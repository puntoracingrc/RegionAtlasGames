# EBAY_SYNC_V1

## 1. Objetivo

Preparar una integración backend con eBay Browse API para buscar listings concretos por ficha de juego, normalizarlos al modelo común `AffiliateOffer` y mostrarlos como bloque de ofertas externas cuando la afiliación esté activada.

Region Atlas Games sigue siendo catálogo, base de datos y guía de videojuegos. No se convierte en tienda propia.

## 2. Estado: implemented / disabled by default

Estado de esta fase:

- Implementado backend y bloque público.
- Desactivado por defecto mediante variables.
- Ofertas públicas solo si `AFFILIATE_OFFERS_ENABLED=true` y `EBAY_AFFILIATE_ENABLED=true`.
- Variables eBay configurables en Vercel / servidor.
- Sin Product Search/Deep Links de Rakuten.
- Sin Feed API, Feed Beta API ni Notification API.

## 3. Variables de entorno

Solo para `.env.local` cuando existan credenciales reales:

```env
EBAY_AFFILIATE_ENABLED=false
EBAY_ENV=production
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_OAUTH_TOKEN_ENDPOINT=https://api.ebay.com/identity/v1/oauth2/token
EBAY_OAUTH_SCOPE=https://api.ebay.com/oauth/api_scope
EBAY_BROWSE_API_BASE=https://api.ebay.com/buy/browse/v1
EBAY_MARKETPLACE_ID=EBAY_ES
EBAY_CAMPAIGN_ID=
EBAY_CUSTOM_ID_PREFIX=rag
EBAY_CONTEXTUAL_COUNTRY=ES
EBAY_CONTEXTUAL_ZIP=
EBAY_AFFILIATE_LIMIT=6
EBAY_AFFILIATE_IMPRESSION_PIXEL_URL=
EBAY_AFFILIATE_MPT=
EBAY_AFFILIATE_MKCID=1
EBAY_AFFILIATE_MKRID=1185-53479-19255-0
EBAY_AFFILIATE_MKEVT=2
EBAY_AFFILIATE_SITE_ID=186
EBAY_AFFILIATE_AD_TYPE=0
EBAY_AFFILIATE_TOOL_ID=20012
EBAY_AFFILIATE_CUSTOM_ID=region-atlas-games
```

`AFFILIATE_OFFERS_ENABLED` y `EBAY_AFFILIATE_ENABLED` controlan producción. Si no están activos, no se muestra el bloque eBay.

## 4. OAuth Application Access Token

V1 usa solo Application Access Token con `client_credentials`.

No se implementa:

- User Token.
- Authorization Code Flow.
- RuName.
- Refresh Token de usuario.
- Sell APIs.
- Order APIs.

El token se guarda solo en memoria, se renueva antes de caducar y se limpia si eBay responde 401 para reintentar una sola vez.

## 5. Browse API Search

V1 usa únicamente:

```txt
GET /item_summary/search
```

Ejemplos de búsqueda:

```txt
Silent Hill 2 PS2 PAL España PAL
Super Mario 64 Nintendo 64 PAL España PAL
Metal Gear Solid PS1 PAL España PAL
Pokemon Game Boy NTSC USA USA
Zelda Ocarina of Time Nintendo 64 Japanese Japan
```

Headers:

```txt
Authorization: Bearer {access_token}
X-EBAY-C-MARKETPLACE-ID: EBAY_ES
```

Si existe `EBAY_CAMPAIGN_ID`, se prepara `X-EBAY-C-ENDUSERCTX` con `affiliateCampaignId` y `affiliateReferenceId`:

```txt
affiliateCampaignId=${EBAY_CAMPAIGN_ID},affiliateReferenceId=rag-game-{gameSlug}-{platformSlug}
```

Si no hay plataforma, el patrón queda `rag-game-{gameSlug}`.

## 6. Affiliate URL policy

Regla crítica:

- `itemAffiliateWebUrl` se usa como `affiliateUrl`.
- `itemWebUrl` se guarda solo como `rawProductUrl` / referencia cruda.
- Si no hay `itemAffiliateWebUrl`, la oferta normalizada queda como `invalid_affiliate_url`.
- En el bloque público, si no hay resultados válidos de API, se muestra un fallback de búsqueda de eBay con `campid` y `customid` automáticos.

No generar enlaces manuales por juego.

## 7. Matching conservador

Se reutiliza el scoring común de afiliados y se bloquean señales de listings incorrectos:

- `manual only`
- `box only`
- `empty box`
- `case only`
- `cover only`
- `guide`
- `strategy guide`
- `soundtrack`
- `ost`
- `repro`
- `reproduction`
- `fake`
- `digital code`
- `account`
- `broken`
- `not working`
- `for parts`
- `solo manual`
- `solo caja`
- `caja vacía`
- `carátula`
- `guía`
- `reproducción`
- `no funciona`
- `para piezas`

Score:

- `>= 0.85`: oferta válida si tiene `itemAffiliateWebUrl`.
- `0.65 - 0.84`: relacionada / pendiente de revisión.
- `< 0.65`: ocultar.

Es mejor mostrar menos resultados que mostrar ofertas incorrectas.

## 8. Availability / expiration

Si eBay devuelve `itemEndDate` en el pasado, la oferta queda como `expired`.

Si eBay devuelve `estimatedAvailabilityStatus = OUT_OF_STOCK`, la oferta queda como `inactive`.

Si no hay `itemEndDate`, V1 usa TTL corto. Recomendación:

- Listings eBay: 1-6 horas en local/staging.
- Si el listing tiene `itemEndDate`, usarlo como expiración.
- Si una oferta está caducada, no mostrarla como activa.

## 9. Feed API decision

Feed API queda fuera de V1.

Motivos:

- Es ingesta masiva de inventario por categorías o marketplace.
- No es búsqueda puntual por ficha de juego.
- Puede requerir elegibilidad / Limited Release.
- Obliga a almacenamiento masivo, deduplicación, refresh jobs y expiración.
- No es necesario mientras no haya ofertas públicas ni demanda real medida.

## 10. Feed API v1 decision

Feed Beta API / Feed API v1 quedan documentadas solo como backlog futuro.

No se implementa en V1:

- `getAccess`
- `getFeedTypes`
- `getFeedType`
- `getFiles`
- `getFile`
- `downloadFile`
- rutas `/buy/feed/`

## 11. Notification API decision

Notification API queda fuera de V1.

No se implementa:

- `/commerce/notification/`
- `getConfig`
- `createDestination`
- `createSubscription`
- `getTopics`
- `getPublicKey`
- `testSubscription`
- webhooks
- validación de payloads
- procesamiento de eventos

Motivo: todavía no persistimos listings eBay como inventario propio ni necesitamos eventos push de precio/disponibilidad.

## 12. Security rules

Prohibido:

- `NEXT_PUBLIC_EBAY_*`
- imprimir `access_token`
- imprimir `client_secret`
- imprimir `Authorization`
- imprimir campaign id completo
- guardar tokens en disco
- scraping de eBay
- checkout / carrito / pagos / pedidos

Todo enlace afiliado público debe ir acompañado de disclosure y usar:

```html
target="_blank"
rel="sponsored nofollow noopener noreferrer"
```

## 13. Smoke scripts

OAuth:

```bash
npm run smoke:ebay-auth
```

Salida esperada:

```txt
eBay auth OK
expires_in detected
```

Búsqueda:

```bash
EBAY_SEARCH_QUERY="Silent Hill 2 PS2 PAL" npm run smoke:ebay-search
```

Salida permitida:

```txt
eBay search OK
Marketplace: EBAY_ES
Query: Silent Hill 2 PS2 PAL
Results: 10
- itemId | title | price | currency | hasAffiliateUrl true/false
```

## 14. Tests

```bash
npm run test:ebay-sync-v1
```

Cubre auth básica, cache de token, retry 401, normalización, política de URL afiliada, precio, envío, condición, bloqueo de basura, scoring conservador, provider apagado y ausencia de secretos en logs.

## 15. Validators

```bash
npm run validate:ebay-sync-v1
npm run validate:all
npx tsc --noEmit --pretty false
```

El validador comprueba estructura, variables por defecto, ausencia de `NEXT_PUBLIC_EBAY`, uso de `itemAffiliateWebUrl`, fallback de búsqueda con tracking, píxel de impresión, soporte de marketplace/end-user context y que Feed/Notification sigan fuera del código V1.

## 16. Future backlog

No implementar ahora:

- `EBAY_FEED_ACCESS_AUDIT_V1`: comprobar si la cuenta/app tiene acceso real a Feed API v1.
- `EBAY_FEED_DISCOVERY_V1`: evaluar ingesta masiva por categorías si Region Atlas Games necesita inventario propio.
- `EBAY_LISTING_REFRESH_V1`: refrescar listings persistidos usando Browse API `getItem`.
- `EBAY_NOTIFICATION_AUDIT_V1`: listar topics disponibles, scopes, restricciones y utilidad real.
- `EBAY_NOTIFICATIONS_V1`: solo si hay inventario persistido, endpoints públicos seguros, colas y necesidad real de eventos push.
- `EBAY_EPN_TRACKING_AUDIT_V1`: validar tracking EPN si algún día se usan feeds.

## Inventory Discovery & Refresh decision

V1 usa Browse API porque Region Atlas Games necesita búsqueda puntual y controlada de listings por ficha de juego.

Feed API / Feed Beta API quedan fuera de V1 porque implican ingesta masiva de inventario, almacenamiento, deduplicación, jobs programados y control de categorías.

Notification API queda fuera de V1 porque todavía no persistimos listings eBay como inventario propio ni necesitamos recibir eventos push de cambios de precio/disponibilidad.

Para V1, la estrategia de refresh será simple:

- Búsqueda bajo demanda por ficha.
- Cache corto.
- No guardar inventario masivo.
- No crear jobs globales.
- No mostrar ofertas públicas si `AFFILIATE_OFFERS_ENABLED` y `EBAY_AFFILIATE_ENABLED` no están activos.

Regla: Browse API sigue siendo la única fuente eBay de V1.
