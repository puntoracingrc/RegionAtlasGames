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

function gitignoreIncludes(line) {
  if (!existsSync(file(".gitignore"))) return false;
  return read(".gitignore").split(/\r?\n/).includes(line);
}

const requiredFiles = [
  "docs/game-genre-normalization-v1.md",
  "docs/game-genre-normalization-apply-closure-v1.md",
  "data/game-genre-normalization.json",
  "scripts/normalize-game-genres-dry-run.mjs",
  "scripts/normalize-game-genres-apply.mjs",
  "scripts/validate-game-genre-normalization-v1.mjs",
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
if (scripts["normalize:game-genres:dry-run"] !== "node scripts/normalize-game-genres-dry-run.mjs") {
  fail("Falta script normalize:game-genres:dry-run");
}
if (scripts["normalize:game-genres:apply"] !== "node scripts/normalize-game-genres-apply.mjs") {
  fail("Falta script normalize:game-genres:apply");
}
if (scripts["validate:game-genre-normalization-v1"] !== "node scripts/validate-game-genre-normalization-v1.mjs") {
  fail("Falta script validate:game-genre-normalization-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-genre-normalization-v1")) {
  fail("validate:all debe incluir validate:game-genre-normalization-v1");
}

if (!gitignoreIncludes("/data/game-genre-normalization-report.local.json")) {
  fail("data/game-genre-normalization-report.local.json debe estar en .gitignore");
}

const dryRun = existsSync(file("scripts/normalize-game-genres-dry-run.mjs"))
  ? read("scripts/normalize-game-genres-dry-run.mjs")
  : "";
const apply = existsSync(file("scripts/normalize-game-genres-apply.mjs"))
  ? read("scripts/normalize-game-genres-apply.mjs")
  : "";
const combined = `${dryRun}\n${apply}`;

if (/OPENAI_API_KEY|openai|anthropic|gemini|perplexity/i.test(combined)) {
  fail("No usar IA en normalización V1");
}
if (/fetch\(|axios|got\(|undici|playwright|puppeteer|cheerio/i.test(combined)) {
  fail("No usar scraping ni llamadas externas en normalización V1");
}
if (/vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i.test(combined)) {
  fail("No tocar Vercel ni producción");
}
if (!apply.includes("CONFIRM_GAME_GENRE_NORMALIZATION") || !apply.includes("YES")) {
  fail("El apply debe exigir CONFIRM_GAME_GENRE_NORMALIZATION=YES");
}
if (!apply.includes("CONFIRM_GAME_GENRE_NORMALIZATION") || !apply.includes("YES")) {
  fail("El apply debe exigir CONFIRM_GAME_GENRE_NORMALIZATION=YES");
}

const forbiddenPublicRuntime = [
  "src/app/faceta",
  "src/app/facet",
  "data/game-facet-assignments.json",
  "data/game-facet-assignments.local.json",
  "src/lib/game-facets.ts",
];
for (const forbidden of forbiddenPublicRuntime) {
  if (existsSync(file(forbidden))) fail(`No debe existir ${forbidden} en GAME_GENRE_NORMALIZATION_V1`);
}

try {
  const map = JSON.parse(read("data/game-genre-normalization.json"));
  if (!Array.isArray(map)) fail("data/game-genre-normalization.json debe ser un array");
  for (const rule of Array.isArray(map) ? map : []) {
    if (!rule.raw || !Array.isArray(rule.normalized) || !rule.reason || !rule.action || !rule.status) {
      fail(`Regla incompleta: ${JSON.stringify(rule)}`);
      break;
    }
    if (!rule.normalized.every((item) => typeof item === "string" && item.trim())) {
      fail(`normalized debe ser string[] no vacío: ${JSON.stringify(rule)}`);
      break;
    }
    if (!['approved', 'review'].includes(rule.status)) {
      fail(`status no permitido: ${rule.status}`);
      break;
    }
    if (!['normalize', 'split', 'alias'].includes(rule.action)) {
      fail(`action no permitida: ${rule.action}`);
      break;
    }
  }
} catch {
  fail("data/game-genre-normalization.json no es JSON válido");
}

const doc = existsSync(file("docs/game-genre-normalization-v1.md"))
  ? read("docs/game-genre-normalization-v1.md")
  : "";
for (const phrase of [
  "dry-run obligatorio",
  "CONFIRM_GAME_GENRE_NORMALIZATION=YES",
  "rollback",
  "backup",
  "Apply closure",
  "docs/game-genre-normalization-apply-closure-v1.md",
  "No se crean landings públicas",
  "No se activan facetas reales",
]) {
  if (!doc.toLowerCase().includes(phrase.toLowerCase())) fail(`Documento debe incluir: ${phrase}`);
}

const closureDoc = existsSync(file("docs/game-genre-normalization-apply-closure-v1.md"))
  ? read("docs/game-genre-normalization-apply-closure-v1.md")
  : "";
for (const phrase of [
  "data/backups/game-genre-normalization/20260617-194724",
  "data/game-genre-normalization-apply-report.local.json",
  "0 cambios pendientes",
  "No se han creado facetas",
  "No se han creado landings públicas",
  "No se ha modificado la UI pública",
]) {
  if (!closureDoc.includes(phrase)) fail(`Documento de cierre debe incluir: ${phrase}`);
}

if (failures.length) {
  console.error("GAME_GENRE_NORMALIZATION_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GAME_GENRE_NORMALIZATION_V1 válido: mapa, dry-run y apply protegido OK.");
