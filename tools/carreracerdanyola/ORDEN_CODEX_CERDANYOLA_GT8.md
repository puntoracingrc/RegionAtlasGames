# ORDEN PARA CODEX — PUBLICAR CERDANYOLA GT8 NITRO + ELÉCTRICO

## Encargo y límite de alcance

Integra y publica la aplicación adjunta en el repositorio real de RegionAtlasGames, en una ruta nueva y sencilla:

**`https://www.regionatlas.games/carreracerdanyola`**

La calculadora ya está creada. Reutiliza su HTML, fuentes, datos y motor. No la reconstruyas desde cero ni cambies las reglas para adaptarlas a una implementación anterior.

**No modifiques, sustituyas ni borres `/carreralleida`, sus archivos, datos o guardados.** No hagas cambios en el catálogo, compañías, videojuegos, workers eBay, Supabase, facturación, otros proyectos ni menús de navegación. No hacen falta claves API, IA, base de datos ni servicios nuevos.

Esta entrega NO está publicada. El trabajo solicitado es dejar la ruta real operativa en producción siguiendo el flujo de aprobación autorizado del repositorio, no entregar solamente otro HTML local.

## 1. Inspección previa obligatoria

Lee el README y las normas vigentes del repositorio. Comprueba rama, estado de trabajo, arquitectura real, public assets, rutas, cabeceras, robots/sitemap, pruebas y despliegue. Si existe la herramienta de Lleida, inspecciona cómo se sirve, sin modificarla.

No presupongas que el proyecto usa Next.js, Vite o una determinada configuración de Vercel. Usa el mecanismo que ya tenga. Si el estado del repositorio contiene cambios ajenos, no los sobrescribas ni hagas reset, clean o force-push. Sigue el proceso de ramas, PR, aprobación y despliegue existente.

## 2. Integración mínima y aislada

Sirve `carreracerdanyola.html` desde la ruta limpia `/carreracerdanyola`. Puede implementarse mediante un archivo estático y una reescritura exacta si el framework lo permite. Evita un iframe o una envoltura que cambie la usabilidad, el origen del almacenamiento o el comportamiento de impresión/descarga.

Incluye las fuentes y las pruebas de forma aislada, en una carpeta apropiada del repositorio. Mantén `build.py` reproducible. Si la integración exige adaptar la construcción, demuestra que el resultado funcional es equivalente.

La ruta debe devolver HTTP 200 y el HTML correcto, no una página de inicio, un fallback SPA, una página 404 ni una redirección circular. Respeta el dominio canónico del proyecto y verifica la URL final.

No añadas enlaces desde portada, menús, footer, buscador ni catálogo. Excluye la ruta limpia y cualquier `.html` alternativo de todos los sitemaps. Mantén `<meta name="robots" content="noindex,nofollow,noarchive">` y añade la cabecera `X-Robots-Tag: noindex, nofollow, noarchive` para ambas variantes que se sirvan. No confíes en `robots.txt` como sustituto de noindex; impedir el rastreo puede impedir que se lea esa instrucción.

Esta página no listada no tiene contraseña. No afirmes que es privada o inaccesible a terceros que conozcan su URL. No expongas fuentes de prueba, secretos ni datos ajenos en rutas públicas innecesarias.

Si la política CSP del sitio impide el HTML autónomo, adapta esta ruta usando el mecanismo seguro del proyecto (por ejemplo hashes o separación de archivos), sin relajar globalmente las políticas de seguridad ni desactivar protecciones del resto del sitio.

## 3. Funcionalidad que debe mantenerse

Dos pestañas independientes: **GT8 Nitro** y **GT8 Eléctrico / ECO**. No se trata de Gran Escala. Mantén las 26 filas históricas de Nitro y las 14 de ECO, sus dos resultados previos, sus puntos y las etiquetas literales no resueltas.

La parrilla inicial es HIPOTÉTICA. No ha sido validada una lista de inscritos de Cerdanyola. Conserva el aviso visible, el botón `Participantes` para quitar ausentes y el botón `Añadir piloto` para nuevas altas sin historia anterior. Un ausente no desaparece del campeonato: conserva C1/C2.

Cada piloto tiene un selector numérico de posición. Los puestos ya ocupados están deshabilitados para otros pilotos de esa misma categoría. Un cambio reordena la carrera y recalcula el campeonato inmediatamente. Las flechas intercambian ambos puestos en una operación; nunca dejes dos pilotos en el mismo puesto. Conserva las validaciones también en importación y entrada rápida, no solo en el control visual.

Mantén los resultados parciales: no obligues a completar toda la parrilla para ver el podio o las cuatro primeras plazas. Si faltan resultados relevantes, expresa incertidumbre e identifica a los pilotos necesarios. No inventes el orden de los que están en blanco ni supongas que han sido últimos, ausentes o sancionados.

Mantén el guion dinámico, botón copiar, titulares iniciales por categoría, condiciones de título por piloto, vista de carrera y campeonato, desglose de puntos, favoritos, búsqueda, deshacer, nuevas altas, ajustes de participación/puntuación, copia JSON, importación, CSV y cierre revisado de la clasificación completa.

En Eléctrico debe seguir muy visible que se introduce la GENERAL DE LA PRUEBA, agregada tras las finales. No sumar posiciones de finales ni usar los puntos internos 0/2/3 como puntos del campeonato. La agregación de finales no está implementada ni debe prometerse.

