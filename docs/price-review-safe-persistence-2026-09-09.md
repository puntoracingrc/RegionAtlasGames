# Revision de precios: guardado seguro y cola completa

## Alcance

Reparacion de persistencia y consulta de la cola compartida entre Admin y el PC.
No modifica catalogo, precios, portadas, companias, regiones ni politicas de IA.
No aprueba anuncios ni activa llamadas de pago durante las pruebas.

Base revisada: `04f71b148075c5f99af8e35b919ed6013d172e5e`.
El corte contiene 73.107 fichas/IDs unicos y 4.481 companias. Son datos del informe,
no limites permanentes del producto.

## Cambios

- Todos los escritores de revision de la web y del PC usan el mismo bloqueo SFTP:
  `price-review-queue.json.lock`, creado exclusivamente con `wx`/O_EXCL.
- El bloqueo comprende lectura autoritativa, fusion del inbox, mutacion, escritura
  y lectura posterior. Una lectura fallida o un JSON invalido no se convierte en
  una cola vacia ni en la copia parcial incluida en el despliegue.
- Subida a un temporal unico, comparacion byte a byte, `posixRename` y nueva lectura.
  No se trunca el archivo publico mientras se sube. Se mantiene todo el historial;
  desaparecen los recortes silenciosos a 5.000 elementos/decisiones.
- La memoria derivada usa el mismo bloqueo y escritura atomica. La cola es la
  autoridad; la memoria puede regenerarse desde ella.
- La web exige `workerSynced=true` antes de ocultar una decision. Fallos de red,
  respuestas incompletas o escrituras no confirmadas muestran un aviso.
- Un anuncio resuelto no se vuelve a aplicar. Los formularios nuevos comprueban
  la version temporal leida antes de editar. Un PC con una copia antigua no
  deshace una asignacion humana pendiente.
- Busqueda, plataforma y fuente se aplican en servidor a toda la cola. Las opciones
  y contadores son globales. Paginas de 80, presentacion de 40 en 40, revision de
  snapshot para impedir saltos/duplicados si cambia la cola entre paginas.
- La lectura HTTP evita copias intermedias antiguas y no oculta fallos con fallback.
  Si falla la carga inicial, Admin muestra el error y permite reintentar.

## Pruebas

Resultado local: unitarias principales 229/229, controles de collectors completos
y afiliados correctos; typecheck y build correctos. Lint: cero errores, 35 avisos
preexistentes, ninguno en los archivos de implementacion modificados. El primer
build encontro tipos de una ruta QA temporal ya retirada; se limpio solo la cache
`.next/dev` del worktree y el build posterior completo paso.

- Unitarias: JSON invalido/incompleto, IDs duplicados, bloqueo concurrente, bloqueo
  antiguo no robado, fallos de subida/readback/rename, conservacion de mas de 5.000
  eventos, decisiones resueltas y formularios antiguos.
- Python: protocolo equivalente, fallo parcial, fusion de 6.501 elementos, 6.000
  eventos y proteccion de decisiones/asignaciones humanas frente a snapshots viejos.
- Busqueda de Game Boy en posiciones posteriores a 500; recorrido de las 620 filas
  ficticias sin omisiones ni duplicados; rechazo de paginacion sobre una revision vieja.
- QA local con el componente real y transporte ficticio: busqueda de Pokemon al
  final de la cola; 120 resultados renderizados unicos al paginar; HTTP 200 con
  `workerSynced=false` no oculta el anuncio ni resta el contador; fallo de lectura
  conserva la vista y muestra error. Escritorio 1440 px y movil 390 px, sin overflow
  ni excepciones JS. La ruta temporal de QA fue retirada antes de publicar la rama.
- Prueba SFTP real en directorio sintetico aislado: dos conexiones independientes,
  exclusividad, rename atomico y readback identico. No toca la cola operativa.

Evidencia local: `artifacts/ebay-review-2026-09-09` en el workspace de documentos,
incluidos `safe-review-desktop.png`, `safe-review-mobile.png` y
`probe-review-store-result.json`. Las fotografias de anuncios no se duplican en Git.

Comandos reproducibles:

```sh
npx tsx --test src/lib/admin-price-review.test.ts
python3 scripts/test_review_store.py
npm run typecheck
npm run lint
npm run test:unit
npm run test:collector-controls
npm run test:affiliate-offers-v1
npm run build
git diff --exit-code 04f71b148075c5f99af8e35b919ed6013d172e5e HEAD -- data public/catalog-details
```

## Activacion coordinada, pendiente

No basta con desplegar la web: un PC antiguo no respeta este bloqueo.

1. Abrir una ventana sin decisiones Admin ni trabajos del PC que escriban la cola.
   No interrumpir una tanda a mitad de escritura; esperar a su finalizacion.
2. Guardar copias y hashes de cola y memoria; verificar IDs y decisiones actuales.
3. Publicar la revision aprobada, actualizar el checkout del PC al mismo commit de
   Production y reiniciar el proceso para que cargue los modulos Python nuevos.
4. Verificar SHA del PC, SHA/domain de Production y ausencia de procesos antiguos.
5. Probar una decision autorizada, comparar readback, historial y memoria, y reabrir
   la ventana de trabajo. Nunca usar anuncios reales como fixtures de prueba.

No se ha fusionado ni desplegado esta reparacion al redactar el informe.

## Limites y recuperacion

- No hay transaccion distribuida entre el overlay del catalogo y SFTP. Si se pierde
  la conexion despues de aplicar un precio/crear/fusionar una ficha pero antes de
  confirmar la cola, el resultado es incierto: actualizar, contrastar ambos destinos
  y reconciliar. No reintentar efectos laterales a ciegas ni prometer rollback global.
- Cola y memoria son dos archivos: cada uno es atomico, no el par. Si falla la
  memoria tras guardar la cola, regenerarla bajo el mismo bloqueo; no revertir la
  decision ni sobrescribir la cola con una copia vieja.
- Un bloqueo abandonado no caduca automaticamente. Comprobar que su propietario y
  todas sus conexiones han terminado, conservar evidencia, contrastar JSON y hashes,
  y retirar solo ese bloqueo con autorizacion operativa. No borrar por antiguedad.
- Para rollback, mantener detenidos los escritores mientras se revierte codigo.
  Conservar la cola vigente y su historial; no restaurar un snapshot anterior sobre
  decisiones posteriores. Volver al escritor antiguo reintroduciria el riesgo.

## Viewtiful Joe

Siguiente caso preparado: cola `6ce5219a57be4b4d820d`, anuncio `256556076220`,
`gamecube-viewtiful-joe-red-hot-rumble`. La revision visual previa documenta caja y
manual en castellano, pegatina Nintendo espanola y disco EUR compatible. No prueba
idioma jugable ni autenticidad fisica completa.

Los 90 EUR son precio pedido de un anuncio activo, no una venta cerrada ni una
valoracion de mercado. No se ha aplicado. El boton legacy de aceptar aun copia una
muestra a precio recomendado/minimo/maximo; no se debe usar para publicar este caso
como valoracion. Conservar la evidencia y pasarla por la agregacion/revision de
precios separada despues de activar el guardado seguro.
