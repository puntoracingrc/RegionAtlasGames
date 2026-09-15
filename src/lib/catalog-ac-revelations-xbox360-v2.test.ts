import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-revelations-xbox360.json";
import { getCatalogGame } from "./catalog";

const guide = rawDocument.guides[0];
type RawEdition = { id: string; barcode?: string; editionType: string; marketRegions?: string[]; evidenceMarkets?: string[] };
const physicalEditions = guide.physicalEditions as RawEdition[];

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Revelations Xbox 360 barcode ${barcode}`);
  return result;
}

test("Revelations Xbox 360 has one minimal canonical route", () => {
  assert.equal(guide.game.canonicalGameId, "assassins-creed-revelations");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-revelations-xbox360");
  const game = getCatalogGame("xbox360-assassin-s-creed-revelations");
  assert.ok(game);
  assert.equal(game.slug, "assassin-s-creed-revelations");
  assert.equal(game.coverUrl, null);
  assert.equal(game.recommendedPrice, null);
});

test("Spanish retail evidence does not invent Spanish packaging", () => {
  const spanish = edition("3307215590010");
  assert.deepEqual(spanish.evidenceMarkets, ["ES"]);
  assert.equal(spanish.marketRegions, undefined);
});

test("Collector, Special, Animus, Ottoman and Platinum remain distinct", () => {
  assert.equal(edition("3307215589281").editionType, "COLLECTOR");
  assert.equal(edition("3307215589236").editionType, "SPECIAL");
  assert.equal(edition("3307215589274").editionType, "COLLECTOR");
  assert.equal(edition("3307215628171").editionType, "SPECIAL");
  assert.equal(physicalEditions.filter((entry) => entry.barcode === "008888526841").length, 2);
  assert.ok(physicalEditions.some((entry) => entry.barcode === "008888526841" && entry.editionType === "BUDGET_REISSUE"));
});

test("unresolved Classics barcode and Ottoman typo stay outside physical editions", () => {
  assert.equal(physicalEditions.some((entry) => entry.barcode === "3307215693865"), false);
  assert.equal(physicalEditions.some((entry) => entry.barcode === "3308215628164"), false);
  assert.ok(guide.researchTasks.some((entry) => entry.notes.some((note) => note.includes("3307215693865"))));
  assert.ok(guide.researchTasks.some((entry) => entry.notes.some((note) => note.includes("3308215628164"))));
});

test("Revelations Xbox overlay contains no PlayStation identifiers or known platform-only barcodes", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB)[-_ ]?\d+\b/i);
  for (const forbidden of ["008888396840", "3307215589809", "3307215589670"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
