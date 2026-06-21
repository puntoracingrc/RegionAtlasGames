# AFFILIATE_OFFERS_V1

Region Atlas Games muestra ofertas externas y enlaces afiliados sin convertirse en tienda propia.

Principios:

- Disclosure visible antes de cualquier enlace afiliado.
- Sin checkout, carrito, pagos, envíos, garantías ni devoluciones propias.
- Solo enlaces autorizados por el proveedor o anunciante.
- Sin redirecciones automáticas, iframes ocultos, autoclick ni cookie stuffing.
- Matching conservador: mejor mostrar menos ofertas que mostrar una incorrecta.
- eBay solo renderiza cards cuando Browse API devuelve `itemAffiliateWebUrl`.
- Si eBay no devuelve ofertas válidas, el fallback trackeado se muestra como CTA separado, no como oferta.
- Amazon solo renderiza cards cuando Creators API devuelve productos con `detailPageURL`.
- Amazon queda apagado salvo que `AMAZON_AFFILIATE_ENABLED=true` y existan credenciales Creators API.
- Amazon usa `AMAZON_ASSOCIATE_TAG` como partner tag global y no genera enlaces manuales por juego.
- Rakuten queda preparado pero desactivado por defecto.
- GamersGate queda en backlog/review para PC digital games, sin implementación pública.

Texto visible obligatorio:

```txt
Disclosure: Algunos enlaces de esta página son enlaces de afiliado. Si compras a través de ellos, Region Atlas Games puede recibir una comisión sin coste adicional para ti. Los precios y la disponibilidad pueden cambiar y deben confirmarse siempre en la tienda externa.
```

Los enlaces externos visibles deben usar:

```html
rel="sponsored nofollow noopener noreferrer"
target="_blank"
```

## Backlog / Review

- `GAMERSGATE_AFFILIATE_REVIEW_V1`: investigación/documentación para valorar GamersGate como proveedor potencial de juegos digitales PC/Mac/Linux. No implementa runtime, frontend, provider ni enlaces públicos. No forma parte de `EBAY_SYNC_V1`.

## Amazon Creators API

Variables esperadas en Production:

```txt
AMAZON_AFFILIATE_ENABLED=true
AMAZON_ASSOCIATE_TAG=punto04-21
AMAZON_CREATORS_CREDENTIAL_ID=...
AMAZON_CREATORS_CREDENTIAL_SECRET=...
AMAZON_CREATORS_CREDENTIAL_VERSION=3.2
AMAZON_MARKETPLACE=www.amazon.es
AMAZON_SEARCH_INDEX=VideoGames
AMAZON_AFFILIATE_LIMIT=4
```

La ficha pública no espera a Amazon durante el render inicial. El bloque de ofertas consulta `/api/catalog/offers/[catalogId]` bajo demanda y cachea la respuesta corta. Si Amazon falla, no rompe la ficha: eBay y el fallback siguen funcionando.
