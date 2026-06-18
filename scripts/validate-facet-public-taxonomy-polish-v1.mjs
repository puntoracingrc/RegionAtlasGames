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

for (const requiredFile of [
  "docs/facet-public-taxonomy-polish-v1.md",
  "src/lib/game-taxonomy-groups.ts",
  "src/components/game-taxonomy-group-browser.tsx",
]) {
  if (!existsSync(file(requiredFile))) fail(`Falta ${requiredFile}`);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
if (scripts["validate:facet-public-taxonomy-polish-v1"] !== "node scripts/validate-facet-public-taxonomy-polish-v1.mjs") {
  fail("Falta script validate:facet-public-taxonomy-polish-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:facet-public-taxonomy-polish-v1")) {
  fail("validate:all debe incluir validate:facet-public-taxonomy-polish-v1");
}

const groups = read("src/lib/game-taxonomy-groups.ts");
for (const snippet of [
  "searchAliases: string[]",
  "searchAliases: entity.searchAliases",
  "filter((group) => group.terms.length > 0)",
  "Tono y sensaciones",
  "Actividades del jugador",
]) {
  if (!groups.includes(snippet)) fail(`game-taxonomy-groups no incluye ${snippet}`);
}

const browser = read("src/components/game-taxonomy-group-browser.tsx");
if (!browser.includes("...term.searchAliases")) {
  fail("game-taxonomy-group-browser no busca por searchAliases invisibles");
}
if (browser.includes("Alias: {term.searchAliases")) {
  fail("No deben mostrarse searchAliases como alias visibles");
}

if (existsSync(file("src/app/faceta")) || existsSync(file("src/app/facet"))) {
  fail("No deben crearse rutas facet/faceta nuevas");
}

if (failures.length) {
  console.error("FACET_PUBLIC_TAXONOMY_POLISH_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("FACET_PUBLIC_TAXONOMY_POLISH_V1 válido: taxonomía pública pulida.");
