import assert from "node:assert/strict";
import test from "node:test";
import rawOverlay from "../../data/catalog-edition-guides-ac4-black-flag-ps3.json";
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

test("Black Flag PS3 overlay keeps one canonical game and the Double Pack outside", () => {
  assert.equal(rawOverlay.guides.length, 1);
  assert.equal(guide.id, "assassins-creed-iv-black-flag-ps3");
  assert.equal(guide.game.title, "Assassin's Creed IV: Black Flag");
  assert.equal(guide.game.platformSlug, "ps3");
  assert.equal(guide.game.canonicalCatalogId, "ps3-assassin%27s-creed-iv-black-flag");

  const claimed = guide.physicalEditions.flatMap((entry) => entry.catalogIds);
  assert.equal(claimed.includes("ps3-assassin%27s-creed-black-flag-&amp;-rogue"), false);
  assert.equal(claimed.includes("ps3-usa-assassin-s-creed-rogue-black-flag-walmart-edition"), false);
  assert.equal(guide.game.title.includes("& Rogue"), false);
});

test("Black Flag Spain Standard is BLES-01882 and Bonus does not create a physical edition", () => {
  const standard = edition("assassins-creed-iv-black-flag-ps3-europe-standard");
  assert.equal(standard.barcode, "3307215704974");
  assert.equal(standard.serial, "BLES-01882");
  assert.deepEqual(standard.marketRegions, ["ES"]);
  assert.deepEqual(standard.packagingLanguages, ["ES"]);
  assert.deepEqual(standard.softwareLanguages, ["ES", "EN", "FR", "DE", "IT"]);
  assert.deepEqual(standard.catalogIds, ["ps3-assassin%27s-creed-iv-black-flag"]);

  assert.equal(guide.editionFamilies.some((family) => /bonus/i.test(family.label)), false);
  assert.equal(guide.physicalEditions.some((entry) => /bonus/i.test(entry.id)), false);
  assert.equal(guide.researchTasks.find((task) => task.id === "ac4-bf-ps3-bonus-es-packaging")?.status,
    "PHYSICAL_VARIANT_NOT_CONFIRMED");
});

test("Black Flag keeps confirmed regional identities separate from pending markets", () => {
  assert.deepEqual(edition("assassins-creed-iv-black-flag-ps3-europe-germany-standard").marketRegions, ["DE"]);
  assert.deepEqual(edition("assassins-creed-iv-black-flag-ps3-europe-at-ch-standard").marketRegions, ["AT", "CH"]);
  assert.deepEqual(edition("assassins-creed-iv-black-flag-ps3-europe-be-fr-nl-standard").marketRegions, ["BE", "FR", "NL"]);

  const unresolved = edition("assassins-creed-iv-black-flag-ps3-europe-bles-01884-standard");
  assert.equal(unresolved.barcode, "3307215704936");
  assert.equal(unresolved.serial, "BLES-01884");
  assert.deepEqual(unresolved.marketRegions, []);
  assert.equal(unresolved.confidence, "PENDING_IDENTIFIER");

  assert.deepEqual(edition("assassins-creed-iv-black-flag-ps3-asia-standard").marketRegions, []);
  assert.deepEqual(edition("assassins-creed-iv-black-flag-ps3-asia-chinese-version").packagingLanguages, []);
});

test("Black Flag confirmed editions retain exact barcodes and serials", () => {
  const expected = new Map<string, [string | undefined, string | undefined]>([
    ["assassins-creed-iv-black-flag-ps3-spain-special", ["3307215705162", "BLES-01882"]],
    ["assassins-creed-iv-black-flag-ps3-spain-skull", ["3307215705322", undefined]],
    ["assassins-creed-iv-black-flag-ps3-france-skull", ["3307215705278", undefined]],
    ["assassins-creed-iv-black-flag-ps3-australia-special", ["3307215705247", "BLES-01884"]],
    ["assassins-creed-iv-black-flag-ps3-australia-buccaneer", ["3307215705520", undefined]],
    ["assassins-creed-iv-black-flag-ps3-north-america-standard", ["008888348115", "BLUS-31193"]],
    ["assassins-creed-iv-black-flag-ps3-usa-limited", ["008888398110", "BLUS-41035L"]],
    ["assassins-creed-iv-black-flag-ps3-usa-signature", ["008888348429", "BLUS-31193"]],
    ["assassins-creed-iv-black-flag-ps3-asia-standard", ["4895094019757", "BLAS-50643"]],
    ["assassins-creed-iv-black-flag-ps3-asia-chinese-version", ["4895094019740", "BLAS-50660"]],
    ["assassins-creed-iv-black-flag-ps3-korea-standard", ["8809182562489", "BLKS-20430"]],
    ["assassins-creed-iv-black-flag-ps3-japan-standard", ["4949244003025", "BLJM-61056"]],
    ["assassins-creed-iv-black-flag-ps3-spain-essentials", ["3307215846285", "BLES-01882/E"]],
    ["assassins-creed-iv-black-flag-ps3-germany-essentials", ["3307215846254", "BLES-01882/E"]],
  ]);
  for (const [id, [barcode, serial]] of expected) {
    assert.equal(edition(id).barcode, barcode, `${id} barcode`);
    assert.equal(edition(id).serial, serial, `${id} serial`);
  }
});

