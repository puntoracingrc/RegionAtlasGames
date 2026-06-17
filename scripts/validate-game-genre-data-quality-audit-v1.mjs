import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return readFileSync(file(relativePath), "utf8");
}

const requiredFiles = [
  "docs/game-genre-data-quality-audit-v1.md",
  "data/game-genre-normalization.example.json",
  "scripts/analyze-game-genre-quality.mjs",
  "scripts/validate-game-genre-data-quality-audit-v1.mjs",
];

for (const requiredFile of requiredFiles) {
  if (!existsSync(file(requiredFile))) fail(`Falta ${requiredFile}`);
}

let packageJson = {};
try {
  packageJson = JSON.parse(read("package.json"));
} catch {
  fail("package.json no se puede leer");
}

const scripts = packageJson.scripts ?? {};
if (scripts["analyze:game-genre-quality"] !== "node scripts/analyze-game-genre-quality.mjs") {
  fail("Falta script analyze:game-genre-quality");
}
if (scripts["validate:game-genre-data-quality-audit-v1"] !== "node scripts/validate-game-genre-data-quality-audit-v1.mjs") {
  fail("Falta script validate:game-genre-data-quality-audit-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-genre-data-quality-audit-v1")) {
  fail("validate:all debe incluir validate:game-genre-data-quality-audit-v1");
}

let analyzeScript = "";
if (existsSync(file("scripts/analyze-game-genre-quality.mjs"))) {
  analyzeScript = read("scripts/analyze-game-genre-quality.mjs");
}

if (/writeFileSync|appendFileSync|rmSync|unlinkSync|renameSync|cpSync|mkdirSync|createWriteStream|fs\.promises\.writeFile/i.test(analyzeScript)) {
  fail("El analizador debe ser solo lectura: no puede escribir, borrar ni mover archivos");
}
if (/openai|OPENAI_API_KEY|anthropic|gemini|perplexity/i.test(analyzeScript)) {
  fail("La auditoría no debe usar IA");
}
if (/fetch\(|axios|got\(|undici|playwright|puppeteer|cheerio/i.test(analyzeScript)) {
  fail("La auditoría no debe hacer scraping ni llamadas externas");
}
if (/vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i.test(analyzeScript)) {
  fail("No tocar Vercel ni producción en esta fase");
}
if (/data\/game-details\.json.*write|write.*data\/game-details\.json|data\/catalog\.json.*write|write.*data\/catalog\.json/i.test(analyzeScript)) {
  fail("No se deben modificar archivos de juegos");
}

const forbiddenRuntimeFiles = [
  "data/game-genre-normalization.local.json",
  "data/game-normalized-genres.json",
  "data/game-facet-assignments.json",
  "data/game-facet-assignments.local.json",
  "src/lib/game-facets.ts",
  "src/lib/game-genre-normalization.ts",
  "src/app/faceta",
  "src/app/facet",
];

for (const forbidden of forbiddenRuntimeFiles) {
  if (existsSync(file(forbidden))) fail(`No debe existir ${forbidden} en esta fase`);
}

try {
  const example = JSON.parse(read("data/game-genre-normalization.example.json"));
  if (!Array.isArray(example)) fail("data/game-genre-normalization.example.json debe ser un array");
  for (const item of Array.isArray(example) ? example : []) {
    if (!item.raw || item.suggestedNormalized == null || !item.reason || !item.action) {
      fail(`Entrada de normalización incompleta: ${JSON.stringify(item)}`);
      break;
    }
    if (item.destructive !== false) {
      fail(`Toda propuesta debe ser no destructiva: ${JSON.stringify(item)}`);
      break;
    }
    if (!/^suggest_/.test(item.action)) {
      fail(`La acción debe ser sugerida, no aplicada: ${item.action}`);
      break;
    }
  }
} catch {
  fail("data/game-genre-normalization.example.json no es JSON válido");
}

const doc = existsSync(file("docs/game-genre-data-quality-audit-v1.md"))
  ? read("docs/game-genre-data-quality-audit-v1.md")
  : "";
for (const requiredPhrase of [
  "No modifica juegos",
  "No se aplican normalizaciones",
  "GAME_GENRE_NORMALIZATION_V1",
  "rawGenre",
  "normalizedGenres",
  "No se crean landings públicas",
]) {
  if (!doc.includes(requiredPhrase)) fail(`Documento debe incluir: ${requiredPhrase}`);
}

if (failures.length) {
  console.error("GAME_GENRE_DATA_QUALITY_AUDIT_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GAME_GENRE_DATA_QUALITY_AUDIT_V1 válido: auditoría solo lectura, docs, ejemplo y compliance OK.");
