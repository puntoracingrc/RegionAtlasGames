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

assert.ok(Array.isArray(catalog), "catalog must be an array");
assert.ok(catalog.length > 0, "catalog must contain entries");
assert.ok(catalog.every((entry) => typeof entry.id === "string" && entry.id.length > 0), "catalog IDs must be valid");
assert.equal(catalogIds.size, catalog.length, "catalog IDs must be unique");

assert.ok(companies && typeof companies === "object" && !Array.isArray(companies), "company index must be an object");
const companyEntries = Object.entries(companies);
assert.ok(companyEntries.length > 0, "company index must contain entries");
for (const [slug, company] of companyEntries) {
  assert.equal(company.slug, slug, `company index key does not match slug: ${slug}`);
  assert.ok(typeof company.name === "string" && company.name.length > 0, `company name is missing: ${slug}`);
  assert.ok(Array.isArray(company.gameIds), `company gameIds must be an array: ${slug}`);
  assert.equal(company.gameCount, company.gameIds.length, `company catalog count drifted: ${slug}`);
  assert.ok(
    company.gameIds.every((catalogId) => catalogIds.has(catalogId)),
    `company index references an unknown catalog ID: ${slug}`,
  );
}
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

const formatCount = new Intl.NumberFormat("en-US").format;
console.log(
  `OK catalog count semantics: ${formatCount(catalog.length)} catalog records, ` +
    `${formatCount(catalogIds.size)} unique IDs, ${formatCount(companyEntries.length)} companies ` +
    "and explicit public ficha counts",
);
