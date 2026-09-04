# Investigación de compañías: publicación controlada 2026-09-03

## Alcance

La importación crea una capa aditiva de investigación sobre las 4.326 compañías del índice.
No reemplaza perfiles, grupos, separaciones, slugs, relaciones canónicas ni créditos de juegos.

- 1.400 núcleos aceptados quedan disponibles solo en Admin.
- 2.926 perfiles quedan bloqueados.
- 259 grupos de QID compartido, con 576 slugs, conservan todas sus identidades.
- 12 personas tratadas como compañías y 383 créditos compuestos permanecen bloqueados.
- No se publica ni importa ninguna relación corporativa.

## Publicación autorizada

Historias con fuente corporativa primaria:

- `nintendo`
- `sega`
- `capcom`
- `konami`

Hitos con fuente corporativa primaria:

- Capcom: Street Fighter II y la lucha competitiva (1991).
- Capcom: consolidación del survival horror (1996).
- Konami: e-amusement (2002).
- Nintendo: producción masiva de cartas plásticas (1953).
- Nintendo: ecosistema de consolas y sagas propias.
- Sega: fabricante de consolas entre 1983 y 2001.
- Sega: arcades con nuevas formas de interacción (1985-1993).

Correcciones de identidad verificadas:

- `adk`: `Q18247429` -> `Q2634015`.
- `capcom`: `Q144680` -> `Q14428`.
- `sims`: `Q16883354` -> `Q4048789`.

## Relaciones descartadas

- `shaba-games`: se retira la propuesta que atribuía la adquisición de 2002 a una entidad
  creada posteriormente. No se importa una relación sustituta.
- `artoon`: se retira la fecha de adquisición propuesta porque contradice la cronología
  corporativa oficial. No se importa una relación sustituta.

Las decisiones y sus fuentes oficiales se muestran en
`/admin/entidades/investigacion`.

## Frontera técnica

- `data/research/company-study/public.json` es la única entrada del cargador público.
- El núcleo, procedencia, fuentes completas, revisión y decisiones se importan desde un módulo
  marcado con `server-only` y consumido únicamente por la ruta protegida de Admin.
- La ruta de Admin declara `noindex, nofollow` y hereda la autenticación administrativa.
- El generador `scripts/import_company_research.py` valida cifras, procedencia, fuentes,
  colisiones y hashes antes de escribir.
- `--check` vuelve a generar en memoria y exige igualdad byte a byte, por lo que la importación
  es repetible.
- La reversión consiste en retirar la capa de investigación y sus dos cargadores; ningún archivo
  canónico requiere reconstrucción.

## Archivos canónicos protegidos

El manifiesto conserva el SHA-256 de:

- `data/company-profiles.json`
- `data/company-groups.json`
- `data/company-separations.json`
- `data/index/companies.json`
- `data/index/company-entities.json`
- `data/game-details.json`

Las pruebas comparan esos hashes para demostrar que no cambia ningún perfil canónico, slug,
fusión ni crédito histórico de juego.

## Verificación

Comandos ejecutados antes de preparar el PR:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
python3 scripts/import_company_research.py \
  --audit-dir <auditoria> \
  --package-dir <paquete-extraido> \
  --repo . \
  --check
```

También se comprobó en navegador la presentación pública en escritorio y móvil, la ausencia de
errores de consola, la redirección anónima de la ruta de Admin y que la API pública y el sitemap
no exponen campos internos.

## Siguiente fase

Los tipos de procedencia admiten entidades `company` y `person`, además de relaciones tipadas,
para poder conectar después `people`, `person_company_relations`, `person_works` y
`person_sources`. Este cambio no importa perfiles personales ni mezcla el paquete de personas.
