# Game Boy revisado y combinaciones de distribucion SNES

## Alcance y significado

Lote `gameboy-visual-reviewed-20260908`, autorizado por el usuario tras la revision
visual de 16 anuncios y 28 fotografias. Base de datos:
`521dc58fdb9099dea5944ca5abb5daadd0a82dc5`.

Es aprendizaje persistente mediante referencias y ejemplos recuperados por el
engine, no un entrenamiento nuevo de los pesos del modelo. No se han lanzado
tandas pagadas para validar este cambio. El modelo configurado no se cambia.

La distribucion comercial, los idiomas impresos, el idioma jugable, la integridad
del contenido y la autenticidad son dimensiones diferentes. Una foto de un
ejemplar no demuestra que su conjunto corresponda a una tirada de fabrica.

## Aplicacion del muestreo Game Boy

| Ficha | Region | Estado observado | Precio pedido EUR | Anuncio |
| --- | --- | --- | ---: | --- |
| gameboy-it-tetris (nueva) | PAL Italia | Caja, cartucho y manual visibles | 349.95 | 137429610296 |
| gameboy-es-super-mario-land-2 | PAL Espana | Cartucho | 25.00 | 800612078639 |
| gameboy-pal-super-mario-land-3-wario-land | PAL Europa | Cartucho | 16.95 | 267775480937 |
| gameboy-pal-tetris-attack | PAL Europa | Cartucho | 45.00 | 305715721792 |
| gameboy-uk-super-hunchback (nueva) | PAL UK/ENG | Caja, cartucho y manual visibles | 245.00 | 407058967122 |
| gameboy-de-snoopys-magic-show (nueva) | PAL Alemania | Caja, cartucho y manual visibles | 65.00 | 146943102104 |
| gameboy-legend-zelda-links-awakening | PAL Europa | Cartucho | 79.90 | 800220276200 |
| gameboy-usa-quarth | USA | Cartucho | 9.99 | 127861119657 |

Son ocho observaciones individuales de anuncios activos recogidos el
2026-09-07T21:36:07Z y revisados el 2026-09-08. No son ventas cerradas, ni ocho
medianas, ni una certificacion de autenticidad. Los precios no incluyen envio.
Se conserva la logica existente de estimaciones orientativas: no se inventa un
tamano de muestra suficiente ni se copian importes/IDs de PriceCharting desde
otra region. Se conservan los restantes estados de precio existentes.

Italia se incorpora a la presentacion publica, bandera y filtro. Antes de este
lote no habia fichas PAL Italia; su canonical nuevo usa `pal-it` y no cambia
ninguna URL anterior.

Las tres nuevas fichas usan fotografias del ejemplar revisado como imagen
provisional, sin alterar sus piezas. Las URL de origen y de todas las fotos
examinadas se conservan en `data/region-research/gameboy-reviewed-listings.json`.
No se presenta la foto del vendedor como un escaneo oficial ni como prueba de
una combinacion de fabrica. El informe conserva los valores anteriores y nuevos.

Se rechazan tres no-juegos: iman de Monster Max (143915168489), VHS Waterworld
(275605922422) y manual suelto Mario Land 2 (297478441978). Permanecen pendientes
Pinball, Bad N Rad, Mickey, Street Fighter II y Pokemon Blue: no se aplica su
precio ni se inventa una edicion por resolver. El texto del vendedor no sustituye
las fotos; en particular, Quarth se identifica como USA y Mario Land 2 no se
atribuye a Mario Land 1.

Este lote no recalcula todos los agregados historicos de Game Boy. Algunos
estados historicos, como `game_manual`, proceden de tandas no auditadas por
completo. Su permanencia no significa que hayan sido validados en este muestreo.

## Aprendizaje de distribuciones

`data/region-research/snes-distributions.json` incorpora 39 juegos y 40
combinaciones del texto W-Z aportado por el usuario, mas una referencia pendiente
sobre Kirby. Cada alternativa conserva componentes, codigos parciales cuando
eso es lo que aporta la fuente, idiomas impresos, suplemento traducido,
distribuidor, ubicacion de pegatinas, fuente, confianza y fechas desconocidas.

Zombies FAH/Bandai y Zombies NOE/suplemento A4 son dos alternativas distintas.
No se unen sus piezas en un supuesto inventario unico. Spaco, Arcadia y Shine
Star solo se usan como pistas positivas en los juegos explicitamente asociados;
no se aplican globalmente. Bandai requiere la observacion adicional del manual
espanol en ese ejemplo. GiG y manual italiano reconocen el caso documentado de
Tetris Italia sin emitir evidencia espanola.

