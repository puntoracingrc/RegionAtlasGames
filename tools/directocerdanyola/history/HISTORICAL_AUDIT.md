# Auditoría del historial nacional Rally Game / GT8

Fecha de revisión: 22 de septiembre de 2026.

## Resultado

El historial pegado coincide con la tabla pública de la modalidad GT de AECAR y contiene **43 campeonatos/modalidades** entre 1999 y 2025. Al reagrupar únicamente los campeones de esas 43 filas se reproducen exactamente los **24 pilotos y sus cantidades de títulos** publicados por AECAR: Toni Santana suma 12; Marc Ibars, 4; Sergio García, 3; Daniel Otero, Goyo Vidal y Raúl Darás, 2; los otros 18 pilotos, 1.

Las dos Copas de España de 2022 se guardan aparte y no incrementan el palmarés del Campeonato de España.

## Cobertura documental

- **40 podios** coinciden con una clasificación final local u oficial enlazada por AECAR.
- **1 podio (1999)** solo está respaldado por el historial público de AECAR. No hay clasificación final de 1999 enlazada y el PDF de 2000 se titula “1er Campeonato de España”.
- **1 podio (2013)** coincide con el archivo disponible, pero el propio nombre del PDF indica “tras Narón”; por tanto, es apoyo parcial y no una clasificación final inequívoca.
- **1 podio (Super GT 2018)** contiene un conflicto de identidad: el historial dice “Mario Guerra” y la clasificación final muestra “GARCIA MARIO”. Se mantiene `UNRESOLVED`.

## Normalización de nombres

Las faltas ortográficas del historial se conservan en la fuente original, pero el JSON usa nombres canónicos para poder cruzarlos con MyRCM. Entre ellas están “Sergio Gacía”, “J. Maunel Gonzalez” y “Joel Alejando Farina”. La normalización no fusiona personas cuando la identidad no es segura.

## Uso seguro en retransmisión

- Un título puede anunciarse cuando el piloto coincide de forma inequívoca con el nombre canónico.
- Los podios de 1999 y 2013 deben presentarse como “según el historial de AECAR”.
- No debe atribuirse el tercer puesto de Super GT 2018 a una persona concreta hasta resolver la diferencia entre “Mario Guerra” y “GARCIA MARIO”.
- Copa de España, campeonatos regionales e interregionales deben mantenerse separados del Campeonato de España.

## Archivos

- `aecar-gt8-history.json`: datos estructurados, palmarés recalculado, evidencias y conflictos.
- `sources/aecar-historial-campeonatos-1999-2025.txt`: texto aportado, conservado sin corregir.
