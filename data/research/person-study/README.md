# Capa de personas de Region Atlas

Importación aditiva generada a partir de `estudio-personas-regionatlas-2026-09-03.zip` y de las aprobaciones explícitas de `data/research/person-editorial-approvals.json`.

## Barreras de publicación

- 25 perfiles `READY_EDITORIAL` publicados.
- 302 perfiles `READY_STRUCTURED` disponibles solo en Admin.
- 161 perfiles en revisión bloqueados.
- 21 retratos visibles en perfiles públicos y 217 retratos locales conservados con licencia.
- 2 relaciones persona-compañía publicadas con fuente independiente de alta confianza.
- 909 relaciones internas; 10 casos conocidos tienen un motivo de bloqueo explícito.
- 63 créditos profesionales exactos publicados.
- 184 asociaciones contextuales conservadas como datos internos y ninguna presentada como crédito exacto.
- 31 premios, 0 cargos y 18 curiosidades aprobados para la superficie pública.

`public.json` es el único fichero de esta carpeta que puede importar una ruta pública. Los demás ficheros contienen investigación interna y solo pueden cargarse desde módulos marcados con `server-only`.

## Procedencia

Cada biografía pública se reconstruye frase a frase desde una aprobación editorial. `sourceIds` contiene exclusivamente las fuentes usadas por hechos, frases, relaciones, créditos, premios, curiosidades o retratos visibles. El importador no copia `biography_es`, `career_summary_es` ni el conjunto general de fuentes del paquete.

Una relación persona-compañía solo puede publicarse si:

- pertenece a uno de los 25 perfiles editoriales;
- no requiere revisión;
- identifica una compañía canónica existente sin fusionar sus registros de origen;
- tiene función y cronología compatibles;
- cuenta con una fuente oficial o institucional independiente y de confianza alta;
- no procede únicamente de Wikidata P108.

## Identidad y créditos

- El QID identifica a la persona; el `slug` define la ruta.
- No existe fusión automática por nombre, QID compartido de una fuente defectuosa o alias corporativo.
- `ASSOCIATION_NOT_EXACT_CREDIT` significa obra relacionada, no crédito profesional.
- Las fichas de juegos y sus créditos no se modifican con esta importación.

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

La descarga necesita Pillow. El importador reutiliza retratos ya validados, elimina parámetros de seguimiento y guarda WebP `640 x 800` sin metadatos EXIF.
