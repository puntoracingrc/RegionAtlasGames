# Validación de la entrega — 13/09/2026

## Resultado

- Motor GT8: **26/26 pruebas correctas**, `qa/gt8-engine-log.txt`.
- Regresión de Gran Escala GT/F1: **49/49 pruebas correctas**, `qa/regression-log.txt`.
- Interfaz DOM y flujos: **53/53 comprobaciones correctas**, sin errores JavaScript ni solicitudes de red, `qa/ui-results.json` y `qa/ui-log.txt`.
- Capturas de escritorio y de anchuras 360/390 px: carpeta `qa/`. Inspección visual de la disposición; sin desbordamiento horizontal del documento en los casos registrados.

## Alcance de cálculo

Se contrastan los 40 totales históricos. El motor GT8 se compara con un oráculo de cálculo independiente en 600 clasificaciones completas aleatorias (300 por categoría). Se recorren las 720 permutaciones de cada una de dos subparrillas de seis pilotos (1.440 en total). Se contrastan 200 completaciones aleatorias de escenarios parciales y las condiciones de título sobre completaciones completas. La regresión F1 incluye 5.040 permutaciones completas.

Estas pruebas no equivalen a enumerar todas las permutaciones de los 26 Nitro o 14 ECO. No se afirma una demostración formal de todo estado futuro arbitrario. El motor y los escenarios mantienen avisos para los empates que no puedan resolver y cotas conservadoras cuando procede.

## Límites de la prueba visual

El navegador de este entorno bloquea la navegación, incluso a localhost. Se ha usado `page.set_content` y un adaptador de `localStorage` en memoria. Esto prueba entradas, DOM, serialización y reconstrucción del estado; **no demuestra persistencia del almacenamiento real después de recargar una URL ni un comportamiento HTTPS en producción**. No se ha intentado eludir el bloqueo.

**No probado aquí:** URL pública final, enrutado y cabeceras reales, ausencia efectiva en el sitemap del repositorio, continuidad de la página de Lleida ya desplegada, almacenamiento real por origen, descarga y recuperación entre navegadores/dispositivos, funcionamiento en Safari real.

Estos puntos están en los criterios de aceptación de la orden de Codex. El estado de esta entrega es local, no desplegado.

## Limitaciones funcionales explícitas

Entrada manual, sin conexión al cronometraje. La lista histórica es una parrilla hipotética, no unos inscritos confirmados. El usuario debe confirmar participación y derecho a puntuar. En ECO se introducen puestos agregados de la prueba, no resultados aislados de cada final. Las decisiones oficiales y sanciones no se infieren. La página no está protegida con contraseña. Los guardados no se sincronizan entre dispositivos.
