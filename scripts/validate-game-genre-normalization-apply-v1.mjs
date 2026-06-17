import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return readFileSync(file(relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function gitignoreIncludes(line) {
  if (!existsSync(file(".gitignore"))) return false;
  return read(".gitignore").split(/\r?\n/).includes(line);
}

function readJsonIfExists(relativePath) {
  if (!existsSync(file(relativePath))) return null;
  try {
    return JSON.parse(read(relativePath));
  } catch {
    fail(`${relativePath} no es JSON válido`);
    return null;
  }
}

for (const required of [
  "scripts/normalize-game-genres-apply.mjs",
  "scripts/validate-game-genre-normalization-apply-v1.mjs",
  "docs/game-genre-normalization-v1.md",
]) {
  if (!existsSync(file(required))) fail(`Falta ${required}`);
}

let packageJson = {};
try {
  packageJson = JSON.parse(read("package.json"));
} catch {
  fail("package.json no se puede leer");
}
const scripts = packageJson.scripts ?? {};
if (scripts["normalize:game-genres:apply"] !== "node scripts/normalize-game-genres-apply.mjs") {
  fail("Falta script normalize:game-genres:apply");
}
if (scripts["validate:game-genre-normalization-apply-v1"] !== "node scripts/validate-game-genre-normalization-apply-v1.mjs") {
  fail("Falta script validate:game-genre-normalization-apply-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-genre-normalization-apply-v1")) {
  fail("validate:all debe incluir validate:game-genre-normalization-apply-v1");
}

if (!gitignoreIncludes("/data/game-genre-normalization-apply-report.local.json")) {
  fail("El reporte apply local debe estar en .gitignore");
}
if (!gitignoreIncludes("/data/backups/")) {
  fail("Los backups locales deben estar en .gitignore");
}

const apply = existsSync(file("scripts/normalize-game-genres-apply.mjs"))
  ? read("scripts/normalize-game-genres-apply.mjs")
  : "";
if (!apply.includes("CONFIRM_GAME_GENRE_NORMALIZATION") || !apply.includes('confirm !== "YES"')) {
  fail("Apply debe exigir CONFIRM_GAME_GENRE_NORMALIZATION=YES");
}
if (!apply.includes("allowedApprovedRawGenres")) {
  fail("Apply debe limitarse a allowlist de reglas aprobadas V1");
}
for (const forbidden of [
  /OPENAI_API_KEY|openai|anthropic|gemini|perplexity/i,
  /fetch\(|axios|got\(|undici|playwright|puppeteer|cheerio/i,
  /vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i,
  /EBAY_|RAKUTEN_|AFFILIATE_OFFERS_ENABLED\s*=\s*true/i,
]) {
  if (forbidden.test(apply)) fail("Apply contiene patrón prohibido: IA, scraping, Vercel o afiliación");
}

const forbiddenPublicRuntime = [
  "src/app/faceta",
  "src/app/facet",
  "data/game-facet-assignments.json",
  "data/game-facet-assignments.local.json",
  "src/lib/game-facets.ts",
];
for (const forbidden of forbiddenPublicRuntime) {
  if (existsSync(file(forbidden))) fail(`No debe existir ${forbidden} en apply V1`);
}

const report = readJsonIfExists("data/game-genre-normalization-apply-report.local.json");
if (report) {
  if (report.module !== "GAME_GENRE_NORMALIZATION_APPLY_V1") fail("Reporte apply con módulo incorrecto");
  if (typeof report.success !== "boolean") fail("Reporte apply debe incluir success boolean");
  if (!Array.isArray(report.rulesApplied)) fail("Reporte apply debe incluir rulesApplied");
  if (!Array.isArray(report.affectedCountsByRule)) fail("Reporte apply debe incluir affectedCountsByRule");
  if (!report.backupPath || !existsSync(file(report.backupPath))) fail("Backup path del reporte no existe");
  for (const modifiedFile of report.filesModified ?? []) {
    const backupRelative = path.join(report.backupPath, modifiedFile.replace(/^data\//, ""));
    if (!existsSync(file(backupRelative))) fail(`Falta backup de ${modifiedFile}`);
  }

  const dryRunReport = readJsonIfExists("data/game-genre-normalization-report.local.json");
  if (report.success && dryRunReport && dryRunReport.totalAffectedGames !== 0) {
    fail("Después del apply, el dry-run debe quedar idempotente con 0 cambios pendientes");
  }
}

const doc = existsSync(file("docs/game-genre-normalization-v1.md"))
  ? read("docs/game-genre-normalization-v1.md")
  : "";
for (const phrase of [
  "GAME_GENRE_NORMALIZATION_APPLY_V1",
  "backup",
  "game-genre-normalization-apply-report.local.json",
  "rollback manual",
  "idempotencia",
  "No se crean facetas",
  "No se toca Vercel",
]) {
  if (!doc.toLowerCase().includes(phrase.toLowerCase())) fail(`Documento debe incluir: ${phrase}`);
}

if (failures.length) {
  console.error("GAME_GENRE_NORMALIZATION_APPLY_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GAME_GENRE_NORMALIZATION_APPLY_V1 válido: apply protegido, backup/reporte e idempotencia OK.");
