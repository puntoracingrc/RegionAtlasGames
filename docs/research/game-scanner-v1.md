# Escaner V1 y comparacion de modelos

Fecha: 2026-09-08. Base: `2490de571a9278327022c5a82d8514504302ae3e`.

## Alcance

- Nueva ruta `/escaner`, enlace de navegacion, plataforma, hasta seis fotos y texto orientativo opcional.
- Endpoint autenticado `/api/scanner`; no escribe catalogo, precios, colecciones ni aprendizaje aprobado.
- Adaptador web del engine: comparte las guias de `data/region-research` y el aprendizaje revisado de `loadMarketplaceCollectorLearning`. No ejecuta Python dentro de Vercel ni entrena pesos.
- Primera fase: una lectura independiente por foto, sin texto orientativo ni imagenes de referencia. Segunda fase: interpretacion de esas lecturas con conocimiento documental.
- Resultados automaticos sugeridos, no certificados: identidad, region, piezas, idiomas impresos, codigos, evidencias y fotos necesarias para resolver dudas.
- No declara una mezcla de piezas solo porque sus idiomas difieran. Las combinaciones documentadas y las observaciones se mantienen separadas.

## Modelos

Orden orientativo de capacidad general segun el catalogo del proveedor:

1. GPT-6 Astra.
2. GPT-5.6 Sol.
3. GPT-5.6 Terra.
4. GPT-5.6 Luna.
5. GPT-4o mini, referencia del worker y opcion inicial.

Todos figuran en el listado real de modelos accesibles por la cuenta y sus fichas oficiales admiten imagenes y Responses API. El orden no constituye un benchmark de OCR de cajas. Mini no es necesariamente mas barato por foto: cada familia tokeniza imagenes de forma distinta.

Los cuatro modelos nuevos quedan reservados al administrador durante la evaluacion. La lista se valida en servidor antes de consumir cuota. No se permite un ID arbitrario, ni se cambia de modelo silenciosamente ante un error. Ambos pasos usan el modelo elegido; los modelos de razonamiento usan esfuerzo medio y presupuesto de salida explicito.

La UI conserva hasta diez analisis de las mismas entradas durante la sesion de pagina, comparando modelo, region sugerida, codigos por pieza, tokens y tiempo. Las fotos, plataforma y pista quedan identificadas con una huella SHA-256; cambiar una entrada borra la comparacion. Cambiar solo el modelo no borra los resultados. Una ejecucion fallida tampoco borra el resultado anterior.

Fuentes oficiales consultadas el 2026-09-08:

- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/models/gpt-5.6-terra
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/models/gpt-4o-mini
- https://developers.openai.com/api/docs/pricing

Las tarifas mostradas son una referencia fechada de Standard, contexto corto, por millon de tokens, no un precio prometido por escaneo. Los tokens de salida del proveedor incluyen razonamiento. La cache de entrada es un subconjunto de la entrada y no se suma otra vez al total.

## Seguridad y almacenamiento

- Sesion, origen de mutacion y limite de diez intentos por hora por usuario/IP.
- Cuota atomica mensual existente, compartida con Vitrina. La extraccion a `ai-quota.ts` conserva sus reexports y comportamiento.
- Cuerpo multipart limitado durante su lectura a 3,8 MB, incluso sin Content-Length.
- Preparacion de fotos en navegador, validacion binaria con Sharp, limites de dimensiones/tamano, deteccion de repetidas y retirada de metadatos.
- Sin URL de imagen arbitraria, ni importacion remota aportada por el usuario.
- Fotos efimeras en memoria; se envian a OpenAI con `store: false`. No se suben a Git, CDN, SFTP ni almacenamiento publico del proyecto.
- El usuario puede descargar el JSON. No se guarda el resultado, las fotos o el texto orientativo en la telemetria.
- `scanner-usage.json` privado conserva ID de escaneo, usuario, fase, modelo solicitado/real, respuesta, fecha y consumo real; retencion de 31 dias y maximo 10.000 filas.
- Uso no informado por el proveedor queda como desconocido, nunca como cero. Saldo agotado o error detiene el analisis sin fallback sin IA.
- Cada foto se analiza por separado, con maximo dos solicitudes concurrentes. Se espera el registro de ambas antes de fallar una tanda. Plazo total acotado compatible con el endpoint de 240 segundos.

## Validacion local

- `npm run test:scanner`: 30/30.
- `npm run typecheck`: PASS.
- `npm run lint`: cero errores; 35 advertencias preexistentes fuera de los cambios del escaner.
- `npm run test:unit`: PASS, 220/220 en suite principal y pre/post suites completas.
- `npm run test:collector-controls`: PASS.
- `npm run test:affiliate-offers-v1`: PASS.
- `npm run build`: PASS; genera `/escaner` y `/api/scanner`.
- El empaquetado previo de la cola sigue preservado: 2.376 elementos; SHA-256 serializado `620a94abc0067d5580fa97a818360f518e165048412e220a16a09dc21ede11b3`; sin incluir otra copia del JSON crudo; traza Admin precios 247,142 MiB.

Datos intactos frente a la base:

- 73.107 fichas y 73.107 IDs unicos.
- 4.481 companias.
- Blob Git de `data/catalog.json`: `b5feeb8d7859fa4e659f299bb764c4be891dfed8`.
- Blob Git de `data/index/companies.json`: `f1499edd5650d013ac3d9c9a3b1948b14262b4af`.
- Cero archivos de `data/` o `public/` modificados; cero IDs, URLs, precios, portadas o creditos modificados.

