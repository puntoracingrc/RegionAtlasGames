import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// A one-result preservation audit, not an automated research importer.
const base = "f3f25892";
const read = file => readFileSync(file, "utf8");
const before = file => execFileSync("git", ["show", `${base}:${file}`], {
  encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
});
const hash = value => createHash("sha256").update(value).digest("hex");
const load = file => JSON.parse(read(file));
const original = file => JSON.parse(before(file));
const addedId = "xboxone-usa-a-way-out";
const existingIds = ["ps4-a-way-out", "ps4-usa-a-way-out"];
const catalog = load("data/catalog.json");
const oldCatalog = original("data/catalog.json");
assert.deepEqual(catalog.filter(g => g.id !== addedId), oldCatalog,
  "Every pre-existing catalog record, including all prices and covers, must remain identical");
assert.equal(catalog.filter(g => g.id === addedId).length, 1);
assert.equal(new Set(catalog.map(g => g.id)).size, catalog.length);
assert.equal(catalog.length, oldCatalog.length + 1);

const details = load("data/game-details.json");
const oldDetails = original("data/game-details.json");
assert.equal(Object.keys(details).length, Object.keys(oldDetails).length + 1);
for (const [id, value] of Object.entries(oldDetails)) {
  const expected = structuredClone(value);
  if (existingIds.includes(id)) {
    expected.reference = id === existingIds[0] ? "CUSA-08004" : "CUSA-07995";
    expected.ean = id === existingIds[0] ? "5030931122767" : "014633739138";
    expected.support = "Disco Blu-ray";
    expected.fieldSources.reference = "research";
    expected.fieldSources.support = "research";
  }
  assert.deepEqual(details[id], expected, `Unexpected detail mutation: ${id}`);
}

const companies = load("data/index/companies.json");
const oldCompanies = original("data/index/companies.json");
for (const [slug, role] of [["hazelight-studios", "asDeveloper"], ["electronic-arts", "asPublisher"]]) {
  oldCompanies[slug].gameIds.push(addedId);
  oldCompanies[slug][role].push(addedId);
  oldCompanies[slug].byPlatform.xboxone = 1;
  oldCompanies[slug].gameCount += 1;
}
assert.deepEqual(companies, oldCompanies, "Only the new game's two existing company links may change");

const guides = load("data/catalog-edition-guides.json");
const oldGuides = original("data/catalog-edition-guides.json");
assert.deepEqual(guides.guides.filter(g => !["a-way-out-ps4", "a-way-out-xboxone"].includes(g.id)), oldGuides.guides);
assert.equal(guides.guides.length, oldGuides.guides.length + 2);
const meta = original("data/meta.json");
meta.catalogListed += 1;
meta.catalogTotal += 1;
meta.gamesWithDetails += 1;
meta.listedByPlatform.xboxone = 1;
assert.deepEqual(load("data/meta.json"), meta);

const unchanged = ["research/queue.json", "research/results/a-way-out-2026-09-20.json",
  "data/platforms.json", "data/catalog-owned-scans.json", "data/index/company-entities.json"];
for (const file of unchanged) assert.equal(read(file), before(file), `${file} must remain byte-identical`);
console.log(JSON.stringify({
  base, researchId: "a-way-out-2026-09-20", status: "PASS",
  addedCatalogIds: [addedId], enrichedCatalogIds: existingIds,
  preservedExistingCatalogRecords: oldCatalog.length,
  preservedUnrelatedDetails: Object.keys(oldDetails).length - existingIds.length,
  priceMutations: 0, otherGameMutations: 0, queueStatusMutations: 0,
  newNativeXboxSeriesReleases: 0, completedQueueEntries: [],
  partiallyCoveredQueueEntries: ["catalog-group:ps4-a-way-out"],
  unchangedFiles: unchanged.map(file => ({ file, sha256: hash(read(file)) })),
  protectedFileHashUpdates: ["data/index/companies.json", "data/game-details.json"].map(file => ({
    file, before: hash(before(file)), after: hash(read(file)),
  })),
}, null, 2));
