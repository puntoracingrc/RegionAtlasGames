import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac1-xbox360.json";
import { getCatalogGame } from "./catalog";

const guide = rawDocument.guides[0];
type RawEdition = {
  barcode?: string;
  editionType: string;
  marketRegions?: string[];
  evidenceMarkets?: string[];
  sharedDiscId?: string;
};
const physicalEditions = guide.physicalEditions as RawEdition[];

function edition(barcode: string) {
  const result = physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing AC1 Xbox 360 barcode ${barcode}`);
  return result;
}

test("AC1 Xbox 360 has one canonical route without invented cover or price", () => {
  assert.equal(guide.game.canonicalGameId, "assassins-creed");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-xbox360");
  const game = getCatalogGame("xbox360-assassin-s-creed");
  assert.ok(game);
  assert.equal(game.slug, "assassin-s-creed");
  assert.equal(game.platformSlug, "xbox360");
  assert.equal(game.coverUrl, null);
  assert.equal(game.recommendedPrice, null);
});

test("AC1 keeps Standard, Limited, Collector and budget rereleases distinct", () => {
  assert.equal(edition("008888523390").editionType, "STANDARD");
  assert.equal(edition("008888593393").editionType, "LIMITED");
  assert.equal(edition("3307210334787").editionType, "COLLECTOR");
  assert.equal(edition("3307210451422").editionType, "BUDGET_REISSUE");
  assert.deepEqual(edition("3307212283250").marketRegions, ["AU"]);
  assert.deepEqual(edition("3307212283250").evidenceMarkets, ["ES"]);
});

test("AC1 limits the verified XeMID and Media ID to the Japanese shared disc", () => {
  const disc = guide.sharedDiscs[0];
  assert.equal(disc.xemid, "US200406J0X11");
  assert.equal(disc.mediaId, "795CE63E");
  assert.deepEqual(
    physicalEditions.filter((entry) => entry.sharedDiscId === disc.id).map((entry) => entry.marketRegions?.[0]),
    ["JP", "JP"],
  );
});

test("AC1 Xbox overlay contains no PlayStation identifiers", () => {
  const serialized = JSON.stringify(rawDocument);
  assert.doesNotMatch(serialized, /\b(?:BLES|BLUS|BLJM|BLAS|BLKS|NPEB|NPUB|NPJB)[-_ ]?\d+\b/i);
});
