# Publicación controlada de personas - 2026-09-03

## Alcance

Se incorpora una capa de entidades personales enlazada con las compañías existentes. El cambio no altera el catálogo de juegos, sus créditos históricos, las entidades corporativas ni sus slugs.

## Resultado de la corrección

1. Las 488 identidades conservan QID y slug únicos; compartir nombre no fusiona perfiles.
2. Solo los 25 perfiles `READY_EDITORIAL` tienen salida pública.
3. Los 302 perfiles `READY_STRUCTURED` permanecen en Admin y los 161 perfiles en revisión siguen bloqueados.
4. Las biografías públicas se componen exclusivamente con frases y fuentes aprobadas en `person-editorial-approvals.json`.
5. Se publican 2 relaciones persona-compañía verificadas mediante fuente oficial independiente; 909 permanecen internas.
6. Los 10 casos conocidos de homonimia, cronología imposible, herencia matriz-filial o P108 insuficiente tienen bloqueo explícito.
7. Se publican 63 créditos exactos. Las 184 asociaciones contextuales del paquete siguen internas y no se presentan como créditos.
8. Se conservan los 217 retratos locales y sus licencias; 21 corresponden a los perfiles públicos.
9. Las fuentes públicas son el conjunto exacto de fuentes que respaldan elementos visibles; no se exporta ninguna fuente usada solo por datos internos.

## Casos bloqueados expresamente

- Napoleon III, Arnaud de Puyfontaine y Laurent Dassault con Vivendi Universal Games.
- Charles Eugene Lancelot Brown y Fritz Leutwiler con BBC.
- Michael Kogan con Quest.
- Bill Gates como fundador de Xbox Game Studios o Microsoft Game Studios.
- Hideki Kamiya como empleado de Sega o Bandai Namco Entertainment.

Los alias corporativos se usan solo para elegir una entidad canónica provisional en la vista pública. No se elimina, fusiona ni cambia el slug de ningún registro corporativo.

## Rutas y visibilidad

- `/persona` busca y filtra exclusivamente los 25 perfiles editoriales.
- `/persona/[slug]` muestra solo texto, cronología, relaciones y fuentes aprobadas.
- `/admin/entidades/personas` permite revisar los 25 perfiles públicos, los 302 estructurados internos y los 161 bloqueados.
- `/compania/[slug]` genera enlaces inversos solo desde las 2 relaciones públicas verificadas.
- El sitemap contiene solo los 25 perfiles editoriales; los estructurados no generan ruta, metadata ni SEO público.

## Pruebas de seguridad semántica

La suite comprueba la aprobación frase a frase, el conjunto exacto de fuentes públicas, la cronología de relaciones, los casos bloqueados, los alias corporativos, la exclusión de P108 sin referencias, la separación entre créditos y obras contextuales, los enlaces inversos, el sitemap y la conservación de retratos y archivos protegidos.

## Fuera de alcance

- No se vinculan todavía personas a fichas concretas de juegos.
- No se crean, eliminan ni fusionan compañías.
- No se publican perfiles estructurados o bloqueados.
- No se importan menciones narrativas sin QID.
- No se fusiona la PR ni se despliega a producción sin autorización posterior.
