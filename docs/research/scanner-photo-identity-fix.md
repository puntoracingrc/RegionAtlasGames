# Scanner: identidad entre fotos, v1.1

## Caso y limite de la evidencia

El usuario comparo seis fotos de webcam de GT 64 en los cinco modelos del
escaner. Los cinco exports tenian el mismo fingerprint de entrada, seis
solicitudes y plataforma/identidad nulas. No se habia ejecutado la llamada
de interpretacion. Las fotos permiten leer Nintendo 64 y versiones abreviada
y completa del titulo; los codigos pequenos siguen necesitando mayor nitidez.

Los exports antiguos no guardaban identidad/plataforma por foto. El fallo
de combinacion se reprodujo contra `80c7d0a`: GT64 y GT 64 Championship Edition
anulaban tambien una plataforma coincidente. Los tests nuevos usan respuestas
sinteticas, no reconstrucciones presentadas como respuestas originales de IA.

## Cambio

- La plataforma y el titulo se observan independientemente. Un reverso sin
  titulo no obliga al modelo a borrar una marca de plataforma legible.
- El merge conserva una plataforma coincidente aunque haya un conflicto de
  titulos. Un conflicto real sigue impidiendo asignar region al conjunto.
- Las equivalencias se admiten solo desde `data/scanner-title-aliases.json`,
  con plataforma y revision explicitas. La primera es GT 64 / GT 64:
  Championship Edition, revisada visualmente en caja/cartucho/manual del caso.
  No hay matching por prefijo, distancia de texto ni inferencia entre secuelas.
- El titulo final se elige entre las lecturas recibidas: el diccionario no
  rellena un subtitulo que ninguna foto haya aportado.
- Las candidatas de catalogo se buscan por esas equivalencias exactas y
  plataforma. Sus IDs regionales siguen separados. No se publica, modifica
  o propaga ningun precio, credito, region ni ficha.
- `multipleGames` permite bloquear mas de un juego observado dentro de una
  misma foto o entre varias. `multiplePlatforms` conserva el mismo control
  para plataformas distintas. No se fuerza una identidad unica para un lote.
- Mini mantiene percepcion por foto por su presupuesto de contexto visual.
  Astra, Sol, Terra y Luna reciben conjuntamente hasta seis fotos: pueden
  relacionar vistas de caja, cartucho y manual sin aislarlas artificialmente.
  Las observaciones mantienen el numero original de foto, aunque lleguen
  desordenadas. Una foto omitida impide presentar el analisis como completo.
- El resultado exporta `perceptionMode` (`joint` o `per_photo`). En el modo
  por foto, `photoReadings` conserva titulo, plataforma, confianza y dudas
  de cada lectura. No se inventan lecturas independientes para el modo conjunto.
  No se guardan fotografias ni respuestas completas de API.
- Las dudas se etiquetan por foto. Los conflictos se priorizan para evitar
  que desaparezcan bajo el limite de 12 mensajes.
- `interpretation` indica `completed` o `skipped` con motivo explicito. La UI
  no presenta una fase omitida como una conclusion negativa de la IA.
- Politica `region-atlas-scanner-v1.1`; los resultados antiguos siguen
  siendo renderizables porque los campos adicionales son opcionales.

## Protecciones conservadas

Se mantienen separacion de fotos y texto orientativo, mismo modelo y
presupuestos de salida, razonamiento medio en los modelos avanzados, cuotas,
registro de tokens reales, errores de saldo, `store:false` y fotos temporales.
Mini conserva concurrencia maxima de dos llamadas. No hay nuevos reintentos
ni llamadas extra para reconciliar nombres. Para seis fotos, un flujo completo
usa siete solicitudes en Mini y dos en los modelos avanzados. Una interpretacion
que antes se omitia puede ejecutarse ahora. No se repiten automaticamente los
escaneos antiguos. La comparacion exporta modo, modelo solicitado/real,
razonamiento y consumo; no se presenta como un benchmark de prompts identicos.

La API admite multiples imagenes en una misma solicitud:
https://developers.openai.com/api/docs/guides/images-vision
El cambio no supone que `detail:high` arregle el desenfoque, ni cambia a un
modelo distinto del seleccionado. El escaner tampoco realiza busqueda web
en vivo: usa las fuentes documentales registradas en su conocimiento.

Una equivalencia de titulo nunca confirma la edicion regional o la combinacion
de caja/cartucho/manual. La region sigue requiriendo observaciones actuales;
la composicion sigue requiriendo una variante documental concreta y al menos
dos componentes visibles. Desconocer una combinacion no significa falsificacion.

## Verificacion

`npm run test:scanner`: 50/50. Cubre el flujo GT64 de seis fotos con los cinco
perfiles mediante mocks: siete llamadas para Mini y dos para los avanzados,
sin red ni gasto de IA. Tambien se comprueban:

- Tetris frente a Tetris 2, sufijos de edicion no revisados y plataformas distintas;
- identidades desconocidas en reversos y varios juegos dentro de una foto;
- ausencia de relleno desde el texto del usuario o el diccionario de titulos;
- diagnosticos no truncados y dudas con numero de foto;
- IDs regionales separados y catalogo de prueba inalterado;
- numeros de foto globales, observaciones desordenadas y fotos omitidas;
- ausencia de certificacion de piezas por una mera equivalencia de titulo.

Esta correccion no afirma mejorar el OCR ni resolver los codigos borrosos.
Las transcripciones dudosas de los cinco modelos, idiomas y logos/distribuidores
siguen necesitando contraste. No se han repetido escaneos pagados con las fotos
del usuario. Tampoco se incorpora conocimiento de PS2/N64 o de otros foros a
esta PR, aparte de la equivalencia de titulo minima documentada arriba.

El texto de ChatGPT aportado por el usuario es material de comparacion, no
una fuente de verdad: su identificacion, codigo de barras, autenticidad,
tirada, idiomas de ROM y especificaciones no se importan automaticamente.
El objetivo es resolver el fallo demostrado y permitir analisis contextual,
sin convertir una respuesta mas extensa en evidencia verificada.

## Cierre local

- `typecheck`: PASS.
- `lint`: PASS, cero errores y 35 avisos preexistentes fuera del cambio.
- `test:unit`: 220/220 mas pretests y 43/43 de premios.
- `test:collector-controls`: PASS.
- `test:affiliate-offers-v1`: PASS.
- `build`: PASS.
- QA local de UI: 1440x1000 y 390x844, estados completed/skipped,
  modo de percepcion y referencias por foto visibles, sin overflow horizontal
  ni errores de pagina/consola. Respuestas simuladas solo en un navegador
  aislado: esto NO acredita OCR real, autenticacion, persistencia o consumo API.
- Capturas conservadas fuera de Git en el artefacto local
  `scanner-photo-identity-fix-2026-09-08`; no son fotos del usuario ni se suben.
- Sin diferencias en catalogo, metadatos, fichas, companias, precios o portadas.
