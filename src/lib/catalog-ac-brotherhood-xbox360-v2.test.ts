import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-brotherhood-xbox360.json";
import { getCatalogGame } from "./catalog";

const guide = rawDocument.guides[0];
type RawEdition = { id: string; barcode?: string; editionType: string; marketRegions?: string[] };
const physicalEditions = guide.physicalEditions as RawEdition[];

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Brotherhood Xbox 360 barcode ${barcode}`);
  return result;
}

test("Brotherhood Xbox 360 has one minimal canonical route", () => {
  assert.equal(guide.game.canonicalGameId, "assassins-creed-brotherhood");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-brotherhood-xbox360");
  const game = getCatalogGame("xbox360-assassin-s-creed-brotherhood");
  assert.ok(game);
  assert.equal(game.slug, "assassin-s-creed-brotherhood");
  assert.equal(game.coverUrl, null);
  assert.equal(game.recommendedPrice, null);
});

test("Alhambra Spain and Da Vinci Germany remain distinct physical identities", () => {
  const alhambra = edition("3307219942815");
  const daVinci = edition("3307219942792");
  assert.notEqual(alhambra.id, daVinci.id);
  assert.deepEqual(alhambra.marketRegions, ["ES"]);
  assert.deepEqual(daVinci.marketRegions, ["DE"]);
  assert.match(alhambra.id, /alhambra/);
  assert.match(daVinci.id, /da-vinci/);
});

test("Brotherhood keeps Codex, Collector, Special, Auditore and budget rereleases separate", () => {
  assert.equal(edition("3307217934249").editionType, "COLLECTOR");
  assert.equal(edition("008888226253").editionType, "COLLECTOR");
  assert.equal(edition("3307219904080").editionType, "SPECIAL");
  assert.equal(edition("3307219903106").editionType, "COLLECTOR");
  assert.equal(edition("3307219951442").editionType, "BUDGET_REISSUE");
});

test("the Double Pack is not counted as a Brotherhood physical edition", () => {
  assert.equal(physicalEditions.some((entry) => /double-pack/.test(entry.id)), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "brotherhood-xbox360-double-pack"));
});

test("Brotherhood Xbox overlay contains no PlayStation identifiers or known platform-only UPC", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB)[-_ ]?\d+\b/i);
  assert.equal(serialized.includes("008888346258"), false);
});
