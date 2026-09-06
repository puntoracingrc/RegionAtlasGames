# AWARDS-V1.0.1

Base: 0b4d23b (main vigente; incluye actualización de precios ajena al lote).

## Alcance

- Calendario derivado con fecha inyectada. Día público: Europe/Madrid.
- `connection()` de Next 16.3.3 antes del reloj en índice y edición. Sin cache de resultados temporales ni deploy requerido para caducar.
- Admin protegido por el layout existente: avisos persistentes hoy/pendientes, orden por antigüedad, acceso en navegación y contador en el dashboard. Copiar instrucción no envía solicitudes externas.
- Cinco futuras ediciones añadidas a las dos existentes; cero resultados nuevos.
- Premios entre Descripción y Detalles, usando Panel/PanelTitle.
- Imágenes de receptores solo desde catálogo/obra, personas públicas y compañías canónicas existentes.
- Retratos del listado con contain, sin modificar fotografías ni licencias.
- No se cambian el modelo de atribución, catálogo, colección, marketplace, identidades de obra ni datos de personas/compañías.

## Fechas verificadas el 2026-09-06

| Edición | Fecha | Fuente oficial |
| --- | --- | --- |
| Japan Game Awards 2026 | 2026-09-15 | https://awards.cesa.or.jp/overview/ |
| Golden Joystick 2026 | 2026-11-11 | https://www.futureevents.uk/goldenjoystickawards2026/home |
| The Game Awards 2026 | 2026-12-10 | https://thegameawards.com/news/tga-returns-december-10-2026 |
| D.I.C.E. 2027 | 2027-02-18 | https://www.interactive.org/awards/30th_annual_dice_awards_submissions_now_open.asp |
| GDCA 2027 | 2027-03-02 | https://gamechoiceawards.com/ceremony/ |
| IGF 2027 | 2027-03-03 | https://igf.com/igf-competition-rules/ |
| BAFTA Games 2027 | 2027-04-14 | https://www.bafta.org/media-centre/press-releases/2027-bafta-games-awards-entries-open/ |

CESA distingue Annual/METI (15 septiembre, 18:00) de Future Division (20 septiembre); esta edición usa Annual/METI. No se inventan resultados. Las fuentes persisten en research/public con sus aprobaciones.

## Identidad visual

Metadata y decisión de uso en `data/award-visual-identities.json`.
TGA: logo sin año del media kit oficial. CESA: descarga oficial 2026. AIAS: assets oficiales de la edición 29 (2026), conservando forma y espacio. Los logos anuales nunca se asignan a otra edición; en el índice se identifican por su año en el alt.

BAFTA permanece bloqueado por requerir aprobación expresa. GDCA, Golden Joystick e IGF mantienen fallback tipográfico por falta de permiso verificable para RegionAtlas. No se ha enviado ninguna solicitud de permiso.

Los logos se guardan localmente, sin hotlink, recorte ni recoloreado. No hay compañías receptoras directas en los datos actuales; el soporte visual se verifica con el contrato, sin inventar premiados.

## Verificación local inicial

- 41 pruebas awards (25 previas + 16 nuevas), sin fallos.
- Unit y prechecks de personas, compañías y colección: correctos.
- Lint: 0 errores, 35 advertencias preexistentes.
- Build: correcto; `/premios` y `/admin/premios` son rutas dinámicas.
- Corte de catálogo: 73.104 fichas e IDs únicos, 4.481 compañías. Son cifras del informe, no restricciones permanentes.
- Preview y Production: pendientes de cierre; no declarar publicado hasta completar ambos controles.

## QA local

- 50 combinaciones ruta/viewport correctas (25 rutas en escritorio y móvil), más seis rutas negativas con 404 esperado.
- Sin errores de consola, imágenes rotas ni overflow; canonicals y unicidad de los bloques de premios correctos.
- Revisados visualmente el listado de personas y el encuadre completo de los retratos, sin cambiar las fotografías originales.
- Evidencia local: `artifacts/awards-v101-local/report.json` y capturas en el directorio de trabajo compartido.
- La comprobación autenticada de Admin sigue pendiente; no se sustituye por el control de rutas públicas.
