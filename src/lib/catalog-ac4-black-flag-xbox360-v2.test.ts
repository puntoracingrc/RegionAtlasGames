import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac4-black-flag-xbox360.json";

const guide = rawDocument.guides[0];
const physicalEditions = guide.physicalEditions;

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Black Flag Xbox 360 barcode ${barcode}`);
  return result;
}

test("Black Flag Xbox 360 has one stable canonical identity", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide.game.canonicalCatalogId, "xbox360-assassin-s-creed-iv-black-flag");
  assert.equal(guide.game.canonicalGameId, "assassins-creed-iv-black-flag");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-iv-black-flag-xbox360");
  assert.equal(guide.game.platformSlug, "xbox360");
});

test("confirmed Standard boxes preserve market and packaging boundaries", () => {
  assert.deepEqual(edition("3307215705698").marketRegions, ["DE"]);
  assert.deepEqual(edition("3307215705704").marketRegions, ["CH"]);
  assert.deepEqual(edition("3307215705711").marketRegions, ["IT"]);
  assert.deepEqual(edition("3307215705711").packagingLanguages, ["IT"]);
  assert.deepEqual(edition("008888528128").marketRegions, ["US"]);
  assert.deepEqual(edition("4949244002981").productCodes, ["JES1-00330"]);
  assert.deepEqual(edition("4895094019795").marketRegions, []);
  assert.deepEqual(edition("4895094019788").marketRegions, []);
});

test("Special, Skull, Buccaneer and Black Chest candidates are not assigned invented countries", () => {
  for (const barcode of [
    "3307215705919",
    "3307215705926",
    "3307215706053",
    "3307215706084",
    "3307215706091",
    "3307215706107",
    "3307215706237",
    "3307215706343",
  ]) assert.deepEqual(edition(barcode).marketRegions, [], barcode);
  const taskIds = new Set(guide.researchTasks.map((entry) => entry.id));
  for (const id of ["ac4-special-territory-map", "ac4-skull-territory-map", "ac4-buccaneer-territory-map", "ac4-black-chest-outer-box-map"]) {
    assert.ok(taskIds.has(id), id);
  }
});

test("North American Standard, Limited and Signature remain separate physical editions", () => {
  assert.equal(edition("008888528128").editionType, "STANDARD");
  assert.equal(edition("008888528111").editionType, "LIMITED");
  assert.equal(edition("008888528449").editionType, "SPECIAL");
  assert.equal(edition("008888528449").boxCode, "528449-CVRB1");
});

test("Classics Spain is confirmed while French circulation and other reprints stay unresolved", () => {
  assert.deepEqual(edition("3307215847404").marketRegions, ["ES"]);
  assert.deepEqual(edition("3307215847404").packagingLanguages, ["ES"]);
  assert.deepEqual(edition("3307215791813").marketRegions, []);
  assert.deepEqual(edition("3307215791813").evidenceMarkets, ["FR"]);
  assert.equal(edition("3307215758854").editionType, "BUDGET_REISSUE");
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac4-classics-territory-map"));
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac4-bestseller-identity"));
});

test("Black Flag Xbox overlay blocks PlayStation identifiers and fake disc editions", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB|CUSA|PLJM|PLAS)[-_ ]?\d+\b/i);
  assert.equal(physicalEditions.some((entry) => /disc.?2/i.test(entry.id)), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac4-two-disc-media-map"));
});

test("Not for Resale remains research and is not counted as a retail physical edition", () => {
  assert.equal(physicalEditions.some((entry) => /not-for-resale|nfr/i.test(entry.id)), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac4-not-for-resale-bundle"));
});
