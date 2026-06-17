import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

const VALID_FAMILIES = new Set([
  "content",
  "edition",
  "format",
  "gameplay",
  "market",
  "mechanic",
  "perspective",
  "player_mode",
  "setting",
  "sport",
  "technical",
  "theme",
  "visual",
]);

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return readFileSync(file(relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function requireFile(relativePath) {
  if (!existsSync(file(relativePath))) fail(`Falta ${relativePath}`);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

for (const requiredFile of [
  "data/game-facets-taxonomy.json",
  "docs/game-facets-v1.md",
  "src/lib/game-facets/taxonomy.ts",
  "src/lib/game-facets/types.ts",
  "src/lib/game-facets/normalize.ts",
  "src/lib/game-facets/validate.ts",
  "scripts/validate-game-facets-v1.mjs",
]) {
  requireFile(requiredFile);
}

let packageJson = {};
try {
  packageJson = JSON.parse(read("package.json"));
} catch {
  fail("package.json no se puede leer");
}

const scripts = packageJson.scripts ?? {};
if (scripts["validate:game-facets-v1"] !== "node scripts/validate-game-facets-v1.mjs") {
  fail("Falta script validate:game-facets-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-facets-v1")) {
  fail("validate:all debe incluir validate:game-facets-v1");
}

let taxonomy = null;
try {
  taxonomy = JSON.parse(read("data/game-facets-taxonomy.json"));
} catch {
  fail("data/game-facets-taxonomy.json no es JSON válido");
}

if (taxonomy) {
  if (!Array.isArray(taxonomy.genres)) fail("taxonomy.genres debe ser array");
  if (!Array.isArray(taxonomy.subgenres)) fail("taxonomy.subgenres debe ser array");
  if (!Array.isArray(taxonomy.facets)) fail("taxonomy.facets debe ser array");

  const genres = Array.isArray(taxonomy.genres) ? taxonomy.genres : [];
  const subgenres = Array.isArray(taxonomy.subgenres) ? taxonomy.subgenres : [];
  const facets = Array.isArray(taxonomy.facets) ? taxonomy.facets : [];
  const all = [...genres, ...subgenres, ...facets];
  const genreIds = new Set(genres.map((genre) => genre.id));

  for (const entity of all) {
    if (!entity.id || typeof entity.id !== "string") fail(`Entidad sin id: ${JSON.stringify(entity)}`);
    if (!entity.name || typeof entity.name !== "string") fail(`Entidad sin name: ${JSON.stringify(entity)}`);
    if (!entity.slug || typeof entity.slug !== "string") fail(`Entidad sin slug: ${JSON.stringify(entity)}`);
    if (!entity.description || typeof entity.description !== "string") fail(`Entidad sin description: ${JSON.stringify(entity)}`);
    if (!['approved', 'review', 'hidden'].includes(entity.status)) fail(`Status inválido en ${entity.id}: ${entity.status}`);
    if (entity.aliases && !Array.isArray(entity.aliases)) fail(`aliases debe ser array en ${entity.id}`);
  }

  for (const genre of genres) {
    if (genre.type !== "genre") fail(`Genre con type incorrecto: ${genre.id}`);
  }
  for (const subgenre of subgenres) {
    if (subgenre.type !== "subgenre") fail(`Subgenre con type incorrecto: ${subgenre.id}`);
    if (!VALID_FAMILIES.has(subgenre.family)) fail(`Family inválida en subgenre ${subgenre.id}: ${subgenre.family}`);
    if (!Array.isArray(subgenre.parentGenreIds) || subgenre.parentGenreIds.length === 0) {
      fail(`Subgenre sin parentGenreIds: ${subgenre.id}`);
    } else {
      for (const parentGenreId of subgenre.parentGenreIds) {
        if (!genreIds.has(parentGenreId)) fail(`parentGenreId inexistente en ${subgenre.id}: ${parentGenreId}`);
      }
    }
  }
  for (const facet of facets) {
    if (facet.type !== "facet") fail(`Facet con type incorrecto: ${facet.id}`);
    if (!VALID_FAMILIES.has(facet.family)) fail(`Family inválida en facet ${facet.id}: ${facet.family}`);
  }

  for (const duplicate of duplicateValues(all.map((entity) => entity.id))) fail(`id duplicado: ${duplicate}`);
  for (const duplicate of duplicateValues(genres.map((entity) => entity.slug))) fail(`slug duplicado en genres: ${duplicate}`);
  for (const duplicate of duplicateValues(subgenres.map((entity) => entity.slug))) fail(`slug duplicado en subgenres: ${duplicate}`);
  for (const duplicate of duplicateValues(facets.map((entity) => entity.slug))) fail(`slug duplicado en facets: ${duplicate}`);

  if (genres.length < 10) warn("Taxonomía con pocos genres para V1");
  if (subgenres.length < 10) warn("Taxonomía con pocos subgenres para V1");
  if (facets.length < 10) warn("Taxonomía con pocas facets para V1");
}

for (const forbiddenPath of [
  "data/game-facet-assignments.json",
  "data/game-facet-assignments.local.json",
  "src/app/facet",
  "src/app/faceta",
  "src/app/tag",
  "src/app/tags",
  "src/app/genre",
  "src/app/genres",
]) {
  if (existsSync(file(forbiddenPath))) fail(`No debe existir ${forbiddenPath} en GAME_FACETS_V1`);
}

const moduleSources = [
  "src/lib/game-facets/taxonomy.ts",
  "src/lib/game-facets/types.ts",
  "src/lib/game-facets/normalize.ts",
  "src/lib/game-facets/validate.ts",
].filter((relativePath) => existsSync(file(relativePath))).map((relativePath) => read(relativePath)).join("\n");

if (/OPENAI_API_KEY|openai|anthropic|gemini|perplexity/i.test(moduleSources)) {
  fail("GAME_FACETS_V1 no debe usar IA");
}
if (/fetch\(|axios|got\(|undici|playwright|puppeteer|cheerio|steam/i.test(moduleSources)) {
  fail("GAME_FACETS_V1 no debe usar scraping ni scraping Steam");
}
if (/game-details\.json|writeFileSync\(|appendFileSync\(/i.test(moduleSources)) {
  fail("GAME_FACETS_V1 no debe modificar ni depender de data/game-details.json");
}
if (/vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i.test(moduleSources)) {
  fail("GAME_FACETS_V1 no debe tocar Vercel");
}
if (/rakuten|ebay/i.test(moduleSources)) {
  fail("GAME_FACETS_V1 no debe tocar eBay/Rakuten");
}

const doc = existsSync(file("docs/game-facets-v1.md")) ? read("docs/game-facets-v1.md") : "";
for (const phrase of [
  "Implemented, not public",
  "No assignments todavía",
  "No landings todavía",
  "GAME_FACET_ASSIGNMENT_RULES_V1",
  "No modificar masivamente juegos",
]) {
  if (!doc.includes(phrase)) fail(`docs/game-facets-v1.md debe incluir: ${phrase}`);
}

if (failures.length) {
  console.error("GAME_FACETS_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (warnings.length) {
  console.warn("GAME_FACETS_V1 warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

const counts = taxonomy
  ? `${taxonomy.genres.length} genres, ${taxonomy.subgenres.length} subgenres, ${taxonomy.facets.length} facets`
  : "sin conteos";
console.log(`GAME_FACETS_V1 válido: taxonomía real OK (${counts}).`);
