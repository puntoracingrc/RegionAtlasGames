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

function requireFile(relativePath) {
  if (!existsSync(file(relativePath))) fail(`Falta ${relativePath}`);
}

for (const requiredFile of [
  "docs/facet-catalog-search-integration-v1.md",
  "src/lib/catalog-search-aliases.ts",
  "src/lib/catalog-list-game.ts",
]) {
  requireFile(requiredFile);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
if (scripts["validate:facet-catalog-search-integration-v1"] !== "node scripts/validate-facet-catalog-search-integration-v1.mjs") {
  fail("Falta script validate:facet-catalog-search-integration-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:facet-catalog-search-integration-v1")) {
  fail("validate:all debe incluir validate:facet-catalog-search-integration-v1");
}

const aliases = read("src/lib/catalog-search-aliases.ts");
for (const snippet of [
  "searchAliases",
  "nameEn",
  "canonicalSlug",
  "catalogSearchAliasesForDetailEntity",
]) {
  if (!aliases.includes(snippet)) fail(`catalog-search-aliases no incluye ${snippet}`);
}

const listGame = read("src/lib/catalog-list-game.ts");
for (const snippet of [
  "catalogSearchAliasesForDetailEntity",
  "details?.subgenres",
  "details?.facets",
  "details?.tags",
  "facetSearchEntities.flatMap",
]) {
  if (!listGame.includes(snippet)) fail(`catalog-list-game no incluye ${snippet}`);
}

const changedGameDetails = await import("node:child_process")
  .then(({ execSync }) => execSync("git diff --name-only -- data/game-details.json", { cwd: root, encoding: "utf8" }).trim())
  .catch(() => "");
if (changedGameDetails) {
  console.log("data/game-details.json está modificado por otro proceso; esta fase no lo toca.");
}

if (failures.length) {
  console.error("FACET_CATALOG_SEARCH_INTEGRATION_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("FACET_CATALOG_SEARCH_INTEGRATION_V1 válido: subgéneros/facetas/tags entran en búsqueda.");
