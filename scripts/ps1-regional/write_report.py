"""Render the audit report from the actual migration outputs."""
import csv
import gzip
import json
from collections import Counter
from reference import ART, ROOT

read=lambda name:json.loads((ART/name).read_text())
m=read('migration-summary.json');audit=read('audit-summary.json');comparison=read('list-comparison-summary.json')
profiles=json.loads((ROOT/'data/ps1-edition-evidence.json').read_text())
baseline=json.load(gzip.open(ART/'baseline-ps1.json.gz','rt'))
catalog=[g for g in json.loads((ROOT/'data/catalog.json').read_text()) if g['platformSlug']=='ps1']
byid={g['id']:g for g in catalog}
old_details=baseline['details']
refs_changed=sum((old_details.get(g['id'],{}).get('reference') or '') != ' / '.join(byid[g['id']]['canonicalSerials']) for g in baseline['catalog'])
refs_added=sum(not old_details.get(g['id'],{}).get('reference') and bool(byid[g['id']]['canonicalSerials']) for g in baseline['catalog'])
gallery=read('gallery-http-verification.json');covers=read('cover-http-verification.json')
regions='\n'.join(f"| {name} | {count:,} |".replace(',','.') for name,count in m['after'].items())
reasons='\n'.join(f"| `{reason}` | {count} |" for reason,count in audit['reviewReasons'].items())
filled={key:sum(key in p['fieldProvenance'] for p in profiles.values()) for key in ['developer','publisher','players','releaseDate','year','support']}
text=f'''# PS1 Regional Model V2 — informe de reconstrucción

Fecha de la evidencia: 10 de septiembre de 2026. Base: `80b6bf1010ae547f585fd7e4295724018c495e51`.

La reconstrucción separa familia regional, mercado, idiomas y componentes; conserva las 6.184 identidades y URLs anteriores y añade publicaciones documentadas que faltaban. La auditoría abarca PAL, USA y Japón. Las cifras son fichas/publicaciones regionales, no una afirmación de cuántos videojuegos únicos o variantes de caja existen en todo el mundo.

El estado de pruebas está en los informes enlazados al final; la comprobación del despliegue se registra en `deployment-readback.json` cuando exista. Este documento por sí solo no afirma que producción esté desplegada.

## Antes y después

Antes había **6.184 fichas**: 1.948 etiquetadas PAL España, 1.923 USA y 2.313 Japón. De ellas, 6.142 estaban publicadas y 42 excluidas. La clasificación antigua utilizaba PAL España como destino de referencias europeas y carecía de código PS1 en 5.701 fichas. El snapshot conserva catálogo, detalles, hashes y commit.

Después hay **{m['afterTotal']:,} fichas**, de las que {sum(g['listingStatus']!='excluded' for g in catalog):,} están publicadas. Las 42 exclusiones originales se conservan. Se representan 28 mercados documentados, incluidos mercados combinados, y tres estados de mercado pendiente por familia regional.

| Mercado | Fichas |
|---|---:|
{regions}

| Acción | Fichas |
|---|---:|
| MOVED: mercado anterior corregido | {m['actions']['MOVED']} |
| UNCHANGED: mercado revalidado, con enriquecimiento posible | {m['actions']['UNCHANGED']} |
| REVIEW: identidad regional histórica todavía indeterminada | {m['actions']['REVIEW']} |
| CREATED: publicaciones documentadas ausentes | {m['actions']['CREATED']} |
| Fusiones ejecutadas | 0 |
| Fichas borradas | 0 |
| URLs históricas modificadas | 0 |

Se han resuelto {m['afterTotal']-m['actions']['REVIEW']} fichas. Hay {audit['duplicateCandidates']} grupos de posibles duplicados históricos (22 registros), conservados en REVIEW: compartir una referencia documental no demuestra que dos referencias comerciales anteriores correspondan al mismo empaquetado. No se han creado duplicados de identidad documental entre las ediciones resueltas.

{refs_added} fichas antiguas obtienen por primera vez un código activo. En {refs_changed} cambia la representación de la referencia anterior, incluyendo correcciones, conjuntos multidisco y retirada de referencias inseguras; esta cifra no equivale a {refs_changed} errores tipográficos. Se documentan {m['multidiscEditions']} ediciones con varios discos. Las fichas históricas que abarcaban varios mercados conservan su URL como REVIEW y las ediciones identificables se crean aparte; no se elige un mercado por idioma para forzar un SPLIT.

## Cobertura de las fuentes y contraste con el catálogo

La extracción anterior conserva 8.852 filas: 2.592 PAL, 1.411 USA y 4.849 Japón. Hay 8.722 páginas enlazadas y 128 entradas sin ficha individual. Todas las filas tienen resultado en [PSX-LISTS-COMPARISON.csv](PSX-LISTS-COMPARISON.csv): {comparison['status'].get('represented_resolved',0)} representadas por fichas resueltas, {comparison['status'].get('represented_review',0)} por fichas pendientes y {comparison['status'].get('source_requires_review',0)} que requieren más evidencia en la propia fuente.

Las entradas sin página también se contrastan: {comparison['indexOnlyStatus'].get('represented_resolved',0)} están representadas por una edición resuelta. Solo se aceptan si coinciden exactamente título y código con Redump y el mercado es inequívoco. No se inventan para ellas portada, fecha, publisher, voces ni contenido del manual. Las entradas restantes siguen enumeradas con su motivo.

Fuentes congeladas y trazables:

- [PSX Datacenter PAL](https://psxdatacenter.com/pal_list.html), [USA](https://psxdatacenter.com/ulist.html) y [Japón](https://psxdatacenter.com/jlist.html): índices, metadatos, códigos y galerías. Cada ficha conserva la URL exacta y el hash de su página o índice.
- [Redump oficial](http://redump.org/datfile/psx/serial,version): DAT disponible con versión 2026-06-15, 10.914 discos. Prioridad para el mercado por código exacto.
- Redump.info: snapshot 2026-09-09, 10.975 discos, con enlaces individuales por disco. Se utiliza cuando el oficial no resuelve el dato; las discrepancias entre snapshots no se ocultan.
- [Libretro Redump](https://github.com/libretro/libretro-database/blob/master/metadat/redump/Sony%20-%20PlayStation.dat): DAT 2026.08.01 utilizado para contrastar el estudio de ChatGPT.
- [SerialStation, SLES-03137](https://www.serialstation.com/titles/SLES/03137): equivalencia documental explícita del sufijo `-T`.

Los archivos y hashes están en [sources/manifest.json](sources/manifest.json) y [sources/psx-input-manifest.json](sources/psx-input-manifest.json). No se han alterado los archivos de la extracción anterior ni los datos de PS2.

## Qué añade y qué corrige respecto al estudio de ChatGPT

Se ha leído el resultado disponible de la conversación «Listado PAL en español». El fichero original de 610 filas no estaba adjunto: [REFERENCE-610.csv](REFERENCE-610.csv) es una reconstrucción independiente desde el índice congelado, no una supuesta lectura de aquella hoja.

| Mercado en las 610 entradas con español | ChatGPT | Reconstrucción |
|---|---:|---:|
| España | 168 | 168 |
| Europa | 431 | 419 |
| Francia | 5 | 5 |
| Alemania | 5 | 5 |
| Italia | 1 | 1 |
| Europa / Australia | integrado en Europa | 8 |
| Reino Unido | integrado en Europa | 1 |
| REVIEW | integrado en Europa | 3 |

Los 431 casos agrupados como Europa se desglosan en 419 + 8 + 1 + 3. Esto explica la diferencia sin convertir idioma en mercado. El caso británico es Three Lions, SLES-00876, por mercado documentado. Los tres pendientes son Bubble Bobble 2/Bubble Symphony (SLES-00458, no lanzado), Plane Crazy (SLES-02087, contradicción sobre comercialización) y Crash Bandicoot 2 (SCES-00967, revisiones con mercados distintos).

- [F1 2000, SLES-02723](https://psxdatacenter.com/games/P/F/SLES-02723.html): Europe y **Multi-5: danés, inglés, español, finés y sueco**. La ficha detallada corrige la lectura incompleta del índice [S].
- [Dino Crisis 2, SLES-03225](https://psxdatacenter.com/games/P/D/SLES-03225.html): España, textos/menús en español y voces en inglés.
- WWF Warzone, SLES-00937: Europa, inglés/español/italiano. Multi-3 no se utiliza como mercado.
- GTA 2, SLES-02458: la contraportada francesa revisada imprime ese código. Se documenta como código de **caja**, sin inventar equivalencia con el disco francés SLES-02453.
- Ms. Pac-Man, SCES-03086/03087: se conservan las evidencias de caja francesa/alemana. En la imagen alemana el recorte no permite leer el serial: procede de la página, y no se afirma haberlo visto en la foto.
- The Legend of Dragoon: SCES-03047, 13047, 23047 y 33047 son cuatro discos de una edición, no cuatro juegos.

## Datos de valor, obras y ediciones

Hay {m['works']} agrupaciones activas de obra; es una capa mínima de relaciones respaldadas, no un catálogo universal de obras certificadas. Se usan aliases controlados y enlaces regionales recíprocos con título/código concordantes. No basta con que dos regiones compartan el nombre: King's Field japonés y estadounidense pueden ser entregas distintas. Una recopilación no fusiona Final Fantasy IV, V y VI.

Las fichas exponen mercado, idiomas, textos/voces cuando se especifican, códigos, componentes, fecha regional según la fuente, opciones de jugadores, memoria, vibración y otros datos técnicos. {m['withLanguages']} fichas tienen idiomas y {m['withMultipleLanguages']} varios idiomas. Se rellenan campos antes vacíos: desarrolladora {filled['developer']}, publicadora {filled['publisher']}, jugadores {filled['players']}, fecha {filled['releaseDate']}, año {filled['year']} y soporte {filled['support']}. Cada dato conserva procedencia; no se presenta la fecha de una edición original como fecha confirmada de una reedición.

Descripciones, franquicias, personas, compañías y premios existentes conservan sus IDs y URLs. Los géneros y la saga se comparten únicamente cuando los datos de la obra concuerdan; «Historia y relaciones del juego» enlaza el contexto antiguo. No se copian créditos personales, publishers de una edición ni premios específicos a otra región sin evidencia. Los metadatos unidos por un serial demostrado incorrecto se apartan en `rejectedLegacyMetadata`.

## Portadas, contraportadas y almacenamiento

Se reutilizan **{m['sourcedCovers']} asignaciones de portada** de la extracción previa, correspondientes a {covers['uniqueUrls']} URLs. La asignación principal exige serial, mercado declarado por la galería y grupo de edición concordantes. El catálogo conserva {sum(bool(g['coverUrl']) for g in catalog)} fichas PS1 con portada activa. {sum(bool(p.get('legacyCoverUrl')) for p in profiles.values())} portadas antiguas se guardan como evidencia histórica porque no se puede asegurar su correspondencia con la nueva edición.

Las galerías muestran {gallery['catalogAssignments']} referencias a {gallery['uniqueUrls']} imágenes únicas, incluidas portadas y contraportadas. Una galería puede mostrar cajas de distintos mercados para el mismo disco: cada imagen mantiene su etiqueta de mercado. Se verificó HTTP 200, tipo de imagen y longitud esperada en todas las URLs; las cuatro imágenes locales se verificaron por SHA-256. No se afirma haber inspeccionado visualmente las miles de imágenes: la muestra manual está en [visual-qa/sample-manifest.json](visual-qa/sample-manifest.json), con seis portadas y tres contraportadas excepcionales revisadas.

Se añadieron al servidor web cuatro escaneos de Ms. Pac-Man (dos portadas y dos contraportadas, aproximadamente 2,76 MB). El resto reutiliza objetos existentes de `puntoracing.net`. La captura aportada muestra **262.144 de 262.144 archivos** usados en IONOS: el espacio en GB ilimitado no evita ese límite de archivos. No se han realizado nuevas escrituras SFTP, cambios de contrato ni borrados para liberar huecos.

El inventario de manuales y demás imágenes de la extracción sigue en `sources/psx-manuals-index.json.gz` y `sources/psx-assets.json.gz`. No equivale a disponer de todos los manuales ni a confirmar qué manual acompaña de fábrica a cada caja. Las imágenes faltantes o sin una asignación principal segura están en [cover-review-queue.json](cover-review-queue.json).

## Conexión real con buscador, escáner y precios

El buscador y las tarjetas conservan `canonicalSeoSlug`; todos los códigos canónicos y aliases aprobados permiten buscar la edición. El endpoint `/api/catalog/ps1/resolve?serial=SLES-02723` devuelve candidatos con región, idiomas, componentes, procedencia, `serialScope` e `identityScope`. Devuelve siempre `physicalVariantResolved: false`: identificar una publicación no certifica una variante de caja ni un conjunto completo.

El loader real del escáner usa `ps1-scanner-knowledge.ts` después de la percepción. Consulta únicamente candidatos del título reconocido y códigos literales observados; conserva sufijos, evita forzar una edición si hay conflicto y limita las listas excesivas solicitando un código legible. Las referencias documentales no se convierten en observaciones. No se habilitan IDs de variantes certificadas ni se reutilizan los ejemplos antiguos sin contrato V2. Las pruebas se ejecutaron sin llamadas pagadas al modelo; no constituyen una medición de precisión visual ni un fine-tuning.

{sum(bool(p.get('legacyPricing')) for p in profiles.values())} fichas mantienen asociaciones/importes anteriores en `legacyPricing`. Los precios, enlaces comerciales y referencias PriceCharting cuya identidad regional cambió se retiran de la ficha activa hasta revalidarlos. El overlay solo puede aportar precios para la misma identidad V2 resuelta, con familia, mercado, regionCode y seriales canónicos coincidentes. El worker de la otra task no se ha modificado ni activado. El contrato de integración está en [ENGINE-CONTRACT.md](ENGINE-CONTRACT.md).

## Pendientes exactos y límites

Los {m['actions']['REVIEW']} registros históricos no determinables están enumerados individualmente en [review-queue.json](review-queue.json), con explicación en español, códigos anteriores, origen y candidatos documentados. El mapeado completo está en [PS1-REGION-MAP.csv](PS1-REGION-MAP.csv). No se esconden asignándolos a Europa, España, USA o Japón por defecto: se conserva solo su familia anterior como contexto pendiente.

| Motivo en el catálogo histórico; pueden coexistir varios | Registros |
|---|---:|
{reasons}

[source-review-queue.json](source-review-queue.json) enumera por separado las limitaciones de las fuentes, incluidas demos/prototipos, publicaciones no lanzadas, códigos sin coincidencia y entradas de índice insuficientes. REVIEW significa no determinable con este corpus y las reglas exactas aplicadas; no significa que ninguna investigación futura pueda resolverlo. Rareza, autenticidad, tiradas, estado del ejemplar y emparejamiento de componentes no se infieren a partir de un índice o del precio.

## Verificación, reproducción y reversión

- [integrity-tests.json](integrity-tests.json): auditoría íntegra de PS1, preservación de URLs, exclusiones y datos de otras plataformas; idiomas, aliases, multidisco, obras, imágenes y protección frente al overlay.
- [ps1-scanner-tests.log](ps1-scanner-tests.log) y [scanner-tests.log](scanner-tests.log): adapter PS1 y pruebas existentes del escáner.
- [unit-tests.log](unit-tests.log), [lint.log](lint.log), [typecheck.log](typecheck.log) y [build.log](build.log): pruebas generales y compilación. Las advertencias históricas de lint se mantienen visibles.
- [http-qa.json](http-qa.json): resolvedor, rechazo de consultas inválidas, filtro Francia, búsqueda de F1 por serial y URLs antiguas. Las capturas de navegador están en `visual-qa/`; se comprobaron móvil de 390 px sin desbordamiento y carga real de portada/contraportada.
- [reproducibility.json](reproducibility.json): la reconstrucción desde fuentes congeladas debe producir exactamente los mismos bytes. Los manifests de compañía/persona conservan su historial y solo actualizan hashes de las proyecciones PS1 autorizadas.
- [cover-http-verification.json](cover-http-verification.json) y [gallery-http-verification.json](gallery-http-verification.json): comprobación íntegra de URLs activas.

Reproducir desde esta rama con Node 24 y Python 3.11 o posterior. Ejecutar la migración y su comprobación sin un servidor, build o importador leyendo simultáneamente el catálogo:

```sh
npm ci
python3 scripts/ps1-regional/verify_reproducibility.py
node scripts/test-ps1-regional-v2.cjs
npx tsx --test src/lib/ps1-scanner-knowledge.test.ts
npm run test:unit
npm run test:scanner
npm run lint
npm run typecheck
npm run build
```

Para volver al estado anterior, el snapshot y el commit base permiten reconstruir únicamente PS1. Si se publica esta migración, la reversión debe hacerse mediante un commit inverso revisado y un nuevo despliegue, conservando cualquier edición posterior que ya haya recibido datos. No se debe restaurar todo el catálogo por encima de cambios posteriores de otras plataformas.

El trabajo se mantiene en una rama y worktree propios. Su retirada local queda pendiente de fusión remota, checks y despliegue solicitado, árbol limpio y ausencia de procesos, según la instrucción de limpieza del usuario.
'''
(ART/'INFORME-COMPLETO.md').write_text(text)
print('Report written:',ART/'INFORME-COMPLETO.md')
