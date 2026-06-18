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
  "docs/game-details-facets-storage-v1.md",
  "src/lib/types.ts",
  "src/lib/admin-draft-types.ts",
  "src/lib/admin-draft-patch.ts",
  "src/lib/admin-draft-storage.ts",
  "src/lib/admin-catalog-publish.ts",
  "src/lib/admin-ai-fill.ts",
  "src/components/admin/admin-game-editor.tsx",
  "src/app/catalogo/[slug]/page.tsx",
  "src/lib/game-facet-profile.ts",
]) {
  requireFile(requiredFile);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
if (scripts["validate:game-details-facets-storage-v1"] !== "node scripts/validate-game-details-facets-storage-v1.mjs") {
  fail("Falta script validate:game-details-facets-storage-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:game-details-facets-storage-v1")) {
  fail("validate:all debe incluir validate:game-details-facets-storage-v1");
}

const types = read("src/lib/types.ts");
for (const snippet of [
  "subgenres?: DetailEntity[]",
  "facets?: DetailEntity[]",
  "| \"subgenres\"",
  "| \"facets\"",
]) {
  if (!types.includes(snippet)) fail(`GameDetails no incluye ${snippet}`);
}

const draftTypes = read("src/lib/admin-draft-types.ts");
for (const snippet of ["subgenreNames: string[]", "facetNames: string[]"]) {
  if (!draftTypes.includes(snippet)) fail(`AdminGameDraft no incluye ${snippet}`);
}

const draftPatch = read("src/lib/admin-draft-patch.ts");
for (const snippet of ["details?.subgenres", "details?.facets", "body.subgenreNames", "body.facetNames"]) {
  if (!draftPatch.includes(snippet)) fail(`admin-draft-patch no conserva ${snippet}`);
}

const draftStorage = read("src/lib/admin-draft-storage.ts");
for (const snippet of ["existing?.subgenreNames", "existing?.facetNames", "subgenreNames: []", "facetNames: []"]) {
  if (!draftStorage.includes(snippet)) fail(`admin-draft-storage no inicializa ${snippet}`);
}

const publish = read("src/lib/admin-catalog-publish.ts");
for (const snippet of ["subgenres,", "facets,", "built.subgenres", "built.facets"]) {
  if (!publish.includes(snippet)) fail(`admin-catalog-publish no publica ${snippet}`);
}

const editor = read("src/components/admin/admin-game-editor.tsx");
for (const snippet of ["Subgéneros controlados", "Facetas / etiquetas controladas", "draft.subgenreNames.join", "draft.facetNames.join"]) {
  if (!editor.includes(snippet)) fail(`admin-game-editor no muestra ${snippet}`);
}

const aiFill = read("src/lib/admin-ai-fill.ts");
for (const snippet of [
  "resolveExternalFacetSignals",
  "steamExperimentalTags.map",
  "field: \"subgenreNames\"",
  "field: \"facetNames\"",
]) {
  if (!aiFill.includes(snippet)) fail(`admin-ai-fill no mapea señales externas: ${snippet}`);
}

const catalogPage = read("src/app/catalogo/[slug]/page.tsx");
for (const snippet of ["details?.subgenres", "details?.facets", "Subgéneros", "Facetas", "/etiqueta/"]) {
  if (!catalogPage.includes(snippet)) fail(`catalogo/[slug] no renderiza ${snippet}`);
}

const profile = read("src/lib/game-facet-profile.ts");
for (const snippet of ["details?.subgenres", "details?.facets"]) {
  if (!profile.includes(snippet)) fail(`game-facet-profile no cuenta ${snippet}`);
}

for (const forbiddenPath of [
  "src/app/facet",
  "src/app/faceta",
]) {
  if (existsSync(file(forbiddenPath))) fail(`No debe existir landing nueva ${forbiddenPath}`);
}

const changedGameDetails = await import("node:child_process")
  .then(({ execSync }) => execSync("git diff --name-only -- data/game-details.json", { cwd: root, encoding: "utf8" }).trim())
  .catch(() => "");
if (changedGameDetails) fail("GAME_DETAILS_FACETS_STORAGE_V1 no debe modificar data/game-details.json");

if (failures.length) {
  console.error("GAME_DETAILS_FACETS_STORAGE_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GAME_DETAILS_FACETS_STORAGE_V1 válido: fichas preparadas para subgéneros/facetas.");
