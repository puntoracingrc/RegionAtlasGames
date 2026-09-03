# Logotipos de compañías de RegionAtlas

Paquete generado el 2026-09-03 para el catálogo público de [RegionAtlas](https://www.regionatlas.games/compania).

## Resumen

- Compañías del catálogo: **4326**
- Logotipos auténticos documentados: **522**
- Imágenes provisionales claramente marcadas: **3804**
- Registros que requieren revisión futura: **3953**
- Descargas rechazadas o fallidas: **0**

Cada `slug` tiene exactamente un archivo en `company-logos/`. Los archivos `PLACEHOLDER_GENERADO` no son logotipos oficiales ni deben presentarse como tales. Existen para que ninguna ficha quede sin imagen mientras se completa la investigación.

## Archivos principales

- `data/company-logo-manifest.csv`: fuente de verdad completa, con archivo, entidad, licencia, confianza y rutas.
- `data/company-logo-import.json`: asignación mínima `slug → logoPath` para Codex.
- `data/company-history-routes.json`: webs oficiales, Wikidata, Wikipedia, Commons y relaciones reutilizables para redactar historias.
- `control-logotipos-regionatlas.xlsx`: libro de control con el catálogo completo, la cola de revisión, las fuentes y el resumen de resultados.
- `data/validation-report.json` y `CHECKSUMS.sha256`: validación integral y huellas de todos los archivos entregados.
- `data/company-entity-resolutions.csv`: auditoría del emparejamiento entre `slug` y entidad.
- `data/manual-entity-overrides.csv`: decisiones manuales especialmente delicadas y su justificación.
- `data/companies-without-authentic-logo.csv`: cola de investigación futura.
- `data/companies-to-review.csv`: ambigüedades, créditos compuestos y marcadores provisionales.
- `data/duplicate-authentic-image-hashes.csv`: mismo archivo asignado a más de un registro para revisión.
- `docs/INSTRUCCIONES-PARA-CODEX.md`: reglas de importación segura.

## Criterio

Una matriz, una filial, una marca, una división, una predecesora y una sucesora no se han tratado automáticamente como la misma entidad. El emparejamiento automático exige un nombre corporativo exacto o una variante legal inequívoca. Los alias que pueden representar cambios de nombre o sucesión quedan para revisión salvo excepciones comprobadas.

## Licencias y marcas

La licencia y el crédito de cada archivo de Wikimedia Commons están en el manifiesto y en `data/licenses.csv`. Aunque muchos logotipos simples figuren como dominio público por derechos de autor, pueden seguir protegidos como marcas. RegionAtlas debe usarlos únicamente con finalidad identificativa y respetar la normativa aplicable.
