# Detalles públicos por ficha

Las fichas públicas pueden leer metadatos desde archivos individuales en:

```text
public/catalog-details/by-id/{catalogId}.json
```

Los chunks por plataforma de `public/catalog-details/{platform}.json` se mantienen por compatibilidad, pero `getStaticGameDetails` intenta primero el archivo individual y solo cae al chunk completo si no existe.

## Regeneración

Ejecutar:

```bash
npm run details:by-id
```

El script parte de `data/game-details.json` y conserva los campos públicos ya presentes en los chunks por plataforma (`description`, `descriptionMeta`, `seoMeta`, `videos`, `pegi`) para no cambiar la salida visual actual.

`npm run build` ejecuta esta regeneración antes de compilar.

El directorio `public/catalog-details/by-id/` es un artefacto generado y no se versiona en Git.

## Limitación temporal en admin

El admin no escribe directamente `public/catalog-details/by-id/{catalogId}.json` al guardar una ficha.

- Si la edición se publica en overlay runtime, la ficha sigue viendo el overlay antes que los archivos estáticos.
- Si la edición modifica `data/game-details.json`, el archivo individual queda actualizado en el siguiente `npm run details:by-id` o `npm run build`.