Los numeros anteriores documentan este corte; no son limites permanentes del producto.

## QA y limites

Evidencias locales fuera de Git: `artifacts/game-scanner-2026-09-08` en el workspace de la tarea. Cuenta ficticia local, APP_DATA_DIR aislado y sin credenciales de almacenamiento de Production.

Una fotografia real de Bad 'N Rad muestra manual `DMG-SK-FAH` y un codigo lateral diferente en el cartucho. Durante las pruebas Mini llego a atribuir el codigo del manual al cartucho; otra ejecucion dejo ese codigo sin leer. Por eso la UI marca las lecturas como automaticas pendientes de contraste. No se considera verificada la precision regional general por pasar las pruebas de software.

Comparacion real final, mediante navegador y API local del build de produccion, sin interceptar respuestas:

| Modelo | Entrada | Salida | Total | Tiempo | Codigo del cartucho |
| --- | ---: | ---: | ---: | ---: | --- |
| gpt-4o-mini-2024-07-18 | 27.934 | 615 | 28.549 | 10,2 s | No leido |
| gpt-6-astra, esfuerzo medio | 3.139 | 1.389 | 4.528 | 33,6 s | DMG-SK-NOE-1 |

Dos solicitudes por modelo; cero tokens de entrada cacheada informados. Misma huella de entradas `1c1766f18c01cd16dbcbe13be21ed75b6c8c8c3cbae0f36bff29344cdd873360`. Ambos leen `DMG-SK-FAH` en el manual y dejan region/combinacion sin confirmar. La menor cantidad de tokens de Astra no implica menor coste: los precios por token y la tokenizacion de imagen cambian.

QA de escritorio 1440x1000, escritorio compacto 1024x900, tablet 768x1024 y movil 390x844: sin overflow de pagina, imagenes rotas ni errores de consola. Tabla de comparacion con scroll propio en movil. Verificados selector, repeticion con otra IA, acceso a analisis anteriores, ampliacion/cierre de fotos, eliminacion, limite de seis, limpieza de comparacion al cambiar fotos y enlace de navegacion movil. Guardas reales: anonimo 401, origen ajeno 403, plataforma invalida 400. Modelos no permitidos/ajenos al administrador cubiertos adicionalmente en las pruebas de subida.

Sol, Terra y Luna tienen contrato de peticion probado con doubles y capacidades oficiales verificadas, pero no se han lanzado analisis pagados con ellos en esta QA. No se presenta esa cobertura como una prueba real de vision de los cinco modelos.

No se ha modificado el modelo de los workers existentes. No se ha fusionado ni publicado el escaner en Production.

## Ampliacion de entrada de fotos y publicacion

Actualizacion 2026-09-08 autorizada por el usuario antes de publicar:

- Archivos locales, arrastre de archivos en escritorio y camara comparten la misma preparacion y el limite de seis fotos. Se bloquean entradas simultaneas mientras se preparan.
- Movil: entrada nativa `capture=environment` para solicitar la camara trasera. El comportamiento final del selector depende del navegador y del dispositivo; sigue existiendo el selector de archivos separado.
- Escritorio: webcam sin audio, vista sin espejo para no invertir textos, captura, revision, repetir y aceptar. Solo se solicita acceso tras pulsar Usar camara.
- Las pistas se detienen al capturar, cerrar, cambiar de pestana o desmontar. Una concesion tardia de permisos tras cerrar tambien detiene su stream.
- Vaciar fotos libera sus URLs y archivos en memoria del navegador, conservando el resultado ya obtenido. Las fotos no se guardan en localStorage ni se suben a ningun servidor hasta solicitar el analisis. No hay nuevo almacen temporal que limpiar en SFTP/CDN.
- Se mantiene el limite vigente de 12 MiB de entrada por foto, 24 megapixeles y preparacion de hasta 1800 pixeles de lado mayor. No se prometen originales sin compresion ni borrado inmediato en el proveedor de IA por usar `store: false`.
- La comparacion con otros modelos puede reutilizar las fotos hasta vaciarlas o salir de la pagina. Anadir nuevas fotos limpia los analisis anteriores; vaciar por privacidad conserva el resultado para leerlo o descargarlo.

Rebase sin conflictos sobre `8d785a9305bfaa40a02c8159f07d62cb5a469af2`, avance del worker de eBay. `git range-diff` confirma que el commit inicial del escaner se reprodujo sin cambios funcionales. El blob del catalogo en esta nueva base es `98a7efa283a1a53d290d0305af3b4ebd5cf683cc`; sigue identico en la rama del escaner. Companias: `f1499edd5650d013ac3d9c9a3b1948b14262b4af`, tambien sin cambios. Se mantienen 73.107 fichas/IDs unicos y 4.481 companias.

Pruebas de entrada: 35/35 en `test:scanner`, typecheck correcto y lint de los archivos nuevos sin advertencias. QA local automatizada con video sintetico: archivos, arrastre, captura, revision, repetir, aceptar, cancelacion tardia, denegacion de permisos, limite de seis y liberacion de URLs. Entrada de camara movil verificada mediante emulacion del navegador, no mediante hardware fisico. Escritorio 1440x1000 y movil 390x844 sin overflow, imagenes rotas ni errores de consola. Cero peticiones POST al escaner durante esta QA; sin gasto adicional de IA.

Las investigaciones PS1/Wispa444 y PS2/shoot-em-ups siguen como informes y candidatos separados. No se han convertido en cambios de catalogo ni reglas aprobadas del engine en esta PR.
