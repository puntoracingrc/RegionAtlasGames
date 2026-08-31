# Autoridad central de comunicaciones

## Alcance actual

La compraventa usa `communications-v1.json` como única fuente de verdad para:

- conversaciones y mensajes;
- participantes y último mensaje leído por usuario;
- bloqueos entre participantes;
- notificaciones internas;
- eventos idempotentes de salida.

En producción el documento es privado y se guarda en Vercel Blob. En desarrollo usa
`APP_DATA_DIR/marketplace`. El PC worker no participa en este flujo: los mensajes deben seguir
funcionando aunque el PC esté apagado.

## Migración

La primera lectura crea el estado versionado de forma atómica. Si existen
`conversations.json` o `blocks.json`, se importan una sola vez. Los mensajes antiguos se marcan
como leídos para no generar avisos históricos falsos. Después de inicializarse, los documentos
anteriores dejan de ser fuentes activas y se conservan únicamente como respaldo.

No se debe borrar `communications-v1.json` después de recibir mensajes nuevos: hacerlo
reactivaría una copia antigua durante la siguiente inicialización.

## Contratos

- Enviar un mensaje guarda mensaje, evento y notificación en la misma mutación.
- `clientMutationId` evita duplicados cuando el navegador reintenta un envío.
- Leer una notificación no equivale a leer la conversación.
- Abrir el chat avanza el cursor de lectura del participante y cierra sus avisos de mensaje.
- Un usuario solo puede leer o mutar conversaciones en las que participa.

Los eventos actuales son `message.created`, `listing.approved`, `listing.rejected`,
`sale.marked` y `sale.completed`.

## Evolución a Postgres

La lógica de dominio no depende de rutas físicas de Blob. Cuando se aprovisione una base para
Region Atlas, el estado se separará en conversaciones, participantes, mensajes, notificaciones
y outbox, manteniendo las mismas funciones y contratos públicos. La migración deberá incluir
recuento, checksum, lectura comparada y un corte explícito; nunca una escritura doble indefinida.
