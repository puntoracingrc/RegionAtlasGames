# Prioridad de país en los anuncios de eBay

Las ofertas de una ficha con país concreto se buscan primero en ese país y se muestran antes de las de otros orígenes. Por ejemplo, una ficha PAL Italia prioriza artículos ubicados en Italia; PAL España prioriza España y NTSC-J China prioriza China. El país se toma del modelo regional de la ficha, sin interpretar su URL histórica ni el idioma del juego.

Se conservan el marketplace configurado, la moneda devuelta y el destino de entrega España. Origen y destino son filtros distintos en la [documentación oficial de eBay](https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html). El país del vendedor sirve para ordenar ofertas; no verifica la región o edición del ejemplar.

## Flujo

1. `ebayPriorityCountry()` resuelve `regionCode`, después `marketRegion` y finalmente las etiquetas regionales antiguas. Los mercados amplios, compuestos o pendientes devuelven `null`: Europa, Asia y USA/Canadá no se convierten en un único país.
2. `getEbayOffers()` usa `itemLocationCountry:<país>` en la primera consulta, manteniendo `deliveryCountry:ES`. Si hay menos de tres resultados válidos del país, amplía a otros orígenes. Sin país concreto, hace directamente la consulta amplia.
3. Los resultados se deduplican y se agrupan por el país explícito del artículo. Un origen ausente no se da por confirmado por haber aparecido en una consulta restringida.
4. La API devuelve `ebayPriorityCountry`. Las tarjetas mantienen ese grupo primero al ordenar por precio, fecha o distancia. La prioridad se aplica a eBay; las ofertas de usuarios y otras tiendas conservan su tratamiento existente.
5. El bloque muestra «eBay · Prioridad: Italia» (o el país correspondiente) y separa «Otros orígenes». Al cambiar de ficha se reinicia el bloque para no conservar anuncios de la ficha anterior durante la carga.

El umbral se puede configurar con `EBAY_AFFILIATE_PRIORITY_MIN`; el antiguo `EBAY_AFFILIATE_SPAIN_MIN` se conserva como alternativa compatible. No hace falta cambiar la configuración existente. Las URLs públicas, el catálogo y el worker de precios no se modifican.

## Validación

Las pruebas de `ebay-offer-priority.test.ts` cubren países y alias, China/Corea frente a la familia NTSC-J, mercados compuestos, países desconocidos, deduplicación y llamadas reales al servicio con respuestas de eBay simuladas. `catalog-offer-sort.test.ts` comprueba que una oferta extranjera más barata o reciente no adelanta al grupo prioritario, manteniendo el orden elegido dentro de cada grupo.

La comprobación de navegador local usa un simulador externo al checkout, identificado como «PRUEBA LOCAL», para recorrer ficha → API → eBay simulado → tarjetas y cambiar el orden. El simulador no se despliega. El expediente de publicación conserva por separado la comprobación de los anuncios reales en producción.
