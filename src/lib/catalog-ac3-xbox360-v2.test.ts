import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac3-xbox360.json";

const guide = rawDocument.guides[0];
const physicalEditions = guide.physicalEditions;

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing ACIII Xbox 360 barcode ${barcode}`);
  return result;
}

test("ACIII Xbox 360 keeps a stable canonical work and platform release", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide.game.platformSlug, "xbox360");
  assert.equal(guide.game.canonicalCatalogId, "xbox360-assassin-s-creed-iii");
  assert.equal(guide.game.canonicalGameId, "assassins-creed-iii");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-iii-xbox360");
});

test("confirmed Standard releases stay separate from pending regional identities", () => {
  assert.deepEqual(edition("3307215637715").marketRegions, ["FR"]);
  assert.deepEqual(edition("008888527237").marketRegions, ["US"]);
  assert.deepEqual(edition("4949244002677").marketRegions, ["JP"]);
  assert.deepEqual(edition("4949244002677").productCodes, ["JES1-00262"]);
  const spain = physicalEditions.find((entry) => entry.id === "ac3-xbox360-standard-es-pending-barcode");
  assert.ok(spain);
  assert.equal(spain.confidence, "PENDING_IDENTIFIER");
  assert.equal("barcode" in spain, false);
});

test("territory candidates remain unmapped and retain explicit research gates", () => {
  for (const barcode of [
    "3307215643082",
    "3307215643129",
    "3307215643136",
    "3307215637456",
    "3307215637494",
    "3307215637395",
    "3307215637371",
    "3307215637111",
    "3307215692745",
    "3307215692752",
  ]) {
    assert.deepEqual(edition(barcode).marketRegions, [], barcode);
  }
  const taskIds = new Set(guide.researchTasks.map((entry) => entry.id));
  for (const id of [
    "ac3-special-territory-map",
    "ac3-join-or-die-territory-map",
    "ac3-freedom-territory-map",
    "ac3-washington-territory-map",
    "ac3-classics-territory-map",
  ]) assert.ok(taskIds.has(id), id);
});

test("Classics boxes are not collapsed into one European edition", () => {
  const classics = guide.editionFamilies.find((entry) => entry.id === "classics");
  assert.ok(classics);
  assert.equal(classics.physicalEditionIds.length, 8);
  assert.deepEqual(edition("4012160021548").marketRegions, ["DE"]);
  assert.deepEqual(edition("3307215770344").marketRegions, []);
  assert.deepEqual(edition("3307215770344").evidenceMarkets, ["PT"]);
  assert.deepEqual(edition("3307215770344").packagingLanguages, ["EN"]);
});

test("ACIII Xbox overlay contains no PlayStation identifiers or borrowed PS3 barcode", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB)[-_ ]?\d+\b/i);
  assert.doesNotMatch(serialized, /3307215636848/);
});

test("disc two and uncertain North American editions remain research, not fake editions", () => {
  assert.equal(physicalEditions.some((entry) => /disc.?2/i.test(entry.id)), false);
  assert.equal(physicalEditions.some((entry) => entry.barcode === "008888527374"), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac3-two-disc-media-map"));
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac3-na-alternate-008888527374"));
});
