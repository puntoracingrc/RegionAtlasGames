# Descubrimiento de lanzamientos GAME

## Alcance

El flujo descubre juegos físicos nuevos y seminuevos de PlayStation 5 y Nintendo Switch 2 publicados en GAME España para preparar nuevas fichas de Region Atlas.

- No captura ni importa precios.
- Unifica la modalidad nueva y seminueva en una sola ficha de juego y conserva por separado sus SKU y URL de procedencia.
- El flujo periódico no publica juegos automáticamente.
- No modifica el catálogo hasta que un administrador crea y revisa un borrador.
- El extractor masivo manual de precios GAME nuevo/seminuevo sigue siendo un flujo independiente.

La apertura inicial de una plataforma puede hacerse con un lote de fuente aprobado mediante `scripts/import_game_release_catalog.py`. Es una operación extraordinaria, versionada en Git y separada del recolector periódico. El importador exige `--approve-source-batch`, rechaza cualquier campo de precio, descarga las portadas al alojamiento propio y no sobrescribe datos enriquecidos manualmente.

## Criterios de entrada

Un producto solo se propone si cumple todos estos criterios:

- pertenece a la plataforma exacta consultada;
- su ruta de GAME es de `videojuegos`, no de accesorios, consolas o merchandising;
- tiene fecha de lanzamiento conocida y no futura;
- GAME lo marca disponible;
- la oferta nueva muestra `Comprar`, no `Reservar` ni `Pre-compra`, o existe una oferta seminueva disponible;
- tiene SKU, URL de producto y portada.

La salida conserva título, plataforma, región propuesta `PAL España`, fecha, SKU, URL, portada, PEGI, editor, géneros y modalidades disponibles. Cuando existe seminuevo conserva además su SKU y URL, nunca el precio. El contrato de resultado declara `containsPrices: false` y el servidor rechaza resultados antiguos o incompatibles. GAME España es evidencia comercial para proponer la región, no una prueba definitiva de la edición física; las fichas quedan con `regionVerified: false` hasta una comprobación específica.

## Duplicados

La búsqueda usa tres niveles:

1. SKU o URL ya vistos en resultados anteriores: no se vuelve a proponer.
2. Título exacto en la misma plataforma y región: se considera ya catalogado.
3. Título parecido: se muestra como posible duplicado y exige revisión humana.

El recorrido está ordenado por fecha de lanzamiento descendente. Termina al encontrar tres juegos conocidos consecutivos o al alcanzar los límites de páginas/candidatos. Las variantes de otras regiones no se consideran duplicados exactos de `PAL España`.

## Operación

- Admin: `/admin/precios`, bloque `Nuevos lanzamientos PS5 y Switch 2`.
- Manual: elegir plataforma y pulsar `Buscar lanzamientos`.
- Automático: cada lunes a las `06:15 UTC`, Vercel encola PS5 y Switch 2.
- Ejecución: el runner local recoge el job cuando está encendido; el Mac no abre puertos.
- Revisión: cada candidato puede abrirse en GAME, convertirse en borrador o descartarse.
- Publicación: continúa en la cola normal de catálogo y conserva su revisión final habitual.

Para un alta inicial masiva aprobada:

```bash
python3 scripts/import_game_release_catalog.py \
  --input /ruta/al/lote-game.json \
  --covers-dir /ruta/temporal/portadas \
  --require-covers \
  --approve-source-batch \
  --report data/catalog-seed-reports/game-es-PLATAFORMA-AAAA-MM-DD.json
```

Primero debe ejecutarse con `--dry-run`. Después de la importación se suben y verifican todas las portadas propias, se reconstruyen los índices y el cambio completo pasa por rama, PR, checks y verificación de producción.

Antes de activar la primera búsqueda, el equipo que ejecuta `scripts/local_game_runner.py` debe usar una versión que incluya `catalog_discovery`. Si devuelve el formato antiguo de precios, el servidor marca el job como error y no guarda ni importa el resultado.

## Límites

- 80 candidatos por ejecución.
- 4 páginas de GAME por modalidad y hasta 80 fichas de producto para localizar su enlace seminuevo.
- 3 juegos conocidos consecutivos para detener la búsqueda.
- 365 días de resultados recientes consultados por el runner para evitar repetir candidatos.
- Un único job activo por plataforma.

GAME sigue siendo una fuente externa. Un cambio de su API, etiquetas o disponibilidad puede detener la recogida; el fallo queda visible en Admin y no afecta a fichas ya publicadas.
