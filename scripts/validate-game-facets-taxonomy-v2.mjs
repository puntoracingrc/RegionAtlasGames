import { execSync } from "node:child_process";
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
const VALID_PRIORITIES = new Set(["A", "B", "C", "D"]);

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

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
  "docs/game-facets-taxonomy-v2.md",
  "src/lib/game-facets/types.ts",
  "src/lib/game-facets/validate.ts",
  "scripts/validate-game-facets-taxonomy-v2.mjs",
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
if (scripts["validate:game-facets-taxonomy-v2"] !== "node scripts/validate-game-facets-taxonomy-v2.mjs") {
  fail("Falta script validate:game-facets-taxonomy-v2");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-facets-taxonomy-v2")) {
  fail("validate:all debe incluir validate:game-facets-taxonomy-v2");
}

let taxonomy = null;
try {
  taxonomy = JSON.parse(read("data/game-facets-taxonomy.json"));
} catch {
  fail("data/game-facets-taxonomy.json no es JSON válido");
}

if (taxonomy) {
  const genres = Array.isArray(taxonomy.genres) ? taxonomy.genres : [];
  const subgenres = Array.isArray(taxonomy.subgenres) ? taxonomy.subgenres : [];
  const facets = Array.isArray(taxonomy.facets) ? taxonomy.facets : [];
  const all = [...genres, ...subgenres, ...facets];
  const genreIds = new Set(genres.map((genre) => genre.id));

  if (genres.length < 18) fail(`FACETS V2 esperaba al menos 18 genres, hay ${genres.length}`);
  if (subgenres.length < 80) fail(`FACETS V2 esperaba al menos 80 subgenres, hay ${subgenres.length}`);
  if (facets.length < 250) fail(`FACETS V2 esperaba al menos 250 facets, hay ${facets.length}`);

  for (const entity of all) {
    if (!entity.id || typeof entity.id !== "string") fail(`Entidad sin id: ${JSON.stringify(entity)}`);
    if (!entity.name || typeof entity.name !== "string") fail(`Entidad sin name: ${entity.id}`);
    if (!entity.slug || typeof entity.slug !== "string") fail(`Entidad sin slug: ${entity.id}`);
    if (!entity.canonicalSlug || typeof entity.canonicalSlug !== "string") fail(`Entidad sin canonicalSlug: ${entity.id}`);
    if (!entity.description || typeof entity.description !== "string") fail(`Entidad sin description: ${entity.id}`);
    if (!VALID_PRIORITIES.has(entity.priority)) fail(`Priority inválida en ${entity.id}: ${entity.priority}`);
    if (typeof entity.publicEligible !== "boolean") fail(`publicEligible debe ser boolean en ${entity.id}`);
    if (typeof entity.seoEligible !== "boolean") fail(`seoEligible debe ser boolean en ${entity.id}`);
    if (entity.aliases && !Array.isArray(entity.aliases)) fail(`aliases debe ser array en ${entity.id}`);
    if ((entity.type === "subgenre" || entity.type === "facet") && !VALID_FAMILIES.has(entity.family)) {
      fail(`Family inválida en ${entity.id}: ${entity.family}`);
    }
  }

  for (const subgenre of subgenres) {
    if (!Array.isArray(subgenre.parentGenreIds) || subgenre.parentGenreIds.length === 0) fail(`Subgenre sin parentGenreIds: ${subgenre.id}`);
    for (const parentGenreId of subgenre.parentGenreIds ?? []) {
      if (!genreIds.has(parentGenreId)) fail(`parentGenreId inexistente en ${subgenre.id}: ${parentGenreId}`);
    }
  }

  for (const duplicate of duplicateValues(all.map((entity) => entity.id))) fail(`id duplicado: ${duplicate}`);
  for (const duplicate of duplicateValues(genres.map((entity) => entity.slug))) fail(`slug duplicado en genres: ${duplicate}`);
  for (const duplicate of duplicateValues(subgenres.map((entity) => entity.slug))) fail(`slug duplicado en subgenres: ${duplicate}`);
  for (const duplicate of duplicateValues(facets.map((entity) => entity.slug))) fail(`slug duplicado en facets: ${duplicate}`);

  const requiredIds = [
    "educational",
    "action-adventure",
    "soulslike",
    "hack-and-slash",
    "point-and-click",
    "turn-based-rpg",
    "tactical-shooter",
    "bullet-hell",
    "arcade-racing",
    "psychological-horror",
    "tower-defense",
    "city-builder",
    "skateboarding",
    "cars",
    "open-world",
    "cozy",
    "pixel-art",
    "vr",
    "light-gun",
  ];
  const ids = new Set(all.map((entity) => entity.id));
  for (const id of requiredIds) {
    if (!ids.has(id)) fail(`Falta entidad V2 esperada: ${id}`);
  }

  const aliasOwner = new Map();
  for (const entity of all) {
    const terms = [entity.name, entity.nameEn, entity.slug, entity.canonicalSlug, ...(entity.aliases ?? [])]
      .filter(Boolean)
      .map(normalize)
      .filter(Boolean);
    for (const term of terms) {
      const owner = aliasOwner.get(term);
      if (owner && owner !== entity.id) warn(`Alias compartido: "${term}" en ${owner} y ${entity.id}`);
      else aliasOwner.set(term, entity.id);
    }
  }

  const aliasExpectations = new Map([
    ["juegos de miedo", "horror"],
    ["horror", "horror"],
    ["football", "football"],
    ["soccer", "football"],
    ["juegos de golf", "golf"],
    ["psychological horror", "psychological-horror"],
    ["open world", "open-world"],
    ["co op", "coop"],
    ["full motion video", "fmv"],
    ["cars", "cars"],
  ]);
  for (const [term, expectedOwner] of aliasExpectations) {
    const owner = aliasOwner.get(normalize(term));
    if (owner !== expectedOwner) warn(`Alias "${term}" apunta a ${owner ?? "nadie"}, esperado ${expectedOwner}`);
  }
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
  if (existsSync(file(forbiddenPath))) fail(`No debe existir ${forbiddenPath} en FACETS_TAXONOMY_V2`);
}

