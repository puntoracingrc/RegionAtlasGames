# GAMERSGATE_AFFILIATE_REVIEW_V1

## 1. Fit estratégico

GamersGate puede encajar en Region Atlas Games como proveedor potencial de juegos digitales para PC, Mac o Linux.

Encaja para:

- Juegos digitales de PC.
- Posibles ofertas digitales futuras.
- Una futura sección editorial de `PC games` u ofertas digitales, separada del catálogo físico/retro.

No encaja como fuente principal para:

- Retro físico.
- Consolas usadas.
- PS1, PS2, Game Boy, Nintendo 64 u otras plataformas físicas clásicas.
- Ediciones regionales físicas como PAL España, PAL Europa, UK, USK, ESRB o CERO.
- Valoraciones de mercado basadas en estado, portada, manual, disco, caja o región física.

Decisión: GamersGate no entra en `EBAY_SYNC_V1`, no sustituye a eBay para juegos retro/físicos y queda solo como candidato futuro para PC digital games.

## 2. Estado

Estado de esta fase:

- Review only.
- No implementation.
- No production.
- No frontend.
- No provider runtime.
- No affiliate links públicos todavía.

Según la revisión inicial del programa, el flujo básico parece ser:

1. Crear cuenta en GamersGate.
2. Entrar en `My Profile`.
3. Ir a `Affiliate program`.
4. Obtener un affiliate link personalizado.
5. Promocionar GamersGate y cobrar si hay ventas válidas.

GamersGate también indica que puede cancelar o ajustar comisiones si los pedidos se cancelan, se modifican o se consideran fraudulentos. Esto debe tratarse como una regla comercial normal de afiliación, no como fuente garantizada de ingresos.

## 3. Preguntas pendientes

Antes de cualquier implementación hay que resolver:

- ¿El programa es directo o vía CJ Affiliate?
- ¿Permite deep links a juegos concretos?
- ¿Ofrece product feed o API?
- ¿Cuál es la comisión?
- ¿Cuál es la cookie window?
- ¿Cómo paga?
- ¿Qué países acepta?
- ¿Permite price comparison/content sites?
- ¿Hay restricciones de SEM/brand bidding?
- ¿Hay limitaciones sobre cupones/descuentos?
- ¿Permite mostrar precios?
- ¿Permite usar imágenes, logos o product data?

## 4. Posible integración futura

### Si solo hay affiliate link genérico

Fase posible:

- `GAMERSGATE_MANUAL_LINKS_V1`

Características:

- Enlaces manuales por juego, plataforma digital o sección editorial.
- Sin API.
- Sin precios automáticos.
- Disclosure obligatorio.
- Todos los enlaces deben usar `rel="sponsored nofollow noopener noreferrer"` y `target="_blank"`.

### Si hay deep links

Fase posible:

- `GAMERSGATE_DEEP_LINKS_V1`

Características:

- Generar o guardar enlaces directos a juegos concretos.
- Validar que el programa permite deep links.
- Mantener una lista revisada/manual antes de publicar enlaces.
- No mezclar con precios históricos ni valoración de mercado físico.

### Si hay feed/API

Fase posible:

- `GAMERSGATE_PRODUCT_FEED_AUDIT_V1`

Características:

- Auditar permisos, términos, campos disponibles y caducidad de datos.
- Evaluar si se puede normalizar a `AffiliateOffer`.
- Verificar si se permite mostrar precio, disponibilidad, imágenes y nombres de producto.
- Mantener cache corta si los términos permiten precios/disponibilidad.

## 5. Reglas de seguridad

- No activar `AFFILIATE_OFFERS_ENABLED`.
- No meter variables en Vercel.
- No añadir links públicos.
- No scraping.
- No mostrar precios si no hay permiso/fuente autorizada.
- Todo futuro enlace debe renderizar `AffiliateDisclosure`.
- Todo enlace externo debe usar `rel="sponsored nofollow noopener noreferrer"`.
- Todo enlace externo debe usar `target="_blank"`.
- No mezclar ofertas digitales con valoraciones de precio de mercado físico.

## 6. Roadmap

Prioridades actuales:

- Mantener eBay como prioridad para retro/físico.
- Mantener Rakuten en espera de aprobación de GameStop/Zatu.
- Mantener GamersGate como posible proveedor digital PC.
- No mezclar GamersGate con `EBAY_SYNC_V1`.

Backlog posible:

- `GAMERSGATE_TERMS_AUDIT_V1`: revisar términos oficiales completos antes de implementar.
- `GAMERSGATE_MANUAL_LINKS_V1`: solo si el programa ofrece link genérico o deep links manuales fiables.
- `GAMERSGATE_DEEP_LINKS_V1`: solo si GamersGate permite deep links a productos concretos.
- `GAMERSGATE_PRODUCT_FEED_AUDIT_V1`: solo si existe feed/API autorizado.

Estado final de esta fase: documentación e investigación, sin código runtime y sin impacto público.