Una ausencia en la guia no provoca un veto. Las variantes no confirmadas como
distribucion espanola permanecen pendientes; no se convierten en prohibiciones.
No se exige ESP en todas las piezas, ni un suplemento universal, ni un accesorio
no documentado. Una marca de distribucion ayuda a identificar el mercado pero
no certifica la compatibilidad de todos los componentes del ejemplar.

Fuentes de esta ampliacion:

- [Guia SNES y texto W-Z aportado](https://foro.spinecard.com/t/super-nintendo-pal-espana-la-guia-del-coleccionista-definitiva/1176).
- [Post 95](https://foro.spinecard.com/t/super-nintendo-pal-espana-la-guia-del-coleccionista-definitiva/1176/95?page=5): pregunta sobre Kirby, no una respuesta confirmatoria.
- [Post 276](https://foro.spinecard.com/t/super-nintendo-pal-espana-la-guia-del-coleccionista-definitiva/1176/276?page=17): idiomas de ROM/software, no prueba de distribucion fisica espanola.

El hash del texto original se conserva junto a la procedencia. Las guias previas
de Game Boy, SNES, Mega Drive y NES se mantienen. No se copian imagenes del foro.
No se modifica ninguna ficha ni precio de SNES.

## Conexion del engine

- La investigacion general y por ID llega al recolector y a la revision visual.
- Los ocho ejemplos aceptados y los negativos se recuperan por ficha; las
  decisiones operativas existentes tienen prioridad sobre las referencias.
- Dos resoluciones de una foto eBay se deduplican, sin inventar caras adicionales.
- Se aprovechan las imagenes adicionales realmente suministradas por eBay; no
  se afirma haber recuperado galerias completas cuando la respuesta no las trae.
- La revision/politica forma parte de la clave de cache visual. No se fuerza
  una nueva tanda ni se purgan las caches generales del recolector.
- El inbox de Admin importa decisiones versionadas con lote, revisor y registro
  concordante, sin pisar decisiones existentes ni aceptar terminales sin respaldo.
- Los alias regionales son grupos de IDs revisados. Siguen separadas plataforma,
  edicion fisica y secuelas. No hay propagacion por similitud de titulo.

El analizador publico de fotos y el dictamen de conjunto mezclado quedan para
otra fase. Esta base permite conservar alternativas y justificar senales; no
ofrece todavia una certificacion "100% espanola" ni deteccion exhaustiva de
reproducciones o mezclas.

## Comparador y rollback

```sh
python3 scripts/apply_gameboy_reviewed_batch.py --compare-base
python3 scripts/apply_gameboy_reviewed_batch.py --check
python3 scripts/test_reviewed_regional_learning.py
python3 scripts/test_region_research.py
npx tsx --test src/lib/ebay-review-inbox.test.ts
```

El comparador reproduce los cambios desde los blobs de la base y exige igualdad
completa de catalogo, cola, metadata e informe de curation con el resultado.
Resultado del corte: 73.104 -> 73.107 fichas/IDs unicos; tres altas, cero bajas,
ocho precios, once decisiones. Los IDs, slugs, URLs y portadas anteriores se
preservan. Companias: 4.481, sin cambios. El informe historico de descargas Wii
no se reescribe para presentar estas tres imagenes como parte de aquella tanda.

Las cantidades del corte viven en el informe, no limitan el crecimiento del
catalogo en tests globales. La prueba permanente reproduce el lote como fixture.

Para rollback inmediato puede revertirse el commit de integracion. Si ya hay
cambios posteriores, el informe before/after permite comprobar cada campo antes
de revertir solo lo que siga coincidiendo; no sobrescribir nuevas revisiones,
precios o colecciones. No borrar automaticamente fichas que ya tengan propietarios.

Los resultados de Quality, build, Preview y Production se registran en la PR
correspondiente; este documento no sustituye esas comprobaciones.

## Prerrequisito de despliegue detectado

El despliegue de la base 521dc58 ya habia fallado en Vercel: la funcion
`admin/juegos/[catalogId]` ocupaba 250.63 MB, por encima de su limite. Se excluyen
del tracing unicamente los diarios JSONL crudos de tokens del worker, el informe
offline de este lote y el indice historico `company-logos/history-routes.json`.
Ninguno es leido por las rutas de la web; la interfaz usa
el resumen `lastRun.aiUsage`. Los diarios, el informe, las decisiones de cola y
los datos de aprendizaje siguen conservados en Git; no se cambian limites ni
variables del proveedor. La Preview verifica el paquete real de Linux.

La primera Preview resolvio el limite de admin/juegos pero senalo admin/precios
(250.42 MB); el indice de investigacion de logos supone otros 3.79 MiB que no
deben formar parte de ninguna funcion. Los perfiles y logos publicos no cambian.
