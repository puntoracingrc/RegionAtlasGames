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
  "docs/facet-review-and-apply-workflow-v1.md",
  "src/lib/admin-facet-review.ts",
  "src/app/api/admin/facet-review/route.ts",
  "src/components/admin/admin-facet-review-panel.tsx",
  "src/app/admin/facetas/page.tsx",
]) {
  requireFile(requiredFile);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
if (scripts["validate:facet-review-and-apply-workflow-v1"] !== "node scripts/validate-facet-review-and-apply-workflow-v1.mjs") {
  fail("Falta script validate:facet-review-and-apply-workflow-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:facet-review-and-apply-workflow-v1")) {
  fail("validate:all debe incluir validate:facet-review-and-apply-workflow-v1");
}

const lib = read("src/lib/admin-facet-review.ts");
for (const snippet of [
  "findGameFacetEntityByNameOrAlias",
  "expectedType: \"subgenre\" | \"facet\"",
  "writeCatalogOverlay",
  "canWriteCatalogFiles",
  "getAdminFacetReviewQueue",
  "applyAdminFacetReview",
]) {
  if (!lib.includes(snippet)) fail(`admin-facet-review no incluye ${snippet}`);
}
if (lib.includes("resolveExternalFacetSignal(")) {
  fail("La revisión no debe resolver una sola señal sin deduplicación/control.");
}

const route = read("src/app/api/admin/facet-review/route.ts");
for (const snippet of ["assertAdminApi", "getAdminFacetReviewQueue", "applyAdminFacetReview", "No autorizado"]) {
  if (!route.includes(snippet)) fail(`API de revisión no incluye ${snippet}`);
}

const panel = read("src/components/admin/admin-facet-review-panel.tsx");
for (const snippet of [
  "/api/admin/facet-review",
  "Revisión y aplicación",
  "Añadir visibles",
  "Usar sugerencias",
  "Aplicar a",
]) {
  if (!panel.includes(snippet)) fail(`Panel de facetas no incluye ${snippet}`);
}

const nav = read("src/components/admin/admin-nav.tsx");
if (!nav.includes('/admin/facetas')) fail("El menú admin no enlaza /admin/facetas");

const changedGameDetails = await import("node:child_process")
  .then(({ execSync }) => execSync("git diff --name-only -- data/game-details.json", { cwd: root, encoding: "utf8" }).trim())
  .catch(() => "");
if (!changedGameDetails) {
  console.log("data/game-details.json no tiene cambios de esta fase.");
}

if (failures.length) {
  console.error("FACET_REVIEW_AND_APPLY_WORKFLOW_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("FACET_REVIEW_AND_APPLY_WORKFLOW_V1 válido: revisión admin y aplicación controlada disponibles.");
