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
