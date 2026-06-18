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
  "docs/facet-public-tag-index-v1.md",
  "src/app/etiqueta/page.tsx",
  "src/app/etiqueta/[slug]/page.tsx",
]) {
  if (!existsSync(file(requiredFile))) fail(`Falta ${requiredFile}`);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
if (scripts["validate:facet-public-tag-index-v1"] !== "node scripts/validate-facet-public-tag-index-v1.mjs") {
  fail("Falta script validate:facet-public-tag-index-v1");
}
if (!String(scripts["validate:all"] ?? "").includes("validate:facet-public-tag-index-v1")) {
  fail("validate:all debe incluir validate:facet-public-tag-index-v1");
}

const page = read("src/app/etiqueta/page.tsx");
for (const snippet of [
  "GameTaxonomyGroupBrowser",
  "getPublicTaxonomyGroups",
  "includeFacetCounts: false",
  "term.type !== \"genre\"",
  "Etiquetas y facetas",
]) {
  if (!page.includes(snippet)) fail(`etiqueta/page no incluye ${snippet}`);
}
if (page.includes("IndexEntityList")) {
  fail("/etiqueta no debe depender solo del índice legacy de tags");
}

const detail = read("src/app/etiqueta/[slug]/page.tsx");
for (const snippet of ["summarizeIndexSlug(\"tag\", slug)", "findGameFacetProfileEntity(slug)"]) {
  if (!detail.includes(snippet)) fail(`/etiqueta/[slug] debe mantener compatibilidad: ${snippet}`);
}

if (failures.length) {
  console.error("FACET_PUBLIC_TAG_INDEX_V1 inválido:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("FACET_PUBLIC_TAG_INDEX_V1 válido: /etiqueta lista subgéneros/facetas controladas.");
