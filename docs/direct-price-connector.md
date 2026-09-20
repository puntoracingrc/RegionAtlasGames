# Publicación directa de precios desde el task

El conector publica datos persistentes por HTTPS. Cada lote posterior **no necesita Git, commits, PR, fusión, build ni despliegue**. La instalación inicial del endpoint sí es un cambio de servidor.

## Contrato

`POST /api/integrations/prices?mode=publish`, con `Authorization: Bearer …`, una ficha exacta por solicitud. `mode=preview` comprueba contra los precios vigentes sin guardar nada. `GET` comprueba autenticación y almacenamiento.

- El task lee/aplica el manual y decide qué anuncios acepta. El conector no sustituye esa investigación ni convierte un match automático en una validación humana.
- Moneda EUR, sin mezclar envío. Estados `loose` (juego/cartucho/disco suelto), `complete` (usado completo) y `sealed` (precintado), separados.
- La identidad debe coincidir con una ficha pública exacta: `catalogId`, título/edición, plataforma y región. No se exigen palabras regionales en anuncios de USA/Japón u otros mercados; la investigación aplica esa regla únicamente a España.
- El servidor vuelve a calcular la media de los anuncios incluidos. Si falta el precio del mismo estado, introduce esa media; si existe, publica `(anterior + media) / 2`, redondeando a céntimos (mitades hacia arriba).
- No impone un mínimo de anuncios: muestra única sigue siendo provisional. La depuración por mediana ocurre antes, en la investigación, y se conserva en el informe original.
- Solo modifica precios y sus metadatos. No crea juegos ni variantes ni cambia regiones, portadas, contenido o detalles.
- El recibo guarda task, lote, enlaces, importes antes/media/después. Recibo y precios se escriben juntos mediante ETag/CAS en el Blob de la ficha.
- Reintentar el mismo `batchId` y contenido devuelve el recibo anterior. Otro contenido con ese identificador falla. Un anuncio ya incorporado a esa ficha no se vuelve a promediar en otro lote.
- La atomicidad es por ficha, no por todo el catálogo. Una interrupción permite repetir el archivo completo: las fichas ya publicadas se omiten. El cliente se detiene en el primer error y conserva todos los recibos previos.
- Se conserva `recommendedPrice` antiguo como usado completo solo si no había ningún desglose por estado, igual que el importador provisional anterior. Todos los estados leen el mismo snapshot previo, independientemente de su orden.

## Credenciales

Variables **solo del servidor**, en producción:

```
PRICE_CONNECTOR_ENABLED=1
PRICE_CONNECTOR_TOKEN_SHA256=<sha256 de una credencial aleatoria de 32 bytes o más>
```

La credencial en claro permanece en este PC, fuera de Git, en `~/.config/regionatlas-price-connector/credentials.json` con permisos `0600`:

```json
{"baseUrl":"https://www.regionatlas.games","token":"<credencial>"}
```

El cliente no acepta otro destino ni sigue redirecciones con el token. No utiliza cookies de administrador, contraseñas, credenciales de Git ni claves de Blob. No imprimir la credencial en consola. Para revocar: desactivar el conector o rotar el hash y desplegar la configuración. No copiar las credenciales de producción a previews.

## Uso

```bash
python3 scripts/publish_direct_prices.py status
python3 scripts/publish_direct_prices.py prepare --input /ruta/precios-propuestos.json --task-id ID_DEL_TASK
python3 scripts/publish_direct_prices.py preview --input /ruta/precios-propuestos.json --task-id ID_DEL_TASK
python3 scripts/publish_direct_prices.py publish --input /ruta/precios-propuestos.json --task-id ID_DEL_TASK
```

`prepare` es totalmente local. `preview` es opcional, no una aprobación humana obligatoria. `publish` publica directamente. `--catalog-id` permite una ficha; `--limit` limita la tanda; `--report` elige el archivo local de recibos JSONL. Conservar el mismo task y lote al reintentar.

El informe de 793 precios se puede preparar con este cliente, pero crear/activar el conector no publica ese lote automáticamente.

## Persistencia, errores y límites

El conector exige el overlay persistente habilitado; nunca simula éxito escribiendo solo en un JSON local. El índice de fichas se actualiza con CAS y se invalida la caché pública. Si falla el índice después de guardar el precio, repetir exactamente la solicitud repara la publicación sin promediar de nuevo.

Los otros editores de catálogo conservan los recibos del conector. Una edición posterior explícita de precios desde otra herramienta puede sustituir esos precios, pero no elimina el historial ni permite volver a ingerir los mismos anuncios. No se ofrece rollback automático: los valores anteriores del recibo permiten preparar una reversión controlada sin borrar evidencia.

Límites técnicos: una ficha/solicitud, 256 KiB de cuerpo, 500 anuncios/estado, documento de ficha hasta 4 MiB. Errores de identidad/media son definitivos; errores transitorios de red/almacenamiento se reintentan con el mismo contenido. No hay una nueva regla de outliers en este endpoint.
