# Conector directo de catálogo

El conector crea únicamente fichas PAL España identificadas como ediciones físicas comerciales. No sustituye la autenticación administrativa ni escribe Vercel Blob directamente: publica mediante la misma capa de overlay persistente del catálogo.

## Activación

La ruta `POST /api/integrations/catalog?mode=preview|publish` exige simultáneamente:

- `CATALOG_CONNECTOR_ENABLED=1`.
- El bearer cuyo SHA-256 ya está configurado en `PRICE_CONNECTOR_TOKEN_SHA256`.
- `CATALOG_RUNTIME_OVERLAY_ENABLED=1` y almacenamiento Blob operativo.

`preview` calcula el identificador y comprueba colisiones sin escribir. `publish` crea la ficha. La identidad es determinista por título, plataforma y región: repetir exactamente una publicación devuelve `alreadyApplied: true`; una colisión con otra edición devuelve `409`.

Cada solicitud incluye de una a veinte fuentes HTTPS para conservar la trazabilidad en el artefacto de trabajo. Los packs o regalos creados por un vendedor no son una edición comercial y no deben enviarse al conector.
