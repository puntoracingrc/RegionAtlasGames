# Prueba de fotografías de PS2 desde las ofertas de Region Atlas

## Alcance y resultado

El 11 de septiembre de 2026 se eligieron diez fichas PAL España sin portada principal. Había 48 fichas españolas de PS2 en esa situación. La muestra incluye Kingdom Hearts, usado para el diagnóstico inicial, y nueve títulos del principio del listado alfabético de faltantes; no se sustituyeron los casos sin resultado por otros más fáciles.

Se abrieron las diez fichas de Region Atlas. Sus bloques de ofertas mostraban 51 artículos: 38 indicaban origen España y 13 otros países. Se visitaron 31 artículos españoles, respetando la posición inicial de cada oferta dentro de su ficha. Se contrastó también «Ubicado en» en eBay. La búsqueda se detuvo al encontrar fotografías utilizables o agotar las ofertas españolas; siete artículos posteriores a una selección quedaron sin abrir. Vecinos Invasores solo tenía un enlace de búsqueda, sin artículos concretos: no se amplió la muestra a una búsqueda externa.

Resultado: **once fotografías originales para seis fichas, con cinco portadas principales**. Tamaño total: **3.652.268 bytes**. Las fotos conservan fondos, encuadres, etiquetas y marcas del vendedor. Una fotografía conjunta no se presenta como un escaneo ni como dos archivos de caras individuales.

| Ficha y código | Anuncios revisados | Incorporación | Resultado de la revisión |
| --- | ---: | --- | --- |
| Kingdom Hearts · SCES-50971 | 6 | Ninguna | Cuatro anuncios muestran Platinum; en dos no se obtuvo la fotografía. No se asigna una reedición a la ficha estándar. |
| Bob Esponja: ¡Luces, cámara, esponja! · SLES-53498 | 1 | Ninguna | El único anuncio español solo fotografía el disco. |
| Bratz: Rock Angelz · SLES-53575 | 2 | 1 foto conjunta en galería | [Anuncio 166611671500](https://www.ebay.es/itm/166611671500): lomo, reverso español, código y «Totalmente en castellano». Falta frontal individual. |
| Buzz! El Gran Reto · SCES-53884 | 6 | Ninguna | Las cajas concretas muestran «Prohibida la venta por separado». Las portadas genéricas no resuelven la presentación individual. |
| Buzz! El Mega Concurso · SCES-54500 | 1 | Portada principal y reverso | [Anuncio 227372989628](https://www.ebay.es/itm/227372989628): caja española, código de barras 711719699583 y disco con el serial correspondiente. |
| Champions of Norrath · SLES-52373 | 6 | Portada principal y reverso | [Anuncio 257162231929](https://www.ebay.es/itm/257162231929): código en lomo y disco, reverso español y 3307210163769. Frontal «Modo online incluido». |
| Championship Manager 5 · SLES-53224 | 1 | Portada principal y reverso | [Anuncio 325848999479](https://www.ebay.es/itm/325848999479): Proein, «Totalmente en castellano», disco y código de barras 5032921022347. |
| Vecinos Invasores · SLES-53987 | 0 | Ninguna | La ficha no presentaba ofertas de artículos. |
| Dynasty Warriors 4 · SLES-51665 | 5 | Portada principal y foto desplegada | [Anuncio 158257340242](https://www.ebay.es/itm/158257340242): caja española, serial y 4005209046978. El reverso aparece junto al lomo y frontal. |
| Dynasty Warriors 4: Xtreme Legends · SLES-52175 | 3 | Portada principal y reverso | [Anuncio 168338841550](https://www.ebay.es/itm/168338841550): reverso español, 5060073300051 y pegatina Virgin Play. Código corroborado en los dos anuncios previos. |

## Evidencia y límites

- El origen del envío selecciona los anuncios que se inspeccionan; no determina la región de la caja.
- Las fotos de disco, carátula y manual se observan por separado. Un serial compartido no prueba Platinum, pack, idioma del manual ni combinación original de fábrica.
- En Dynasty Warriors 4 se descartó una foto japonesa, una portada de stock contradictoria (NTSC U/C junto a PEGI), una imagen incompleta y una oferta de **Empires**. La sexta oferta, sin abrir tras seleccionar la quinta, se titulaba **Dynasty Warriors 5 Empires**.
- En Champions of Norrath se observan frontales «Con juego en red» y «Modo online incluido» con el mismo código de barras. Se conserva la diferencia; no se inventa fecha ni número de tirada.
- La pegatina Virgin Play, la caja roja de Buzz y el envoltorio de Xtreme Legends se describen como elementos del ejemplar fotografiado. No se certifican de fábrica ni se generalizan a todas sus unidades.
- Las declaraciones sobre castellano se citan como texto de la caja. No se convierten automáticamente en voces, menús o idioma de manual confirmado.
- Esta prueba proporciona observaciones y descartes documentados. No constituye entrenamiento visual ni una medición de mejora del escáner o del worker.

## Integración

`data/ps2-reviewed-market-photos.json` contiene el lote revisado, su identidad exacta, procedencia, hashes y notas visibles para el coleccionista. `data/research/ps2-ebay-cover-pilot/2026-09-11.json` registra las diez fichas, el orden de ofertas, las 31 decisiones y los once archivos seleccionados. Los 72 archivos originales descargados, incluidos los descartes y fotos auxiliares, se preservan en el expediente local de investigación; solo los once seleccionados se publican.

Los archivos públicos están en `public/catalog-covers/ps2/fotos-verificadas/`, con nombres basados en título, código, artículo y cara. Se publican por Git. No se utilizan el SFTP lleno ni el almacén del archivo histórico.

El cargador del catálogo completa exclusivamente portadas vacías cuando coinciden ID, plataforma, estado resuelto, mercado, región, edición, URL y seriales. El cargador de documentación añade fotos y notas a seis perfiles resueltos con código y mercado coincidentes. Conserva las URLs, idiomas del software, fechas, precios y estado de verificación física previos. El catálogo JSON y los archivos comprimidos históricos de PSX Data Center permanecen intactos, por lo que su reproducción sigue siendo verificable. Los scripts que lean directamente ese catálogo histórico deben consultar también este lote si quieren conocer las cinco portadas añadidas en la web.

Las candidatas automáticas temporales del módulo de investigación de mercado siguen sin poder publicarse mediante el flujo de aprobación genérico. Esta incorporación es un lote fijo revisado expresamente para esta prueba.

## Comprobación

Las pruebas de `src/lib/ps2-regional.test.ts` comprueban los cinco únicos cambios de portada, los once hashes originales, la conservación de las identidades y la negativa a aplicar una foto si cambian región, edición, URL o serial. También verifican que las fotos conjuntas no se etiquetan como escaneos, que no se duplican al cargar de nuevo y que no alteran los idiomas ni la certeza física del archivo histórico.

La comprobación en navegador cubre portada, apertura de galería, ampliación de reverso, atribución y las fichas que deben permanecer sin portada. El expediente local guarda los resultados de las pruebas y el cierre de publicación con su commit y despliegue.
