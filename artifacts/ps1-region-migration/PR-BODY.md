PS1 utilizaba tres etiquetas regionales que mezclaban el mercado de distribución con el idioma. Esta migración audita las 6.184 fichas existentes, conserva sus IDs y URLs, recoloca 1.218 y añade 4.292 publicaciones documentadas de PAL, USA y Japón. Las 2.353 fichas todavía ambiguas quedan en REVIEW con evidencia y explicación individual.

Las fichas y el resolvedor separan familia, mercado, idiomas de textos/voces y códigos de disco o caja; agrupan 668 ediciones multidisco y enlazan el contexto de la obra sin copiar créditos específicos. Se reutilizan 3.816 asignaciones de portada y se muestran portadas/contraportadas con procedencia. El loader real del escáner consulta estos datos después de la percepción, sin convertir referencias documentales en observaciones ni certificar conjuntos físicos.

Se apartan precios, enlaces comerciales y códigos antiguos cuando cambia la identidad regional. El overlay exige coincidencia con la identidad V2. No se modifica ni activa el worker de la otra task. El límite de 262.144 archivos del SFTP impide nuevas escrituras allí; las cuatro imágenes añadidas se sirven desde la propia web.

Validación: 22 controles de integridad PS1, 6 pruebas del adaptador y loader real, pruebas generales y del escáner, lint, TypeScript, build y 15 comprobaciones HTTP. Reconstrucción reproducible de 24 archivos; 8.779 URLs de galerías verificadas sin fallos; navegador en escritorio y móvil. No se realizaron llamadas pagadas al modelo ni se midió precisión visual. El estado de CI y Preview corresponde a los checks de este PR.

Informe y CSV: `artifacts/ps1-region-migration/INFORME-COMPLETO.md`, `PS1-REGION-MAP.csv` y `PSX-LISTS-COMPARISON.csv`. El contrato para futuros consumidores está en `ENGINE-CONTRACT.md`. Datos de catálogo/detalles de otras plataformas preservados; los manifests de investigación solo actualizan los hashes de las proyecciones PS1 autorizadas.

Los posibles duplicados históricos y entradas insuficientes se conservan para revisión, con snapshot y trazabilidad. No se afirma una asociación de fábrica para caja, disco y manual. Este PR prepara la integración; producción sigue pendiente de fusión y despliegue.
