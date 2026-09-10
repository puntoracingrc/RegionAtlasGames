# Contrato documental PS1 V2

`data/catalog.json` contiene identidad pública: `id`, `canonicalSeoSlug`, `workId`, `regionFamily`, `marketRegion`, `regionCode`, `regionalStatus`, `languages`, `canonicalSerials`, `resolutionSerials`. Las URLs existentes son estables aunque cambie el mercado.

`data/ps1-edition-evidence.json.gz` contiene procedencia por campo, códigos de origen, aliases explícitos, idiomas de texto/audio/índice, componentes, imágenes y evidencias históricas apartadas. `data/ps1-works.json.gz` enlaza ediciones y contexto común sin propagar créditos específicos. Son documentos JSON comprimidos sin pérdida; los loaders los descomprimen una vez y conservan el resultado en memoria.

Un consumidor puede consultar `/api/catalog/ps1/resolve?serial=...`. Debe:

1. Usar coincidencia literal normalizada; conservar ceros y sufijos. Consultar aliases solo si figuran en `resolutionSerials` y en la evidencia de alias.
2. Mantener todos los candidatos. El mismo código puede compartir región o tirada. `physicalVariantResolved: false` no autoriza una certificación de conjunto ni de autenticidad.
3. Distinguir `serialScope: disc` de `packaging`. Un serial de caja no es automáticamente alias del código interno del disco.
4. Mantener mercado e idiomas separados. Una caja francesa puede acompañar software con español; la documentación del idioma no demuestra el país de distribución del ejemplar fotografiado.
5. Adjuntar observaciones independientes por componente y foto. Un serial de referencia no certifica que aparezca en la foto ni que pertenezca a la caja, disco o manual observado. El loader documental no modifica la percepción.
6. Tratar REVIEW como indeterminado. No utilizar códigos históricos apartados, portadas antiguas o ejemplos de aprendizaje anteriores para resolverlo automáticamente.
7. Para nuevos precios, presentar la misma identidad V2 resuelta: familia, mercado, regionCode y conjunto canónico de seriales. Superar esta igualdad solo permite incorporar el dato al overlay; la observación comercial sigue necesitando sus controles de fuente, estado, región y composición. La migración no certifica anuncios ni activa el worker.
8. No propagar precio, condición, contenido original o créditos de una edición a otras del mismo `workId`.

El scanner real consulta este contrato después de reconocer título/plataforma y antes de razonar sobre región/composición. No se han entrenado pesos de un modelo ni se ha medido precisión contra fotografías nuevas. La evaluación futura necesita ejemplos de caja/disco/manual etiquetados y un conjunto de prueba separado, incluyendo casos mezclados, ilegibles y ambiguos.