## 4. Reglas deportivas innegociables

Cada categoría GT8 tiene tres pruebas y cuenta las dos mejores. **Cero puntos de bonificación por asistencia**, cualquiera que sea el número de participaciones. No reutilices el +100/+150 de Gran Escala.

Respeta el baremo y los desempates ya parametrizados: puntos totales, victorias, segundos, terceros de las pruebas que cuentan; mejor descarte; última carrera común. No rompas los empates con orden alfabético, ranking previo, nacionalidad, identificador o una preferencia fija por quien lideraba. Conserva la revisión de empates no resolubles.

No recalcules ni corrijas de oficio las posiciones históricas 100, 101 y 102 con un punto. No deduzcas quién es un `Piloto no encontrado`, ni que un nombre portugués sea necesariamente no puntuable. Las correcciones de elegibilidad y puntos requieren decisión explícita del usuario/organización y no renumeran automáticamente los puestos de los demás.

## 5. Persistencia separada

La clave es `regionatlas:cerdanyola-gt8-2026:race-desk:v2`; el evento es `cerdanyola-gt8-2026` y las categorías `NITRO` y `ECO`. No cambiarla gratuitamente, borrar estados existentes ni utilizar la clave de Lleida.

Una copia contiene ambos estados; debe rechazar archivos de otro evento/categoría y alteraciones del histórico. Un fallo de importación no puede destruir el estado actual. Los resultados son locales a ese navegador/origen; no existe sincronización entre personas ni dispositivos. Las copias JSON sirven para trasladarlos.

## 6. Pruebas del paquete

Ejecuta:

```sh
python3 build.py
node --test tests/gt8.test.cjs
node --test tests/regression/*.cjs
```

El paquete pasa 26 pruebas GT8 y 49 de regresión de GT/F1. La regresión incluye las 5.040 permutaciones de la parrilla F1 anterior. GT8 incluye contrastes con un oráculo independiente, permutaciones de dos subparrillas, casos de desempate, incertidumbre y condiciones de título. No lo describas como una enumeración de todas las permutaciones de 26 pilotos.

`tests/ui_smoke.py` documenta 53 comprobaciones DOM. Aquí se ha ejecutado con HTML inyectado y adaptador de almacenamiento en memoria por una restricción del navegador. **NO constituye una verificación del localStorage real de producción ni de recargar una URL HTTPS.** No declares que esos puntos ya están probados en el dominio real.

## 7. Casos de aceptación en navegador real y URL desplegada

**Nitro parcial:** introduce Cristian 1, Marc 2, Darás 3 y Fabio 4. Con los otros 22 resultados vacíos deben fijarse las cuatro plazas de campeonato: Cristian, Darás, Marc y Fabio, en ese orden. El cierre completo continúa pendiente.

**ECO parcial:** introduce Carles 1, Cristian 2, Joao 3 y Francisco José Franco 4. Con otros diez resultados vacíos las cuatro plazas son Carles, Joao, Cristian y Franco.

**ECO incertidumbre:** Carles 1, Cristian 2, Joao 3 y Daniel 4 no deben fijar todavía la cuarta plaza. Franco 5 la da a Franco; Franco 7 la da a Daniel.

**Desempates ECO:** Cristian 1 y Joao 2: campeón Joao por el descarte. Cristian 1 y Joao 3: campeón Cristian por la última prueba común. Si Joao está ausente y Cristian 1 / Carles 2, Joao puede ser tercero: no reemplazar ausencia por un último puesto.

**Reglas de Oro:** Cristian o Darás ganando Nitro aseguran el título. Carles o Joao ganando ECO aseguran el título. El resultado ganador de un nuevo piloto no debe apropiarse de victorias históricas de un homónimo en otra categoría.

Comprueba en móvil de 360 y 390 px, y escritorio, sin desbordamiento horizontal del documento. Prueba selectores, flechas, foco, pestañas y diálogos; un primer puesto puede existir en cada categoría pero nunca duplicado dentro de la misma.

Verifica el guardado REAL: modifica ambas pestañas, recarga la URL, cierra y abre la pestaña, confirma que se mantienen datos y categoría. Hazlo sin interceptar localStorage. Comprueba exportar/importar JSON, fallo seguro de importación ajena y CSV. Guarda una copia antes de cualquier prueba destructiva.

Comprueba que `/carreralleida` sigue funcionando y que sus guardados no han cambiado. Comprueba noindex/meta/cabeceras, HTTP, ausencia de sitemap/enlaces públicos y de errores de consola. Respeta las limitaciones de las herramientas: no eludas bloqueos de navegación; documenta cualquier verificación que no pueda ejecutarse.

## 8. Cierre y entrega a Alberto

Publica en producción siguiendo el flujo autorizado. Si el repositorio exige una aprobación que no tienes, deja el trabajo listo y explicita ese único bloqueo; no inventes que está publicado.

Entrega la URL de producción VERIFICADA, estado HTTP, commit/PR/despliegue reales, resumen breve de pruebas y limitaciones pendientes. Diferencia implementación terminada, preview y producción. No sustituyas una URL real por un sandbox, localhost o enlace de preview sin explicarlo.
