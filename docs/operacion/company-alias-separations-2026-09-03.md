# Separacion auditada de entidades de compania

Fecha de aplicacion: 2026-09-03

## Procedencia

- Paquete: `RegionAtlas_company_audit_2026-09-03.zip`
- SHA-256: `9b3153da39bd7a06343df9aa2ad7f8bbd5fb7d6702196367cd0b0bf84de947e3`
- Decision aplicada: `SPLIT_CLUSTER`
- Confianza minima: `VERY_HIGH`

La configuracion persistente esta en `data/company-separations.json`. Sus reglas tienen
prioridad sobre grupos manuales, prefijos, Wikidata, rutas del museo y normalizacion de
nombres, tanto en Python como en el resolver TypeScript de la aplicacion.

## Resultado

- 23 clusters aprobados.
- 78 alias convertidos en entidades independientes.
- 1.001 juegos y 1.162 creditos reasignados desde la informacion original conservada.
- Registro de entidades: 4.243 a 4.321.
- Alias activos: 246 a 168.
- Indice de companias: 4.248 a 4.326.
- 10 nombres canonicos corregidos.

No se modificaron fichas de juego, catalogo ni grupos historicos. Las asociaciones no
incluidas en los 23 clusters permanecen identicas.

Se reasignaron seis perfiles editoriales que describian a una entidad regional pero
estaban guardados bajo el slug de su matriz: Acclaim Japan, Idea Factory
International, Koei Tecmo Europe Ltd., Marvelous Europe, NEC International y
Take-Two Interactive Europe. Las introducciones y descripciones SEO generadas por
plantilla ya no publican conteos congelados: toman los totales actuales del indice en
cada renderizado. Los perfiles redactados manualmente o por IA conservan su texto.

## Casos bloqueados

No se aplicaron cambios a los clusters de Atari, Mastiff, SNK ni Zushi. La auditoria
los mantiene bloqueados por confianza insuficiente o por colisiones temporales o de
identificador.

## Metadatos pendientes

Las entidades ya estan separadas, pero estas rutas no se usan como senal de identidad
porque aparecen compartidas:

- `bandai` y `bandai-namco-entertainment`: `/desarrolladoras-de-software/bandai`
- `square` y `square-enix`: `/desarrolladoras-de-software/square`

Debe revisarse en otra fase que enlace corresponde a cada ficha. Esta pendiente no
vuelve a unir las entidades.

## Validacion

- Comparacion exacta con el manifiesto: 1.162 de 1.162 creditos, sin movimientos extra.
- Pruebas Python de separacion y regeneracion: correctas.
- Pruebas TypeScript del resolver publico: correctas.
- Pruebas de pertenencia de perfiles y conteos editoriales dinamicos: correctas.
- Suites de coleccion, unitarias y controles de recolectores: correctas.
- Typecheck: correcto.
- Lint: sin errores; conserva advertencias previas del repositorio.

`scripts/validate_entity_links.py` mantiene tres incidencias de genero que ya existian
en la revision base: dos fichas de `1971 Project Helios` y `Spec Ops: The Line`. No son
una regresion de esta migracion.

## Reversion

La reversion se realiza revirtiendo el commit de esta migracion. No debe intentarse
fusionar manualmente las 78 entidades mientras siga activa
`data/company-separations.json`, porque esa configuracion bloquea de forma deliberada
que el constructor vuelva a agruparlas.
