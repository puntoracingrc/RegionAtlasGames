# Fuentes, reglas y trazabilidad — GT8 Cerdanyola 2026

Revisión: 13 de septiembre de 2026. Los resultados previos son la instantánea tras C2, no una predicción de C3. Las 40 filas se contrastan contra los datos facilitados y los listados AECAR, conservando nombres y posiciones previas.

## Fuentes primarias

**Nitro, Reglamento 2026**, §3.1 (página 5 del PDF): tres pruebas, dos resultados que cuentan, sin bonificación de asistencia; referencia al desempate general.
https://aecar.org/mod/rg/doc/Reglamento%20GT8%20Nitro%20AECAR%202026.pdf

**Eléctrico, Reglamento 2026**, §3.1 (página 5) y §6.1 (página 8). Misma estructura de campeonato; la agregación de finales utiliza otro sistema. La calculadora recibe la posición general de la prueba y no ejecuta esa agregación.
https://aecar.org/mod/rg/doc/Reglamento%20GT8%20el%C3%A9ctrico%20AECAR%202026.pdf

**General AECAR 2026**, §17.1 (baremo) y §18.1 (desempate; páginas 28–29 del PDF): se utilizan la tabla de puntos, los puestos de podio de los resultados puntuables, el descarte y la última prueba común. Se conservan los empates sin resolución.
https://aecar.org/documentos/aecar/reglamento_general_aecar_2026.pdf

**General Nitro tras C2**, publicada con fecha de generación 30/04/2026, 05:01:
https://aecar.org/mod/rg/doc/campeonato%20nacional%20gt8%20nitro%202026%20%289%29.html

**General ECO tras C2**, publicada con fecha de generación 30/04/2026, 04:59:
https://aecar.org/mod/rg/doc/campeonato%20nacional%20gt8%20eco%202026%20%285%29.html

**Página de modalidad, anuncio de Cerdanyola:** 2–4 de octubre de 2026.
https://aecar.org/modalidades.php?tipo=rg

## Decisiones de datos

Una casilla 0 o guion de una prueba previa sin puesto se representa como `null`; la app no supone que se participó. En GT8 esta distinción no genera bonificaciones. Las filas con puestos explícitos 100, 101 o 102 conservan esos puestos y el punto correspondiente.

No se ha obtenido ni validado una parrilla de inscritos de Cerdanyola. `rosterMode: hypothetical` y `originalToday: true` significan participación asumida SOLO para simular, no inscripción constatada. El usuario puede modificarla sin alterar el histórico. Los pilotos añadidos empiezan con `[null, null]` y cero puntos.

No se infiere elegibilidad por la nacionalidad o el nombre. No se resuelven identidades que la fuente marca como no encontradas. Nitro y ECO contienen registros independientes incluso para una misma persona.

## Auditoría de los puntos previos

Las columnas siguientes proceden de la transcripción contrastada. El motor vuelve a calcular los puntos a partir de los puestos. `—` significa sin resultado histórico.

### GT8 Nitro

| Piloto | C1 | C2 | Puntos previos |
|---|---:|---:|---:|
| CRISTIAN DELGADO MENDOZA | 1 | 8 | 1112 |
| RAUL FERNANDEZ GUISADO | 5 | 4 | 1100 |
| RAUL DARAS ANTON | 9 | 1 | 1092 |
| MARC GARCIA CANADELL | 7 | 3 | 1080 |
| FABIO BARBOSA ARAUJO | 11 | 2 | 1027 |
| HENRIQUE ALMEIDA | 2 | 14 | 976 |
| JOAO BARAHONA | 3 | 13 | 966 |
| DAVID GALLEGOS CORRALES | 12 | 7 | 889 |
| JUAN CARLOS TARIN GARCIA | 16 | 5 | 870 |
| DAVID REBOLLO ALBA | 10 | 11 | 847 |
| OSWALDO PENA VELASCO | 20 | 6 | 793 |
| VICENTE JOSE SAEZ LEON | 21 | 9 | 718 |
| EDUARD CHAMERO ESPINOSA | 4 | — | 562 |
| VICENTE JAVIER ERES RAMOS | 8 | — | 472 |
| TONI SANTANA (Piloto no encontrado) | — | 10 | 433 |
| CARLOS ANTONIO EXPOSITO ORTEGA | — | 12 | 396 |
| ISRAEL PEREZ GONZALEZ | 13 | — | 379 |
| JOSE ANTON MORAGA | 14 | — | 363 |
| JOSEBA DEHESA VICEN | 15 | — | 347 |
| SERGIO ORIOLA RANGEL | 17 | — | 318 |
| FRANCISCO MANUEL RODRIGUEZ ARBOL | 18 | — | 304 |
| CARLOS GIMENEZ PEREZ | 22 | — | 254 |
| IKER SABORIT CORBALAN | 24 | — | 232 |
| CERQUEIRA SILVA GONÇALO (Piloto no encontrado) | 102 | 100 | 2 |
| MENDONÇA TOMÁS (Piloto no encontrado) | 100 | — | 1 |
| DIAS MIGUEL (Piloto no encontrado) | 101 | — | 1 |

### GT8 Eléctrico

| Piloto | C1 | C2 | Puntos previos |
|---|---:|---:|---:|
| JOAO BARAHONA | 1 | 2 | 1253 |
| CRISTIAN DELGADO MENDOZA | 2 | 3 | 1200 |
| DANIEL NOCETE ROCA | 5 | 5 | 1076 |
| XISCO REUS | 4 | 9 | 1014 |
| GUSTAVO GINES GOMEZ | 10 | 4 | 995 |
| DAVID MARTIN SANDIN | 8 | 7 | 965 |
| GABRIEL MARTINEZ MARTINEZ | 7 | 8 | 965 |
| SERGIO ALONSO CALVO | 6 | 10 | 948 |
| TONI MENDEZ LUCENO | 11 | 6 | 929 |
| CARLES ECHARRI SANTIAGO | — | 1 | 640 |
| FRANCISCO JOSE FRANCO SACRISTAN | 3 | — | 587 |
| JOAQUIN SIGNES PUERTO | 9 | — | 452 |
| CARLOS ANTONIO EXPOSITO ORTEGA | — | 11 | 414 |
| DIEGO SEGURA (Piloto no encontrado) | 100 | — | 1 |
