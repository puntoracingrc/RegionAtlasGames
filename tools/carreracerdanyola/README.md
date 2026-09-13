# Carrera Cerdanyola 2026 — GT8 Nitro + Eléctrico

Calculadora manual de campeonato, derivada del motor y la interfaz de Lleida, con reglas propias de GT8. Versión preparada el 13/09/2026.

**Estado de entrega: aplicación y pruebas locales terminadas; NO publicada ni verificada en producción desde esta entrega.** La URL solicitada a Codex es `https://www.regionatlas.games/carreracerdanyola`. La aplicación de Lleida debe conservarse intacta.

## Abrir y utilizar

Abre `carreracerdanyola.html` en un navegador moderno. Es un archivo autónomo, sin dependencias de red ni servicios de IA. Selecciona Nitro o Eléctrico, y asigna el puesto de cada aspirante en el selector junto a su nombre. Los puestos ocupados quedan deshabilitados para los demás; las flechas arriba/abajo intercambian posiciones de forma atómica. La lista y el campeonato se actualizan al introducir los datos.

**No hace falta completar la parrilla para simular el podio o las cuatro primeras plazas.** Los huecos permanecen pendientes. Si un piloto sin resultado puede cambiar alguna plaza, se muestra la incertidumbre y se identifica quién falta. No se le adjudica automáticamente el último puesto, cero puntos ni una posición basada en su ranking histórico.

En `Participantes` desmarca a quien no vaya a correr, conservando sus resultados anteriores. Usa `+ Añadir piloto` para nuevos nombres, con dos pruebas históricas vacías. Todos los nombres históricos parten como participantes hipotéticos: **26 Nitro y 14 ECO; no son 40 inscritos confirmados**. Todavía no se ha incorporado una lista de inscritos de Cerdanyola.

**El puesto introducido es el de la clasificación general de la prueba.** En Eléctrico no representa el resultado de una sola final; la app NO agrega mangas, vueltas, tiempos o finales. En Nitro incluye la clasificación de los eliminados antes de la final.

La opción `Calcular clasificación final` solo se habilita tras completar y revisar todos los resultados activos. Esto no impide utilizar antes los cálculos parciales. Incluso el cierre calculado sigue pendiente de la clasificación oficial de AECAR.

## Reglas independientes de Lleida

En ambas categorías GT8 cuentan las dos mejores pruebas de tres, sin puntos por asistencia. La escala de puestos y el desempate se remiten al Reglamento General AECAR 2026. Véase `sources/FUENTES_Y_DATOS.md`.

El motor recibe reglas por categoría. Los valores por defecto de Gran Escala se conservan para las pruebas de regresión; NO se utilizan en los datos GT8. Los datos y guardados de Nitro/ECO nunca se mezclan con Gran Escala GT/F1.

## Guion y combinaciones

- `Micrófono abierto · Guion para leer`: relato calculado con los puestos parciales introducidos; se puede copiar.
- `Claves y combinaciones para retransmitir`: titulares iniciales, con su supuesto de participantes claramente visible. Se ocultan cuando los ajustes hacen que dejen de ser aplicables.
- `¿Qué necesita cada piloto para ser campeón?`: elige un piloto y consulta sus resultados posibles y todas las condiciones simultáneas sobre los rivales. **Esta tabla se calcula desde cero: ignora las posiciones del directo**, pero respeta los participantes y ajustes actuales. No calcula probabilidades.

Las condiciones de título se refieren al campeón en solitario; un empate que no pueda resolver el reglamento no se convierte arbitrariamente en una victoria. Los empates múltiples sin un criterio común suficiente se señalan para revisión.

## Guardado, privacidad y copias

El HTML implementa guardado local automático con la clave `regionatlas:cerdanyola-gt8-2026:race-desk:v2`. Contiene ambos estados separados (`NITRO` y `ECO`) y la pestaña activa. Los datos no se envían al servidor ni se comparten con otro móvil.

`Guardar copia` produce un JSON de ambas categorías. `Importar copia` valida evento, categoría, datos históricos y puestos; rechaza las copias de Lleida. `Exportar tabla` genera CSV. Guarda una copia antes de cambiar de dispositivo, de navegador, de archivo local a la web o de dominio. La disponibilidad/persistencia de localStorage depende del navegador y del origen; utiliza copias JSON para conservar datos importantes.

La página contiene `noindex,nofollow,noarchive` y carece de enlaces públicos internos. **Esto no es autenticación**: cualquiera que conozca la URL puede abrirla. No introducir secretos ni datos personales ajenos al uso de esta calculadora.

## Construir y probar

Requisitos del constructor: Python 3. Requisitos de las pruebas de motor: Node.js con `node:test`. No hay dependencias npm de ejecución.

```sh
python3 build.py
node --test tests/gt8.test.cjs
node --test tests/regression/*.cjs
```

Para la prueba visual/DOM incluida se necesita Python Playwright y Chromium. El script usa `/usr/bin/chromium`; adapta únicamente esa ruta a un navegador instalado cuando sea necesario.

```sh
python3 tests/ui_smoke.py
```

La prueba DOM usa `set_content` y un adaptador de almacenamiento en memoria porque este entorno bloquea la navegación. **Sus pruebas de reconstrucción de estado NO certifican el guardado real al recargar una URL HTTPS.** Eso debe verificarse tras publicar, según la orden de Codex. No hay intento de eludir ese bloqueo.

## Estructura

`src/engine.js`: puntos, descartes, comparaciones, importación, asignación de posiciones, clasificación completa y cotas parciales.

`src/scenarios.js`: condiciones de título mediante asignaciones de puestos distintos.

`src/broadcast.js`: guion determinista por categoría, sin llamadas a modelos.

`src/seed-nitro.json` y `src/seed-eco.json`: instantáneas, reglas, fuentes y pilotos.

`src/app.js`, `src/app.css`, `src/shell.html`: interfaz y persistencia. `build.py` los empaqueta en el HTML autónomo.

Para hasta 40 participantes activos, el cálculo parcial usa emparejamiento bipartito de posiciones compatibles; no trata como simultáneamente posibles dos primeros puestos. Por encima de ese umbral utiliza cotas conservadoras: no anunciará como fijada una posición que no pueda justificar.

## Antes de publicar

Lee `ORDEN_CODEX_CERDANYOLA_GT8.md`. Inspecciona el repositorio real y utiliza su sistema de rutas y despliegue, sin asumir que dispone de una configuración concreta. Verifica la URL limpia, el HTML servido, el guardado real, móvil, importación/exportación, ausencia de posiciones duplicadas y la continuidad de la calculadora de Lleida.
