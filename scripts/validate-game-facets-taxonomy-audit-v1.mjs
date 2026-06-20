import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
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

function walk(directory, entries = []) {
  for (const entry of readdirSync(directory)) {
    if ([".git", ".next", "node_modules"].includes(entry)) continue;
    const fullPath = path.join(directory, entry);
    if (lstatSync(fullPath).isSymbolicLink() && !existsSync(fullPath)) continue;
    if (statSync(fullPath).isDirectory()) walk(fullPath, entries);
    else entries.push(fullPath);
  }
  return entries;
}

const requiredFiles = [
  "docs/game-facets-taxonomy-audit-v1.md",
  "data/game-facets-taxonomy.example.json",
  "scripts/analyze-game-facets-coverage.mjs",
  "scripts/validate-game-facets-taxonomy-audit-v1.mjs",
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
if (scripts["analyze:game-facets-coverage"] !== "node scripts/analyze-game-facets-coverage.mjs") {
  fail("Falta script analyze:game-facets-coverage");
}
if (scripts["validate:game-facets-taxonomy-audit-v1"] !== "node scripts/validate-game-facets-taxonomy-audit-v1.mjs") {
  fail("Falta script validate:game-facets-taxonomy-audit-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-facets-taxonomy-audit-v1")) {
  fail("validate:all debe incluir validate:game-facets-taxonomy-audit-v1");
}

if (existsSync(file("data/game-facet-assignments.json"))) fail("No debe existir data/game-facet-assignments.json en esta fase");
if (existsSync(file("data/game-facet-assignments.local.json"))) fail("No debe existir data/game-facet-assignments.local.json en esta fase");
if (existsSync(file("src/app/tag"))) fail("No crear landings públicas /tag en esta fase");
if (existsSync(file("src/app/faceta"))) fail("No crear landings públicas /faceta en esta fase");
if (existsSync(file("src/app/facet"))) fail("No crear landings públicas /facet en esta fase");

try {
  const taxonomy = JSON.parse(read("data/game-facets-taxonomy.example.json"));
  if (!Array.isArray(taxonomy.genres)) fail("taxonomy.example debe tener genres[]");
  if (!Array.isArray(taxonomy.subgenres)) fail("taxonomy.example debe tener subgenres[]");
  if (!Array.isArray(taxonomy.facets)) fail("taxonomy.example debe tener facets[]");
  const allEntities = [
    ...(taxonomy.genres ?? []),
    ...(taxonomy.subgenres ?? []),
    ...(taxonomy.facets ?? []),
  ];
  for (const entity of allEntities) {
    if (!entity.id || !entity.name || !entity.slug || !entity.status) {
      fail(`Entidad incompleta en taxonomy.example: ${JSON.stringify(entity)}`);
      break;
    }
  }
} catch {
  fail("data/game-facets-taxonomy.example.json no es JSON válido");
}

const auditScript = existsSync(file("scripts/analyze-game-facets-coverage.mjs")) ? read("scripts/analyze-game-facets-coverage.mjs") : "";
const auditSources = auditScript;
const steamNamedScripts = existsSync(file("scripts"))
  ? readdirSync(file("scripts")).filter((entry) => /steam/i.test(entry))
  : [];

if (steamNamedScripts.length) {
  fail(`No crear scripts Steam en esta fase: ${steamNamedScripts.join(", ")}`);
}
if (/steamcommunity\.com|store\.steampowered\.com|api\.steampowered\.com/i.test(auditSources)) {
  fail("La auditoría no debe llamar endpoints Steam");
}
if (/steam\s*(crawler|scraper)|scrape\w*\s+steam|steam.*appId.*tags/i.test(auditSources)) {
  fail("La auditoría no debe crear crawler/scraper ni copiar tags Steam");
}
if (/openai|OPENAI_API_KEY|ai_suggestion.*write|write.*ai_suggestion/i.test(auditScript)) {
  fail("El diagnóstico no debe usar IA ni escribir sugerencias");
}
if (/writeFileSync|appendFileSync|rmSync|unlinkSync|mkdirSync/i.test(auditScript)) {
  fail("El diagnóstico debe ser solo lectura");
}
if (/AFFILIATE_OFFERS_ENABLED\s*=\s*["']?true|RAKUTEN_AFFILIATE_ENABLED\s*=\s*["']?true|EBAY_AFFILIATE_ENABLED\s*=\s*["']?true/i.test(auditSources)) {
  fail("No activar afiliación en esta fase");
}
if (/vercel\s+env|sync-vercel-env|VERCEL_[A-Z0-9_]+\s*=\s*["']?1/i.test(auditScript)) {
  fail("No tocar Vercel en esta fase");
}

if (failures.length) {
  console.error("GAME_FACETS_TAXONOMY_AUDIT_V1 no válido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GAME_FACETS_TAXONOMY_AUDIT_V1 válido: docs, ejemplo, diagnóstico y compliance OK.");
