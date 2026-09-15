import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-rogue-xbox360.json";

const guide = rawDocument.guides[0];
const physicalEditions = guide.physicalEditions;

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Rogue Xbox 360 barcode ${barcode}`);
  return result;
}

test("Rogue Xbox 360 keeps a stable canonical work and platform release", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide.game.platformSlug, "xbox360");
  assert.equal(guide.game.canonicalCatalogId, "xbox360-assassin-s-creed-rogue");
  assert.equal(guide.game.canonicalGameId, "assassins-creed-rogue");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-rogue-xbox360");
});

test("Standard Spain preserves its verified packaging and software language boundary", () => {
  const spain = edition("3307215806463");
  assert.deepEqual(spain.marketRegions, ["ES"]);
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.softwareLanguages, ["ES", "EN", "FR", "DE", "IT"]);
  assert.deepEqual(spain.productCodes, ["300068635"]);
  assert.deepEqual(edition("3307215806401").marketRegions, ["FR"]);
  assert.deepEqual(edition("3307215806500").marketRegions, ["AU"]);
  assert.deepEqual(edition("887256000110").marketRegions, ["US"]);
});

test("generic Europe and Canada are not promoted to invented national boxes", () => {
  assert.deepEqual(edition("3307215806326").marketRegions, []);
  assert.equal(physicalEditions.some((entry) => entry.marketRegions.includes("CA")), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac-rogue-canada-standard"));
});

test("Collector Spain, France, generic Europe and Australia remain separate", () => {
  assert.deepEqual(edition("3307215815144").marketRegions, ["ES"]);
  assert.deepEqual(edition("3307215815090").marketRegions, ["FR"]);
  assert.deepEqual(edition("3307215815076").marketRegions, []);
  const australia = physicalEditions.find((entry) => entry.id === "ac-rogue-xbox360-collector-au-pending-barcode");
  assert.ok(australia);
  assert.deepEqual(australia.marketRegions, ["AU"]);
  assert.equal(australia.confidence, "PENDING_IDENTIFIER");
  assert.equal("barcode" in australia, false);
});

test("Classics France is not reused as a Spanish rerelease", () => {
  assert.deepEqual(edition("3307215898055").marketRegions, ["FR"]);
  const spanishClassics = guide.researchTasks.find((entry) => entry.id === "ac-rogue-classics-es");
  assert.ok(spanishClassics);
  assert.equal(spanishClassics.status, "PHYSICAL_VARIANT_NOT_CONFIRMED");
});

test("DLC and Double Pack stay outside Rogue physical editions", () => {
  assert.equal(physicalEditions.some((entry) => /templar|double.?pack|black.?flag/i.test(entry.id)), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac-rogue-templar-legacy-voucher"));
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac-rogue-black-flag-double-pack-compilation"));
});

test("Rogue Xbox overlay contains no PlayStation identifiers", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB|CUSA|PLJM|PLAS)[-_ ]?\d+\b/i);
});
