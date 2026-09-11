# PS2: catálogo regional y conocimiento documental V2

La integración sustituye las tres etiquetas provisionales de PS2 por mercados documentados. Conserva los 8.037 IDs, slugs y URLs anteriores, relaciona fichas cuando la identidad es reproducible y añade las ediciones documentadas que faltaban. No certifica una caja física, una combinación de fábrica ni la autenticidad de un ejemplar.

## Resultado de la migración

| Medida | Resultado |
| --- | ---: |
| Fichas anteriores conservadas | 8.037 |
| Fichas anteriores con mercado resuelto | 3.412 |
| Ediciones documentadas añadidas | 4.026 |
| Total de registros PS2 | 12.063 |
| Fichas documentadas visibles por defecto | 7.438 |
| Fichas pendientes visibles con la opción correspondiente | 4.532 |
| Registros previamente excluidos que siguen excluidos | 93 |
| Fichas con idiomas declarados | 4.945 |
| Fichas con varios idiomas declarados | 1.866 |
| Ediciones con varios discos documentados | 63 |
| Carátulas principales asignadas con código, mercado y edición coincidentes | 2.116 |
| Originales gráficos archivados | 8.811 |

Estos recuentos son de registros y ediciones documentadas, no de títulos únicos ni de un fullset certificado. Las 93 fichas excluidas forman parte de los 4.625 registros pendientes del informe interno.

## Fuentes y cobertura

- PSX Data Center: listados PAL, USA y Japón/Asia; 11.008 entradas del índice y 4.654 fichas detalladas recuperadas. El contrato contiene 11.003 referencias útiles, incluidas las entradas que carecen de una ficha detallada.
- Redump.org y Redump.info: instantáneas descargadas el 11 de septiembre de 2026 para contrastar serial, título, familia y mercado. Las discrepancias se conservan; estar documentado en Redump no certifica un ejemplar.
- Estudio previo de PS2: 22 hallazgos sobre presentaciones, componentes, idiomas, códigos de producto y periféricos. Las observaciones realizadas por un agente siguen identificadas como tales, sin convertirse en verdad visual independiente.
- Las instantáneas, URL de procedencia, fecha y hashes están en `artifacts/ps2-region-migration/sources/`. La atribución se conserva en las fichas y en cada referencia gráfica.

El índice no permite afirmar que todos sus elementos sean juegos comerciales completos. Las entradas sin contraste suficiente, categorías no comerciales, seriales incompatibles o referencias ambiguas permanecen en revisión. Los grupos de títulos que solo se parecían no se importan como coincidencias.

## Reglas de identidad y presentación

1. La familia PAL o NTSC no equivale a un país. El mercado del software, la carátula y el manual conservan alcances separados. Corea, China, Taiwán y las combinaciones documentadas no se convierten en Japón por pertenecer a NTSC-J.
2. Un código se normaliza tipográficamente. Conserva ceros y sufijos. Un SKU comercial como `PERSONA-01` no se transforma en un serial de disco. `SLEH-00049` mantiene su papel de accesorio.
3. Los textos y las voces son campos distintos. Final Fantasy X `SCES-50494` tiene textos españoles y voces inglesas según su ficha; la bandera española del índice no contradice esa distinción. Persona 3 coreano `SCKA-20099` conserva la contradicción documental sobre idiomas.
4. Un mismo serial puede aparecer en una carátula normal y en una reedición. Los códigos de barras conservan su ámbito: `711719468929` consulta la referencia de carátula Platinum de Final Fantasy X, sin certificar la presentación de una fotografía.
5. Las imágenes de una galería pueden pertenecer a varios países, reediciones o piezas. No se combinan automáticamente en un conjunto de fábrica. La fecha de la ficha no se propaga a cada reedición de la galería.
6. Compatibilidad con un periférico no significa que esté incluido. Publicidad de un disco adicional tampoco prueba que esté presente en el anuncio.
7. Los datos antiguos de región, carátula o precio que no identificaban la nueva edición quedan conservados en el perfil de revisión. Un overlay remoto antiguo no puede reintroducirlos como datos verificados.

