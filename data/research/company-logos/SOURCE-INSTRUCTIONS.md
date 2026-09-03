# Instrucciones para Codex

1. Lee `data/company-logo-manifest.csv`; no emparejes por nombre difuso.
2. Actualiza cada compañía exclusivamente por su `slug` exacto.
3. Usa `logo_file` como ruta relativa dentro del paquete.
4. No fusiones, renombres ni elimines compañías durante esta importación.
5. No sustituyas una filial por la matriz ni una empresa histórica por su sucesora.
6. Conserva `logo_type`, `source_page_url`, `source_license` y `selected_qid` en metadatos si el esquema lo permite.
7. Para `PLACEHOLDER_GENERADO`, muestra la imagen pero márcala como provisional internamente; podrá sustituirse después.
8. Si RegionAtlas ya tiene un logo y el manifiesto indica `replaceExistingOnlyIfBetter`, no lo sobrescribas con un placeholder.
9. Separa primero los registros con `COMPOSITE_CREDIT` antes de asignar logotipos individuales.
10. Ejecuta una importación de prueba y comprueba: **4326 filas**, un archivo existente por fila y cero asignaciones por similitud de nombre.

`data/company-history-routes.json` puede usarse después para enriquecer la historia de las compañías, pero las rutas de `candidateRoutesForManualReview` no son identidades confirmadas.
