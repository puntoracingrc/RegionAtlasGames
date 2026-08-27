# Operación de producción de Region Atlas

Documento vigente de arquitectura, seguridad y operación. Describe el estado que debe conservarse; no es un historial de cambios.

## Arquitectura

- Next.js App Router sobre Vercel.
- Catálogo público versionado en Git y generado durante el build.
- Cuentas, colecciones, mercado, mensajes, cuotas y staging en Vercel Blob privado.
- Worker externo para recolección de precios. La web no debe ejecutar Python en Vercel.
- Los recolectores manuales y de rueda permanecen pausados hasta una activación explícita desde admin.

## Controles activos

- Sesiones cifradas con `SESSION_SECRET`; producción rechaza una configuración ausente o débil.
- Autorización de admin en página y API mediante `ADMIN_EMAILS`.
- Mutaciones protegidas por comprobación `Origin`/`Host` de mismo origen.
- CSP en bloqueo, HSTS, `frame-ancestors 'none'`, `nosniff`, política de referencia y permisos restringidos.
- Límites de tamaño para JSON, hojas de cálculo, fotos y cargas remotas.
- Importación remota protegida frente a SSRF, IP privadas y redirecciones inseguras.
- Rate limiting compartido en Vercel Blob para autenticación; memoria local solo en desarrollo.
- Enlaces mágicos de un solo uso almacenados por hash y con caducidad.
- Operaciones compartidas de cuentas, colecciones, mercado, mensajes, ventas y cuota IA con control de concurrencia.
- Webhooks, secretos y credenciales solo en servidor; ninguna variable secreta usa el prefijo `NEXT_PUBLIC_`.
- Activación Pro de demostración deshabilitada por defecto.

## Persistencia

En Vercel, una escritura persistente debe usar Blob. La aplicación rechaza la operación si falta Blob en vez de aceptar `/tmp` como si fuera duradero. Los documentos corruptos o ilegibles producen un error visible y nunca se convierten silenciosamente en documentos vacíos.

En local se usa `APP_DATA_DIR` o `data/`, con escrituras atómicas y permisos privados para los documentos de cuenta. Los ficheros de QA deben vivir fuera del repositorio y eliminarse al terminar.

### Investigación de mercado

- Las evidencias eBay se guardan en Blob privado, fragmentadas por ficha regional.
- Un anuncio de otra región se enruta a la variante existente; no se rechaza por ser USA, Japón, España u otra edición válida.
- Solo tres anuncios EUR recientes, distintos y no atípicos permiten publicar una mediana verificada.
- Los lotes viven en `region-atlas/market-research/batches.json` y procesan una ficha por petición para poder pausarse y reanudarse.
- Las fotos de anuncios eBay son temporales. Solo una imagen marcada para revisión puede copiarse al CDN mediante una acción expresa del administrador.
- `EBAY_CATALOG_API_ENABLED` permanece en `false` mientras la cuenta no tenga permiso para Catalog API; Browse API permite iniciar la recopilación.

## Cron de staging

`/api/cron/enrich-catalog-staging` tiene un máximo de 60 segundos y trabaja con un presupuesto interno de 45 segundos.

- Procesa por defecto hasta 4 fichas.
- Busca candidatos mediante una ventana reanudable de hasta 96 identificadores.
- Lee en lotes pequeños y conserva un cursor en el índice.
- Cada petición externa respeta el tiempo restante.
- Actualiza contadores de forma incremental; no relee miles de fichas.
- Registra duración, fichas revisadas, intentos, éxitos, fallos y si agotó el presupuesto.

El cron no activa ni ejecuta recolectores de precios.

## Admin de sistema

`/admin/sistema` concentra las señales operativas principales:

- backend de almacenamiento;
- tamaño y pendientes de staging;
- última ejecución del cron;
- fuentes manuales y automáticas activas;
- entorno y commit desplegado;
- prueba temporal de escritura, lectura y borrado en Blob;
- diagnóstico copiable sin tokens ni credenciales.

Si una señal aparece en rojo, copiar el diagnóstico completo y analizarlo antes de lanzar tareas o cambiar variables.

## Despliegue seguro

1. Crear rama desde `origin/main` en un worktree aislado.
2. Ejecutar `npm ci`, lint, typecheck, tests y build.
3. Confirmar que el build no emite avisos de trazado masivo de archivos.
4. Hacer commit y push de la rama.
5. Abrir PR y esperar todos los checks; no forzar merge.
6. Fusionar a `main` solo con autorización.
7. Esperar el despliegue de producción y verificar `https://www.regionatlas.games`.
8. Verificar `/admin/sistema`, APIs admin sin sesión en `401` y estado previsto de recolectores.

No publicar directamente desde un checkout sucio ni activar recolectores como parte de un despliegue ordinario.

## Capacidad y siguiente migración

Blob es adecuado para la beta sin usuarios reales y para tráfico inicial. Antes de abrir un mercado activo o cuando aumenten las escrituras concurrentes, migrar cuentas, colecciones, anuncios, conversaciones, ventas y staging a Postgres con transacciones e índices.

Señales para adelantar esa migración:

- conflictos frecuentes de concurrencia;
- documentos globales que crecen hasta varios megabytes;
- latencia sostenida en operaciones privadas;
- necesidad de consultas, moderación o informes cruzados;
- más de una instancia de worker escribiendo el mismo conjunto de datos.

El rate limiting basado en Blob también debe pasar a Redis/KV o a un servicio equivalente cuando el volumen público haga ineficiente una escritura por control.

## Recuperación

- Git es la fuente de verdad del catálogo y del código.
- Blob es la fuente de verdad de datos privados en producción.
- Conservar copias de seguridad y retención del proveedor antes de admitir usuarios reales.
- Una restauración debe probarse primero con una copia o entorno aislado.
- Nunca sobrescribir documentos reales para validar una reparación.
