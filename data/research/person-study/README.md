# Capa de personas de Region Atlas

Importación aditiva generada a partir de `estudio-personas-regionatlas-2026-09-03.zip`.

## Proyección pública

- 327 perfiles con QID humano único.
- 25 perfiles revisados editorialmente.
- 302 fichas estructuradas con redacción prudente.
- 217 retratos locales normalizados, con origen, autor y licencia conservados.
- 87 relaciones persona-compañía aprobadas.
- 63 créditos profesionales exactos.
- 159 obras destacadas asociadas, siempre separadas de los créditos.
- 173 premios, 15 cargos y 25 curiosidades con barrera de revisión superada.

`public.json` es el único fichero de esta carpeta que puede importar una ruta pública. Los demás ficheros contienen investigación interna y solo pueden cargarse desde módulos marcados con `server-only`.

## Staging

Los 161 perfiles con `requires_review=true` y las 138 menciones sin identidad resuelta permanecen en `review.json`. No tienen ruta pública, no aparecen en el sitemap y no participan en enlaces inversos.

## Identidad y créditos

- El QID es la identidad estable; el `slug` es únicamente la ruta.
- No existe fusión automática por nombre.
- `ASSOCIATION_NOT_EXACT_CREDIT` significa obra relacionada, no crédito profesional.
- Las fichas de juegos no se modifican hasta validar la edición concreta y el crédito exacto.

## Regeneración

```bash
python3 scripts/import_person_research.py \
  --package-dir /ruta/al/paquete-extraido \
  --repo . \
  --write \
  --download-portraits

python3 scripts/import_person_research.py \
  --package-dir /ruta/al/paquete-extraido \
  --repo . \
  --check
```

La descarga necesita Pillow. El importador reanuda retratos ya validados, elimina parámetros de seguimiento y guarda WebP `640 x 800` sin metadatos EXIF.
