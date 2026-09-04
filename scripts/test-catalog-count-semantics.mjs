#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const catalog = readJson("data/catalog.json");
const companies = readJson("data/index/companies.json");
const meta = readJson("data/meta.json");
const catalogIds = new Set(catalog.map((entry) => entry.id));
const publicCatalogEntryCount = catalog.filter((entry) => entry.listingStatus !== "excluded").length;

assert.equal(catalog.length, 59_626, "catalog row count changed");
assert.equal(catalogIds.size, 59_626, "catalog IDs are no longer unique or complete");
assert.equal(Object.keys(companies).length, 4_326, "company count changed");
assert.equal(meta.catalogListed, publicCatalogEntryCount, "public catalog metadata count drifted");

const componentFiles = [
  "src/app/catalogo/page.tsx",
  "src/app/page.tsx",
  "src/app/plataforma/[slug]/page.tsx",
  "src/app/plataformas/page.tsx",
  "src/components/catalog-browser.tsx",
  "src/components/company-explorer.tsx",
  "src/components/company-profile-detail.tsx",
  "src/components/company-profile-header.tsx",
  "src/components/company-platform-games.tsx",
  "src/components/game-facet-profile-detail.tsx",
  "src/components/company-collaborators.tsx",
  "src/components/game-taxonomy-group-browser.tsx",
  "src/components/genre-profile-detail.tsx",
  "src/components/genre-profile-sections.tsx",
  "src/components/index-entity-header.tsx",
  "src/components/index-grid.tsx",
  "src/components/platform-card.tsx",
  "src/components/platform-catalog-section.tsx",
  "src/components/series-profile-panel.tsx",
  "src/lib/company-seo.ts",
  "src/lib/genre-seo.ts",
  "src/lib/saga-mascots.ts",
];
const publicComponents = componentFiles.map(read).join("\n");

assert.doesNotMatch(
  publicComponents,
  /\b(?:company|view|profile|summary|term|platform)\.(?:gameCount|developerCount|publisherCount|grailCount|pricedCount)\b/,
  "a public component reads an ambiguous legacy count",
);

for (const ambiguousCopy of [
  "Más juegos",
  "Menos juegos",
  "Juegos por plataforma",
  "juegos en el catálogo",
  "juegos del catálogo",
  "títulos indexados",
  "títulos listados",
]) {
  assert.equal(
    publicComponents.includes(ambiguousCopy),
    false,
    `ambiguous public count copy returned: ${ambiguousCopy}`,
  );
}

const companyContract = read("src/lib/company-explorer-types.ts");
for (const field of [
  "catalogEntryCount",
  "developerCatalogEntryCount",
  "publisherCatalogEntryCount",
  "highValueCatalogEntryCount",
  "pricedCatalogEntryCount",
  "catalogEntriesWithDetails",
]) {
  assert.ok(companyContract.includes(field), `missing explicit company count field: ${field}`);
}
assert.doesNotMatch(
  companyContract,
  /^\s*(?:gameCount|developerCount|publisherCount|grailCount|pricedCount):/m,
  "the public company DTO exposes an ambiguous legacy count",
);

for (const relativePath of [
  "src/lib/company-profile.ts",
  "src/lib/genre-profile.ts",
  "src/lib/index-entity.ts",
  "src/lib/series-profile.ts",
  "src/lib/game-facet-profile.ts",
  "src/lib/game-taxonomy-groups.ts",
]) {
  assert.ok(read(relativePath).includes("catalogEntryCount"), `${relativePath} lacks catalogEntryCount`);
}

console.log(
  "OK catalog count semantics: 59,626 catalog records, 59,626 unique IDs, " +
    "4,326 companies and explicit public ficha counts",
);
