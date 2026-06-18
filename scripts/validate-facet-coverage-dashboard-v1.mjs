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
  "docs/facet-coverage-dashboard-v1.md",
  "src/lib/admin-facet-review.ts",
  "src/components/admin/admin-facet-review-panel.tsx",
]) {
  if (!existsSync(file(requiredFile))) fail(`Falta ${requiredFile}`);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
if (scripts["validate:facet-coverage-dashboard-v1"] !== "node scripts/validate-facet-coverage-dashboard-v1.mjs") {
  fail("Falta script validate:facet-coverage-dashboard-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:facet-coverage-dashboard-v1")) {
  fail("validate:all debe incluir validate:facet-coverage-dashboard-v1");
}

const lib = read("src/lib/admin-facet-review.ts");
for (const snippet of [
  "AdminFacetCoverage",
  "platforms: AdminFacetCoveragePlatform[]",
  "topSubgenres",
  "topFacets",
  "coverage, options",
]) {
  if (!lib.includes(snippet)) fail(`admin-facet-review no incluye ${snippet}`);
}

const panel = read("src/components/admin/admin-facet-review-panel.tsx");
for (const snippet of [
  "coverage.platforms",
  "Plataformas principales",
  "coverage.topSubgenres",
  "coverage.topFacets",
]) {
  if (!panel.includes(snippet)) fail(`admin-facet-review-panel no incluye ${snippet}`);
}

const changedGameDetails = await import("node:child_process")
  .then(({ execSync }) => execSync("git diff --name-only -- data/game-details.json", { cwd: root, encoding: "utf8" }).trim())
  .catch(() => "");
if (changedGameDetails) {
  console.log("data/game-details.json está modificado por otro proceso; esta fase solo añade métricas.");
}

if (failures.length) {
  console.error("FACET_COVERAGE_DASHBOARD_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("FACET_COVERAGE_DASHBOARD_V1 válido: métricas admin de cobertura disponibles.");
