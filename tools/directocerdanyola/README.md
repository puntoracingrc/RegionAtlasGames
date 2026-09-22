# Cerdanyola Live Race Center

La parrilla previa se captura desde las dos páginas públicas de inscripción de AECAR. Mientras la inscripción esté abierta, todos los nombres visibles ocupan plaza y pueden puntuar en las simulaciones, aunque se conserve por separado el estado `confirmed` o `unconfirmed`. Los estados de licencia `Día` o `Pdte.` son informativos: pueden regularizarse el día de la carrera y no excluyen al piloto de los cálculos provisionales.

Actualizar la captura:

```bash
python3 tools/directocerdanyola/registrations/fetch_aecar_registrations.py
python3 tools/directocerdanyola/build.py
cp tools/directocerdanyola/directocerdanyola.html public/herramientas/directocerdanyola.html
```

El JSON resultante omite datos de contacto, pago y material. Cuando AECAR cierre las inscripciones, hay que volver a capturarlo y revisar el estado definitivo antes de cambiar `rosterMode`.

`track/cerdanyola.json` conserva la cuerda estimada de 215,15 m medida manualmente en Google Maps. La pantalla calcula `metros / segundos × 3,6` para mostrar la velocidad media de cada vuelta y `vueltas × metros` para la distancia recorrida. Ambos datos se etiquetan como orientativos porque no proceden de una longitud homologada.

## Estrategia Nitro

`pit-analysis/event-100645-laps.json` conserva únicamente las vueltas públicas de cinco informes MyRCM del 19–20 de septiembre. Se regenera con:

```bash
python3 tools/directocerdanyola/pit-analysis/fetch_myrcm_laps.py
```

`event-100645-profiles.json` registra perfiles iniciales para Marc García, Raúl Fernández, Jordi Canadell y Eduard Chamero, que también aparecen en la preinscripción del Campeonato de España. La pantalla no presenta las paradas como hechos: distingue `Ventana de repostaje`, `Repostaje probable`, `Pérdida atípica` y `Posible incidencia`, siempre con nivel de confianza.

`event-95551-national.json` añade semifinales, Last Chance y final de la segunda prueba del Nacional 2026 en ARCA. `event-94567-national.json` conserva las equivalentes de Almussafes. `track/arca.json`, `track/almussafes.json` y `track/asoger.json` registran las mediciones manuales orientativas de 276,42 m, 290,56 m y 287 m facilitadas por el usuario. Estos datos solo transfieren hábitos del piloto y una horquilla temporal: el consumo depende del trazado, del uso de gas y de las condiciones, por lo que la predicción en vueltas no se activa hasta observar al menos ocho cruces limpios en Cerdanyola. Una primera parada local corrige el anclaje y dos o más corrigen también la cadencia.

El ritmo se adapta con las vueltas limpias más recientes de la jornada para absorber mejoras de pista, temperatura, neumáticos y puesta a punto. La cadencia de combustible se aprende por separado. La ruta de solo lectura `/api/myrcm/laps` recupera, de una en una, las clasificatorias y finales que MyRCM ya marca como disponibles: las primeras calibran ritmo y las finales permiten aprender las paradas del propio evento. Los historiales de la sesión se guardan localmente por evento, sección, manga, informe y piloto para sobrevivir a una recarga del navegador. Un piloto irregular recibe márgenes más amplios y una confianza menor; dos vueltas anómalas seguidas o una demora extrema dejan de tratarse como un repostaje aislado. La final incompleta de Marc (38 vueltas frente a 95 del ganador) se conserva como control de abandono/incidencia.

Panel público de lectura para el flujo WebSocket de MyRCM. Reutiliza el motor, los datos y las reglas de la calculadora de Cerdanyola sin modificar su página existente.

- Demo: evento MyRCM `100645`.
- La categoría se detecta desde `SECTIONNAME`.
- Los pilotos se vinculan por nombre normalizado, incluidos los nombres que MyRCM envía con el apellido primero.
- La torre muestra la manga activa, mientras que la proyección del campeonato usa por separado el ranking agregado publicado por MyRCM.
- En ECO, el agregado permanece provisional hasta terminar todas las finales. Las plazas solo se presentan como aseguradas si sobreviven a cualquier orden restante.
- El centro de retransmisión cruza puesto de la prueba, general del campeonato, cambios de una plaza, rivales decisivos y fases publicadas.
- El archivo histórico cruza los pilotos de MyRCM con 43 campeonatos/modalidades publicados por AECAR entre 1999 y 2025. Las Copas se mantienen separadas y las discrepancias documentales quedan marcadas en `history/HISTORICAL_AUDIT.md`.

```bash
npm test
npm run build
```
