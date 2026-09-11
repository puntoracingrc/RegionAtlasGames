# Resident Evil: escaneos ES/IT y ediciones Requiem

Se añaden 11 portadas principales, 11 reversos y 11 lomos a fichas existentes: diez PS4 y Requiem Deluxe PS5. Los 77 WebP ocupan 14.974.876 bytes. Los recortes conservan los píxeles de los originales; se mantienen masters PNG fuera de Git. Los nombres de archivo describen juego, plataforma, ES/IT y componente.

Cada EAN se ha leído en su reverso y cada CUSA/PPSA en su lomo, enlazando ambas caras del mismo ejemplar. La carátula es compartida España/Italia. Textos y voces proceden de las tablas impresas: RE5, RE6 y Origins Collection llevan textos ES/IT y voces en inglés. El texto sobre manuales no acredita un folleto físico conservado. No se han probado los discos.

RE7 se enlaza a Gold Edition por portada y lomo. RE4 remake se enlaza a su ficha PS4 Steelbook por confirmación del propietario. Requiem se enlaza a Deluxe con Steelbook; ambas galerías se rotulan como caja exterior, sin presentar la caja de plástico como fotografía del metal interior. Se mantiene íntegra la galería Lenticular anterior, añadiendo la explicación de GAME y la diferencia de conjunto completo.

La comparativa Requiem usa las cuatro fichas PS5 ya existentes: estándar, Lenticular, Deluxe y Collector’s Edition japonesa. Conserva ID, región, edición interna, URLs, precios y colecciones. No copia el EAN de Lenticular a estándar ni inventa un JAN de la japonesa. Las cuatro imágenes adjuntas por el usuario se presentan aparte como referencias, no como escaneos propios ni portadas regionales nuevas.

Fuentes documentales comprobadas el 12 de septiembre de 2026:

- [GAME: exclusividad de Lenticular Edition](https://www.game.es/VIDEOJUEGOS/EXCLUSIVAS-GAME).
- [Catálogo GAME: página impresa 53](https://media.game.es/Catalog/Dynamic/Catalogo_384/catalogo.pdf): carátula lenticular y bonificación de reserva. Una caja compartida no identifica por sí sola el conjunto.
- [Capcom Japón: Collector’s Edition PS5 C00009266](https://www.e-capcom.com/shop/g/gC00009266/): Deluxe física, Steelbook, soporte acrílico y caja exterior. Se documenta el mercado japonés; no se extrapola su referencia comercial a un código JAN ni a una edición PAL.

La migración modifica únicamente `coverUrl`, `regionVerified` y `regionEvidence` de las once filas; el resto de catálogos, `game-details.json` y los precios se conservan. El registro de escaneos aplica los códigos observados al mostrar la ficha y mantiene el historial documental. El libro de enmiendas actualiza el hash exacto para que los controles históricos PS1/PS2 puedan distinguir estos cambios de la migración regional.

La evidencia reproducible está en `data/research/owned-scans/2026-09-12-resident-integration.json` y `2026-09-12-requiem-reference-assets.json`; las pruebas cubren identidad, idioma, ediciones, integridad de imágenes y ausencia de propagación a otro mercado.
