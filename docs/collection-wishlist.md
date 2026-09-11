# Colección, deseados y compartir

Las fichas de todas las plataformas muestran «Añadir a mi colección» y «Añadir a deseados» justo debajo de la portada. Debajo aparecen «Vender uno como este» y «Compartir». Se conservan las URLs del catálogo y la gestión de copias individuales.

`/coleccion/deseados` es una pestaña privada de Mi colección. Cada entrada identifica una edición mediante su `catalogId`, conserva su fecha y se guarda en el mismo documento privado de colección que el inventario. No depende del almacenamiento del navegador. Añadir repetidamente el mismo deseo es idempotente; los usuarios solo pueden leer y modificar su documento a través de la sesión autenticada.

La reconciliación de deseados se ejecuta dentro de `mutateUserCollection`, que ya utiliza control de versiones de Blob y una cola para el disco local. Al adquirir una edición se elimina de los deseados y se guarda un aviso de logro en la misma escritura. Esto también cubre altas de copias, importaciones y enlaces automáticos al catálogo. Las importaciones conservan los deseados no adquiridos y los metadatos del documento. Cada región o edición del juego mantiene una identidad independiente.

El aviso aparece al confirmar el cambio o en la siguiente visita/foco de la cuenta, y conserva el botón de venta. Cerrar el aviso confirma únicamente sus identificadores; no modifica juegos ni deseos. Las mutaciones de colección notifican a la navegación para releer el estado del servidor. El estado se refresca al navegar, volver a la pestaña, cambiar la colección y cada 60 segundos mientras la web está visible.

El botón de venta prepara un borrador usando el flujo existente. Si hay varias copias se accede a su gestión para elegir una. Si todavía no hay ninguna, el usuario debe confirmar «Guardar copia y preparar anuncio»; el borrador conserva el paso de indicar fotos, estado y precio antes de publicarlo.

Compartir abre un diálogo accesible, con cierre por Escape, enlace canónico de la ficha, copia al portapapeles y destinos WhatsApp, Facebook, X, Telegram, Reddit y correo. Cuando el navegador lo permite ofrece la hoja de compartir del dispositivo. Los enlaces sociales abren su compositor; no envían mensajes automáticamente. No se añade un acortador ni seguimiento a las URLs compartidas.

Los avisos de venta son discretos: un punto en el acceso superior a Deseados y un contador de novedades en su pestaña. Solo cuentan anuncios internos activos, publicados desde que se guardó el deseo, de otros usuarios y de la misma edición. Los anuncios que ya existían se muestran disponibles sin generar una novedad. Borradores, anuncios retirados o vendidos, anuncios propios y ofertas externas quedan fuera del aviso.

Al entrar en Deseados, cada juego afectado muestra «Nuevo en venta». Se marca visto cuando al menos la mitad de su tarjeta permanece visible durante 1,8 segundos con la pestaña activa. No se marca leído durante renderizado del servidor ni precarga. Se confirman los identificadores exactos de las publicaciones vistas; un anuncio posterior sigue sin leer, incluso si llegó mientras se guardaba la confirmación. Los anuncios siguen accesibles desde el enlace a `#ofertas` de la ficha cuando desaparece el aviso. No se envían correos, mensajes ni notificaciones del sistema.

Las marcas de lectura viven en el documento privado del usuario y se guardan con el mismo control de concurrencia. Se consulta una vez el mercado por lectura, no una consulta por deseado, y no hay escrituras masivas sobre cuentas al publicar. Si un aviso de logro conserva una copia eliminada se vincula a otra copia del mismo juego; desaparece si ya no queda ninguna.

Validación automatizada: `npm run test:collection`, incluidos persistencia, aislamiento de cuentas, deseos repetidos, adquisición concurrente, importaciones, enlace automático, lectura corrupta y ediciones regionales. `wishlist-sales.test.ts` comprueba publicaciones reales contra el almacén local, avisos independientes por usuario, anuncios posteriores, lectura y retirada. Los contratos de escritura condicional existentes se cubren mediante `src/lib/json-document-store.test.ts`.

Referencia del almacenamiento existente: https://vercel.com/docs/vercel-blob/using-blob-sdk (lecturas privadas y escrituras condicionales).
