import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];
const VALID_SOURCES = new Set(["steam", "vandal", "official", "wikipedia", "wikidata", "pricecharting", "manual", "unknown"]);
const VALID_STATUSES = new Set(["approved", "review", "blocked"]);
const VALID_TYPES = new Set(["genre", "subgenre", "facet"]);

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

for (const requiredFile of [
  "data/facet-external-signal-mapping.json",
  "data/facet-external-signal-mapping.example.json",
  "data/game-facets-taxonomy.json",
  "src/lib/game-facets/external-signal-mapping.ts",
  "scripts/test-facet-external-signal-mapping-v1.mjs",
  "scripts/validate-facet-external-signal-mapping-v1.mjs",
  "docs/facet-external-signal-mapping-v1.md",
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
if (scripts["validate:facet-external-signal-mapping-v1"] !== "node scripts/validate-facet-external-signal-mapping-v1.mjs") {
  fail("Falta script validate:facet-external-signal-mapping-v1");
}
if (scripts["test:facet-external-signal-mapping-v1"] !== "node scripts/test-facet-external-signal-mapping-v1.mjs") {
  fail("Falta script test:facet-external-signal-mapping-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:facet-external-signal-mapping-v1")) {
  fail("validate:all debe incluir validate:facet-external-signal-mapping-v1");
}

let taxonomy = null;
try {
  taxonomy = JSON.parse(read("data/game-facets-taxonomy.json"));
} catch {
  fail("data/game-facets-taxonomy.json no es JSON válido");
}

let mapping = null;
try {
  mapping = JSON.parse(read("data/facet-external-signal-mapping.json"));
} catch {
  fail("data/facet-external-signal-mapping.json no es JSON válido");
}

if (taxonomy && mapping) {
  if (!Array.isArray(mapping)) fail("facet-external-signal-mapping debe ser array");
  const entities = [...(taxonomy.genres ?? []), ...(taxonomy.subgenres ?? []), ...(taxonomy.facets ?? [])];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const seenKeys = new Set();
  let approved = 0;
  let review = 0;

  for (const [index, entry] of mapping.entries()) {
    const label = `mapping[${index}]`;
    if (!VALID_SOURCES.has(entry.source)) fail(`${label} source inválido: ${entry.source}`);
    if (!entry.signal || typeof entry.signal !== "string") fail(`${label} signal debe ser string no vacío`);
    if (!entry.targetId || typeof entry.targetId !== "string") fail(`${label} targetId debe ser string`);
    if (!VALID_TYPES.has(entry.targetType)) fail(`${label} targetType inválido: ${entry.targetType}`);
    if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1) fail(`${label} confidence debe estar entre 0 y 1`);
    if (!VALID_STATUSES.has(entry.status)) fail(`${label} status inválido: ${entry.status}`);
    if (entry.status === "approved") approved += 1;
    if (entry.status === "review") review += 1;

    const key = `${entry.source}:${normalize(entry.signal)}`;
    if (seenKeys.has(key)) fail(`Señal externa duplicada: ${key}`);
    seenKeys.add(key);

    const target = byId.get(entry.targetId);
    if (!target) {
      fail(`${label} apunta a targetId inexistente: ${entry.targetId}`);
    } else if (target.type !== entry.targetType) {
      fail(`${label} targetType no coincide para ${entry.targetId}: ${entry.targetType} vs ${target.type}`);
    }
  }

  if (mapping.length < 40) warn(`Mapa inicial pequeño: ${mapping.length} señales`);
  if (approved < 30) fail(`Debe haber al menos 30 mappings approved, hay ${approved}`);
  if (review < 1) warn("No hay mappings en review; conviene conservar señales dudosas para revisión");
}

const moduleSource = existsSync(file("src/lib/game-facets/external-signal-mapping.ts"))
  ? read("src/lib/game-facets/external-signal-mapping.ts")
  : "";
for (const forbidden of [
  /OPENAI_API_KEY|openai|anthropic|gemini|perplexity/i,
  /fetch\(|axios|got\(|undici|playwright|puppeteer|cheerio/i,
  /writeFileSync\(|appendFileSync\(|game-details\.json/i,
  /vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i,
  /rakuten|ebay/i,
]) {
  if (forbidden.test(moduleSource)) fail("FACET_EXTERNAL_SIGNAL_MAPPING_V1 contiene una dependencia/proceso prohibido");
}

for (const forbiddenPath of [
  "data/game-facet-assignments.json",
  "data/game-facet-assignments.local.json",
  "src/app/facet",
  "src/app/faceta",
]) {
  if (existsSync(file(forbiddenPath))) fail(`No debe existir ${forbiddenPath} en esta fase`);
}

const doc = existsSync(file("docs/facet-external-signal-mapping-v1.md")) ? read("docs/facet-external-signal-mapping-v1.md") : "";
for (const phrase of [
  "Implemented, not applied",
  "No modifica juegos",
  "No crea landings",
  "No usa IA",
  "Steam",
  "Vandal",
]) {
  if (!doc.includes(phrase)) fail(`Documento de fase no menciona: ${phrase}`);
}

if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length) {
  console.error("FACET_EXTERNAL_SIGNAL_MAPPING_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("FACET_EXTERNAL_SIGNAL_MAPPING_V1 válido: mapa externo, resolución y compliance OK.");
