# Publicación controlada de personas — 2026-09-03

## Alcance

Se incorpora una capa de entidades personales enlazada con las compañías existentes. El cambio no altera el catálogo de juegos, sus créditos históricos, las entidades corporativas ni sus slugs.

## Barreras aplicadas

1. Las 488 identidades conservan QID y slug únicos; compartir nombre nunca fusiona perfiles.
2. Se publican 327 perfiles y se mantienen 161 en staging.
3. Los 25 perfiles editoriales muestran biografía, impacto y recepción contrastada.
4. Las 302 fichas estructuradas publican datos básicos y biografía prudente, sin presentar el contenido como revisión editorial.
5. Las 87 relaciones públicas solo apuntan a slugs existentes del índice de compañías.
6. Los 63 créditos exactos y las 159 asociaciones de obra se presentan en secciones distintas.
7. Los retratos públicos se sirven desde Region Atlas; cada ficha conserva autor, licencia y enlace de origen.
8. Las menciones sin QID, relaciones bloqueadas y datos hijos sin revisión quedan en ficheros internos.

## Rutas

- `/persona`: búsqueda por nombre, alias, compañía, país, ocupación y obra; filtros por especialidad y nivel editorial.
- `/persona/[slug]`: biografía, cronología, compañías, créditos exactos, obras asociadas, premios, curiosidades y fuentes.
- `/admin/entidades/personas`: revisión paginada de perfiles publicados y staging.
- `/compania/[slug]`: enlaces inversos únicamente para relaciones aprobadas.

## Deliberadamente fuera de alcance

- No se vinculan todavía personas a fichas concretas de juegos.
- No se crean ni fusionan compañías.
- No se publican los 161 perfiles de staging.
- No se importan menciones narrativas sin QID.
- No se despliega a producción hasta revisar y autorizar el PR.