test("Black Chest and provisional identities remain explicitly incomplete", () => {
  const blackChest = edition("assassins-creed-iv-black-flag-ps3-europe-black-chest");
  assert.equal(blackChest.barcode, undefined);
  assert.deepEqual(blackChest.marketRegions, []);
  assert.deepEqual(blackChest.evidenceMarkets, ["GB"]);
  assert.equal(blackChest.confidence, "HIGH");

  const russian = edition("assassins-creed-iv-black-flag-ps3-russia-special");
  assert.equal(russian.serial, "BLES-01883/RUS");
  assert.equal(russian.barcode, undefined);
  assert.equal(russian.confidence, "PENDING_IDENTIFIER");

  const essentials = edition("assassins-creed-iv-black-flag-ps3-europe-essentials-pending");
  assert.equal(essentials.barcode, "3307215846216");
  assert.deepEqual(essentials.marketRegions, []);
  assert.deepEqual(essentials.packagingLanguages, []);
});

test("Black Flag reuses only unequivocal legacy identities and leaves their routes and prices intact", () => {
  const expectedIds = new Set([
    "ps3-assassin%27s-creed-iv-black-flag",
    "ps3-usa-assassin-s-creed-iv-black-flag",
    "ps3-japon-assassin%27s-creed-iv-black-flag",
    "ps3-assassin%27s-creed-iv-black-flag-special-edition",
    "ps3-assassin%27s-creed-iv-black-flag-skull-edition",
    "ps3-assassin%27s-creed-iv-black-flag-buccaneer-edition",
    "ps3-assassin%27s-creed-iv-black-flag-black-chest-edition",
    "ps3-usa-assassin-s-creed-iv-black-flag-limited-edition",
    "ps3-usa-assassin-s-creed-iv-black-flag-signature-edition",
    "ps3-assassin%27s-creed-iv-black-flag-essentials",
    "ps3-japon-assassin%27s-creed-iv-black-flag-ubi-the-best",
  ]);
  const links = guide.physicalEditions.flatMap((entry) => entry.catalogLinks);
  assert.deepEqual(new Set(links.map((link) => link.catalogId)), expectedIds);
  for (const link of links) {
    const game = getCatalogGame(link.catalogId);
    assert.ok(game, link.catalogId);
    assert.equal(game.listingStatus, "listed", link.catalogId);
    assert.equal(link.href, catalogGamePath(game), link.catalogId);
    if (link.catalogId !== "ps3-japon-assassin%27s-creed-iv-black-flag-ubi-the-best") {
      assert.ok(game.coverUrl, `${link.catalogId} cover`);
    }
  }

  assert.equal(getCatalogGame("ps3-usa-assassin-s-creed-iv-black-flag")?.recommendedPrice, 4.59);
  assert.equal(getCatalogGame("ps3-usa-assassin-s-creed-iv-black-flag-limited-edition")?.recommendedPrice, 92.4);
  assert.equal(getCatalogGame("ps3-usa-assassin-s-creed-iv-black-flag-signature-edition")?.recommendedPrice, 6.89);
});

test("Black Flag Japan Ubi the Best preserves the prior V2 identity", () => {
  const ubi = edition("assassins-creed-iv-black-flag-ps3-japan-ubi-the-best");
  assert.equal(ubi.barcode, "4949244003575");
  assert.equal(ubi.catalogNumber, "BLJM-61273");
  assert.equal(ubi.releaseDate, "2015-06-25");
  assert.deepEqual(ubi.catalogIds, ["ps3-japon-assassin%27s-creed-iv-black-flag-ubi-the-best"]);
});
