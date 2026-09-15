import assert from "node:assert/strict";
import test from "node:test";
import rawOverlay from "../../data/catalog-edition-guides-ac-rogue-ps3.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import {
  normalizeCatalogEditionGuide,
  type RawCatalogEditionGuide,
} from "./catalog-edition-guides";

const guide = normalizeCatalogEditionGuide(
  rawOverlay.guides[0] as RawCatalogEditionGuide,
);

function edition(id: string) {
  const value = guide.physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing ${id}`);
  return value;
}

test("Rogue PS3 overlay keeps one canonical game and both Double Pack identities outside", () => {
  assert.equal(rawOverlay.guides.length, 1);
  assert.equal(guide.id, "assassins-creed-rogue-ps3");
  assert.equal(guide.game.title, "Assassin's Creed Rogue");
  assert.equal(guide.game.platformSlug, "ps3");
  assert.equal(guide.game.canonicalCatalogId, "ps3-assassin%27s-creed-rogue");

  const claimed = guide.physicalEditions.flatMap((entry) => entry.catalogIds);
  assert.equal(claimed.includes("ps3-assassin%27s-creed-black-flag-&amp;-rogue"), false);
  assert.equal(claimed.includes("ps3-usa-assassin-s-creed-rogue-black-flag-walmart-edition"), false);
  assert.equal(guide.game.title.includes("Black Flag"), false);
});

test("Rogue Spain Standard has the exact physical identity and language dimensions", () => {
  const standard = edition("assassins-creed-rogue-ps3-europe-standard");
  assert.equal(standard.barcode, "3307215812327");
  assert.equal(standard.serial, "BLES-02061");
  assert.deepEqual(standard.marketRegions, ["ES"]);
  assert.deepEqual(standard.packagingLanguages, ["ES"]);
  assert.deepEqual(standard.softwareLanguages, ["ES", "EN", "FR", "DE", "IT"]);
  assert.deepEqual(standard.catalogIds, ["ps3-assassin%27s-creed-rogue"]);
});

test("Rogue keeps European candidates and prior O113/O114 decisions explicit", () => {
  const generic = edition("assassins-creed-rogue-ps3-europe-generic-standard");
  assert.equal(generic.barcode, "3307215812174");
  assert.equal(generic.serial, "BLES-02061");
  assert.deepEqual(generic.marketRegions, []);
  assert.equal(generic.confidence, "PENDING_IDENTIFIER");

  const german = edition("assassins-creed-rogue-ps3-europe-standard-o113");
  assert.equal(german.barcode, "3307215812303");
  assert.deepEqual(german.marketRegions, []);
  assert.deepEqual(german.packagingLanguages, []);
  assert.deepEqual(german.componentLanguageEvidence[0].languages, ["DE"]);
  assert.equal(german.componentLanguageEvidence[0].basis, "DECLARED");
  assert.equal(german.componentLanguageEvidence[0].exhaustive, false);
  assert.equal(german.images[0]?.key, "ac-ps3-regional-o113-front");
  assert.equal(german.images[0]?.sha256, "b7366c8fe9115ea54d84b55721dd1d9dbba9498e4b531580c966a992a706cb4f");

  const french = edition("assassins-creed-rogue-ps3-europe-standard-o114");
  assert.equal(french.barcode, "3307215812273");
  assert.deepEqual(french.marketRegions, []);
  assert.deepEqual(french.componentLanguageEvidence[0].languages, ["FR"]);
});

test("Rogue Standard and Limited US are not split without physical evidence", () => {
  const standard = edition("assassins-creed-rogue-ps3-north-america-standard");
  assert.equal(standard.barcode, "887256000134");
  assert.equal(standard.serial, "BLUS-31465");
  assert.deepEqual(standard.catalogIds, ["ps3-usa-assassin-s-creed-rogue"]);

  const limitedLegacyId = "ps3-usa-assassin-s-creed-rogue-limited-edition";
  assert.equal(guide.physicalEditions.flatMap((entry) => entry.catalogIds).includes(limitedLegacyId), false);
  assert.equal(guide.editionFamilies.some((family) => family.id === "limited"), false);
  assert.equal(guide.researchTasks.find((task) => task.id === "ac-rogue-ps3-us-standard-limited-separation")?.status,
    "PHYSICAL_VARIANT_NOT_CONFIRMED");
  assert.equal(getCatalogGame(limitedLegacyId)?.recommendedPrice, 8.9);
});

test("Rogue confirmed regional identifiers remain exact", () => {
  const expected = new Map<string, [string | undefined, string | undefined]>([
    ["assassins-creed-rogue-ps3-australia-standard", ["3307215812365", "BLES-02061"]],
    ["assassins-creed-rogue-ps3-korea-standard", ["8809182562533", "BLKS-20499"]],
    ["assassins-creed-rogue-ps3-japan-standard", ["4949244003537", "BLJM-61208"]],
    ["assassins-creed-rogue-ps3-europe-collector", ["3307215814956", "BLES-02062"]],
    ["assassins-creed-rogue-ps3-australia-collector", ["3307215815052", "BLES-02062"]],
    ["assassins-creed-rogue-ps3-russia-collector", ["4603752010004", "BLES-02062/RUS"]],
  ]);
  for (const [id, [barcode, serial]] of expected) {
    assert.equal(edition(id).barcode, barcode, `${id} barcode`);
    assert.equal(edition(id).serial, serial, `${id} serial`);
  }
});

test("Rogue Essentials stays European and does not invent Spanish packaging", () => {
  const essentials = edition("assassins-creed-rogue-ps3-europe-essentials");
  assert.equal(essentials.barcode, "3307215944783");
  assert.deepEqual(essentials.marketRegions, []);
  assert.deepEqual(essentials.evidenceMarkets, ["ES"]);
  assert.deepEqual(essentials.packagingLanguages, []);
  assert.equal(essentials.confidence, "PENDING_IDENTIFIER");
  assert.deepEqual(essentials.catalogIds, ["ps3-assassin%27s-creed-rogue-essentials"]);
});

test("Rogue reuses only unequivocal legacy identities and preserves their routes and prices", () => {
  const expectedIds = new Set([
    "ps3-assassin%27s-creed-rogue",
    "ps3-usa-assassin-s-creed-rogue",
    "ps3-japon-assassin%27s-creed-rogue",
    "ps3-assassin%27s-creed-rogue-collector%27s-edition",
    "ps3-assassin%27s-creed-rogue-essentials",
    "ps3-japon-assassin%27s-creed-rogue-ubi-the-best",
  ]);
  const links = guide.physicalEditions.flatMap((entry) => entry.catalogLinks);
  assert.deepEqual(new Set(links.map((link) => link.catalogId)), expectedIds);
  for (const link of links) {
    const game = getCatalogGame(link.catalogId);
    assert.ok(game, link.catalogId);
    assert.equal(game.listingStatus, "listed", link.catalogId);
    assert.equal(link.href, catalogGamePath(game), link.catalogId);
    if (link.catalogId !== "ps3-japon-assassin%27s-creed-rogue-ubi-the-best") {
      assert.ok(game.coverUrl, `${link.catalogId} cover`);
    }
  }

  assert.equal(getCatalogGame("ps3-usa-assassin-s-creed-rogue")?.recommendedPrice, 6.94);
  assert.equal(getCatalogGame("ps3-usa-assassin-s-creed-rogue-greatest-hits")?.recommendedPrice, 5.75);
  assert.equal(guide.physicalEditions.flatMap((entry) => entry.catalogIds)
    .includes("ps3-usa-assassin-s-creed-rogue-greatest-hits"), false);
  assert.equal(guide.physicalEditions.flatMap((entry) => entry.catalogIds)
    .includes("ps3-assassin%27s-creed-rogue-not-for-resale"), false);
});

test("Rogue Japan Ubi the Best preserves and completes the prior V2 identity", () => {
  const ubi = edition("assassins-creed-rogue-ps3-japan-ubi-the-best");
  assert.equal(ubi.barcode, "4949244003926");
  assert.equal(ubi.catalogNumber, "BLJM-61334");
  assert.equal(ubi.releaseDate, "2016-03-03");
  assert.deepEqual(ubi.catalogIds, ["ps3-japon-assassin%27s-creed-rogue-ubi-the-best"]);
});