La fecha de 1999 que la fuente atribuye a Sorcerous Stabber Orphen no se convierte en una fecha normalizada: precede al lanzamiento comercial de PS2 del 4 de marzo de 2000, documentado por [Sony Interactive Entertainment](https://sonyinteractive.com/en/press-releases/2003/playstation2-achieves-cumulative-worldwide-shipment-of-50-million-units/). Se conserva la afirmación original para revisión, con una advertencia en la ficha y en el contexto del engine.

Se identifican seis grupos de posibles duplicados, con doce fichas antiguas. Conservan sus URLs y la relación documental; necesitan comprobar la presentación concreta antes de consolidar una edición física. El detalle reproducible queda en `catalog-resolution.json` y `review-queue.json`.

## Uso en web y motores

La web presenta los mercados en filas agrupadas por zonas. La opción «Incluir fichas pendientes» tiene recuentos propios y permite acceder a las fichas antiguas. Las URLs siguen resolviendo aunque cambie la región mostrada.

Las fichas incluyen códigos, idiomas por función, fecha documentada, soporte, jugadores, memoria, periféricos, galerías y ediciones relacionadas cuando hay evidencia. Los campos desconocidos permanecen desconocidos. Las portadas se guardan en `public/catalog-covers/ps2/galeria/` con nombres basados en el título y el código; los bytes originales y la procedencia están en el manifiesto.

El escáner consulta `data/ps2-source-knowledge.json.gz` después de la percepción visual. El contrato se comparte mediante dos lectores:

- TypeScript: `src/lib/ps2-documentary.ts` y `src/lib/ps2-scanner-knowledge.ts`.
- Python: `scripts/collectors/ps2_documentary.py`, utilizado desde la investigación regional de los recolectores existentes.

No son dos bases de conocimiento distintas: ambos leen el mismo artefacto versionado. El worker eBay V2 en desarrollo mantiene su congelación operativa y su adopción se coordina con su task; esta integración no lo activa ni modifica sus decisiones. El otro motor puede consumir el mismo contrato o el endpoint de consulta.

`GET /api/catalog/ps2/resolve?serial=SCES-50494` devuelve candidatos del catálogo y referencias documentales. También admite códigos de barras y códigos de accesorio, con papeles separados. Los candidatos no implican aceptación automática. El endpoint limita la entrada y los resultados, y no lanza llamadas a modelos.

## Contrato para consumidores

- `ps2DocumentaryByCode(value)` / `references_for_code(value)` devuelven `edition_code`, `barcode_reference` o `accessory_code`; preservar ese papel.
- `record.codes`, `accessoryCodes` y `barcodeReferences` son dominios distintos. Mantener `scope`, `editionLabel`, `sourceUrl` y las advertencias.
- `record.market` describe el software documentado. `graphics[].label`, los mercados de cada imagen y las observaciones de las fotos describen las piezas.
- `languages.text` y `languages.audio` no equivalen al idioma del manual. `claims` y `discrepancy` permiten explicar fuentes divergentes.
- `findings[].evidenceClass` distingue afirmaciones de fuente, observaciones de un agente y otras evidencias. No convertirlas en observaciones del anuncio.
- `physicalVariantResolved` permanece en `false`. El adaptador no genera `knownVariantIds`, ejemplos visuales aprobados, autenticidad, composición completa ni precios certificados.
- Una identidad visual contradictoria, varias plataformas/juegos o un código incompatible deben seguir sin resolver. Las referencias entran después de observar las fotos y no modifican esas observaciones.

Esto es enriquecimiento documental y lógica de consulta; no es ajuste de pesos de un modelo ni una medición de precisión con fotografías independientes.

## Reproducción y controles

Desde la raíz del repositorio, con las instantáneas versionadas:

```sh
python3 scripts/ps2-regional/verify_reproducibility.py
python3 scripts/ps2-regional/verify.py
npx tsx --test src/lib/ps2-regional.test.ts
python3 scripts/test_ps2_documentary.py
```

La reproducción verifica 22 salidas idénticas y restaura los archivos si falla. La auditoría compara las demás plataformas con el commit base, conserva colecciones y direcciones, valida cada imagen por SHA-256 y comprueba las restricciones de las portadas asignadas.

Los verificadores históricos de PS1 siguen ejecutándose con sus scripts y catálogo originales en un directorio temporal aislado: algunos informes antiguos incluyen el hash del catálogo completo. Además, los datos actuales de PS1 y de las otras plataformas se comparan con el mismo commit base para impedir cambios accidentales.

Los 8.811 originales suman 4.778.168.697 bytes. Se publican en catorce commits de imágenes, de menos de 350 MB cada uno, con los despliegues de la rama desactivados durante los lotes. La publicación de la integración requiere después CI, despliegue y comprobación de la web pública. El estado final de publicación se registra en el paquete de entrega de la tarea.

La primera vista previa compiló correctamente pero agotó el disco al publicar los archivos: el diagnóstico de Vercel señaló 7.647 MB de historial Git y 8.039 MB de salida. El comando de compilación libera únicamente `.git` dentro de una copia desechable `/vercel/pathN` en Linux, con `VERCEL=1`, entorno preview/production y SHA de origen verificado. No se ejecuta la limpieza en un checkout local, un worktree, una ruta enlazada ni un commit distinto. Las imágenes siguen formando parte de la publicación normal por Git. Los controles de este límite se ejecutan en `scripts/test-prepare-vercel-build.mjs`.
