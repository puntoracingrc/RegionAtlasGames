import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac2-xbox360.json";
import { getCatalogGame } from "./catalog";

const guide = rawDocument.guides[0];
type RawEdition = { id: string; barcode?: string; editionType: string; packagingLanguages?: string[]; softwareLanguages?: string[] };
const physicalEditions = guide.physicalEditions as RawEdition[];

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing ACII Xbox 360 barcode ${barcode}`);
  return result;
}

test("ACII Xbox 360 has one minimal canonical route", () => {
  assert.equal(guide.game.canonicalGameId, "assassins-creed-ii");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-ii-xbox360");
  const game = getCatalogGame("xbox360-assassin-s-creed-ii");
  assert.ok(game);
  assert.equal(game.slug, "assassin-s-creed-ii");
  assert.equal(game.coverUrl, null);
  assert.equal(game.recommendedPrice, null);
});

test("ACII preserves confirmed Spanish packaging and software languages separately", () => {
  assert.deepEqual(edition("3307211666658").packagingLanguages, ["es"]);
  assert.deepEqual(edition("3307211666658").softwareLanguages, ["es", "en", "fr", "de", "it"]);
});

test("ACII keeps editions and compilation boundaries explicit", () => {
  assert.ok(physicalEditions.some((entry) => entry.id === "ac2-xbox360-black-eu" && entry.editionType === "COLLECTOR"));
  assert.ok(physicalEditions.some((entry) => entry.id === "ac2-xbox360-white-eu" && entry.editionType === "SPECIAL"));
  assert.equal(edition("3307212315128").editionType, "SPECIAL");
  assert.equal(physicalEditions.some((entry) => entry.barcode === "3307215624517"), false);
  assert.ok(guide.researchTasks.some((entry) => entry.id === "ac2-xbox360-compilation-ac1-ac2"));
});

test("ambiguous Black barcode stays only in research tasks", () => {
  assert.equal(physicalEditions.some((entry) => entry.barcode === "3307211669727"), false);
  assert.ok(guide.researchTasks.some((entry) => entry.notes.some((note) => note.includes("3307211669727"))));
});

test("ACII Xbox overlay contains no PlayStation identifiers or known platform-only barcodes", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB)[-_ ]?\d+\b/i);
  for (const forbidden of ["4949244001823", "3307211669673", "3307211669680", "3307211667167"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