try {
  const changedGameDetails = execSync("git diff --name-only -- data/game-details.json", { cwd: root, encoding: "utf8" }).trim();
  if (changedGameDetails) fail("FACETS_TAXONOMY_V2 no debe modificar data/game-details.json");
} catch {
  warn("No se pudo comprobar git diff de data/game-details.json");
}

const moduleSources = [
  "src/lib/game-facets/taxonomy.ts",
  "src/lib/game-facets/types.ts",
  "src/lib/game-facets/normalize.ts",
  "src/lib/game-facets/validate.ts",
].filter((relativePath) => existsSync(file(relativePath))).map((relativePath) => read(relativePath)).join("\n");

if (/OPENAI_API_KEY|openai|anthropic|gemini|perplexity/i.test(moduleSources)) fail("FACETS_TAXONOMY_V2 no debe usar IA");
if (/fetch\(|axios|got\(|undici|playwright|puppeteer|cheerio|steam/i.test(moduleSources)) fail("FACETS_TAXONOMY_V2 no debe usar scraping ni Steam runtime");
if (/writeFileSync\(|appendFileSync\(/i.test(moduleSources)) fail("FACETS_TAXONOMY_V2 no debe escribir datos desde runtime");
if (/vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i.test(moduleSources)) fail("FACETS_TAXONOMY_V2 no debe tocar Vercel");
if (/rakuten|ebay/i.test(moduleSources)) fail("FACETS_TAXONOMY_V2 no debe tocar eBay/Rakuten");

const doc = existsSync(file("docs/game-facets-taxonomy-v2.md")) ? read("docs/game-facets-taxonomy-v2.md") : "";
for (const phrase of [
  "Implemented, not public",
  "No assignments todavía",
  "No landings todavía",
  "No volvemos al enfoque de reglas por título",
  "FACET_EXTERNAL_SIGNAL_MAPPING_V1",
]) {
  if (!doc.includes(phrase)) fail(`docs/game-facets-taxonomy-v2.md debe incluir: ${phrase}`);
}

if (failures.length) {
  console.error("FACETS_TAXONOMY_V2 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (warnings.length) {
  console.warn("FACETS_TAXONOMY_V2 warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

const counts = taxonomy
  ? `${taxonomy.genres.length} genres, ${taxonomy.subgenres.length} subgenres, ${taxonomy.facets.length} facets`
  : "sin conteos";
console.log(`FACETS_TAXONOMY_V2 válido: ${counts}, sin asignaciones públicas.`);
