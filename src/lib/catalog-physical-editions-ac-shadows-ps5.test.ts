import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-shadows-ps5.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-path";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";
import { toCatalogListGame } from "./catalog-list-game";

const LEGACY_IDS = [
  "ps5-assassin-s-creed-shadows",
  "ps5-usa-assassin-s-creed-shadows",
  "ps5-assassin-s-creed-shadows-limited-edition",
  "ps5-usa-assassin-s-creed-shadows-limited-edition",
  "ps5-assassin-s-creed-shadows-special-edition",
  "ps5-usa-assassin-s-creed-shadows-special-edition",
  "ps5-assassin-s-creed-shadows-collector-s-edition",
  "ps5-usa-assassin-s-creed-shadows-collector-s-edition",
  "ps5-assassin-s-creed-shadows-gold-edition",
  "ps5-usa-assassin-s-creed-shadows-steelbook",
] as const;

function guide() {
  const result = getCatalogEditionGuides().find((entry) => entry.id === "assassins-creed-shadows-ps5-worldwide");
  assert.ok(result);
  return result;
}

function editionByBarcode(barcode: string) {
  const result = guide().physicalEditions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Shadows PS5 barcode ${barcode}`);
  return result;
}

test("Shadows PS5 has one canonical game and one explicit platform release", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide().game.title, "Assassin's Creed Shadows");
  assert.equal(guide().game.canonicalGameId, "assassins-creed-shadows");
  assert.equal(guide().game.platformReleaseId, "assassins-creed-shadows-ps5");
  assert.equal(guide().game.canonicalCatalogId, "ps5-assassin-s-creed-shadows");
  assert.equal(
    getCatalogEditionGuides().filter((entry) => entry.game.platformSlug === "ps5" && entry.game.canonicalGameId === "assassins-creed-shadows").length,
    1,
  );
});

test("Standard decomposes Europe and worldwide circulation into verified physical SKUs", () => {
  const expected = [
    "3307216292579",
    "3307216292586",
    "3307216292593",
    "3307216292609",
    "3307216292616",
    "3307216292623",
    "3307216292630",
    "3307216292647",
    "3307216292654",
    "3307216292661",
    "887256116286",
    "4949244013437",
  ];
  const standard = guide().editionFamilies.find((entry) => entry.id === "standard");
  assert.ok(standard);
  assert.equal(standard.physicalEditionIds.length, 12);
  assert.deepEqual(
    standard.physicalEditionIds.map((id) => guide().physicalEditions.find((entry) => entry.id === id)?.barcode),
    expected,
  );
  assert.deepEqual(editionByBarcode("3307216292616").packagingLanguages, ["de", "fr", "it"]);
  assert.deepEqual(editionByBarcode("3307216292623").packagingLanguages, ["it"]);
  assert.deepEqual(editionByBarcode("3307216292630").packagingLanguages, ["pl"]);
  assert.deepEqual(editionByBarcode("3307216292647").evidenceMarkets, ["ES", "PT"]);
  assert.deepEqual(editionByBarcode("3307216292647").packagingLanguages, []);
  assert.deepEqual(editionByBarcode("3307216292593").marketRegions, []);
  assert.deepEqual(editionByBarcode("3307216292609").packagingLanguages, []);
  assert.deepEqual(editionByBarcode("3307216292654").marketRegions, []);
  assert.deepEqual(editionByBarcode("3307216292661").evidenceMarkets, ["NO", "RO"]);
  assert.deepEqual(editionByBarcode("887256116286").evidenceMarkets, ["US", "CA"]);
  assert.deepEqual(editionByBarcode("4949244013437").softwareFamilyCodes, ["PPSA-22101"]);
  assert.equal(editionByBarcode("4949244013437").catalogNumber, "ELJM-30491");
});

test("Limited, Special and Collector families keep EU and US identities separate", () => {
  for (const barcode of [
    "3307216292814",
    "887256116552",
    "3307216292876",
    "3307216292920",
    "3307216292944",
    "887256116569",
    "3307216294559",
    "887256116514",
  ]) {
    assert.equal(editionByBarcode(barcode).releaseStatus, "RELEASED");
  }
  assert.deepEqual(guide().editionFamilies.find((entry) => entry.id === "limited")?.physicalEditionIds.length, 2);
  assert.deepEqual(guide().editionFamilies.find((entry) => entry.id === "special")?.physicalEditionIds.length, 4);
  assert.deepEqual(guide().editionFamilies.find((entry) => entry.id === "collectors")?.physicalEditionIds.length, 2);
  assert.deepEqual(editionByBarcode("3307216294559").evidenceMarkets, ["ES", "FR", "BE", "IT", "PL"]);
  assert.ok(editionByBarcode("887256116569").digitalContents.includes("Sekiryu Character Pack"));
  assert.ok(editionByBarcode("887256116514").physicalContents.includes("Disco del juego base"));
});

test("all Gold physical plans are canceled and contribute zero released editions or price ranges", () => {
  const gold = guide().editionFamilies.find((entry) => entry.id === "gold-canceled");
  assert.ok(gold);
  const releases = guide().physicalEditions.filter((entry) => gold.physicalEditionIds.includes(entry.id));
  assert.deepEqual(releases.map((entry) => entry.barcode), [
    "887256116323",
    "3307216293101",
    "3307216293026",
    "4949244013444",
  ]);
  assert.equal(guide().physicalEditions.some((entry) => entry.barcode === "3307216293095"), false);
  assert.ok(releases.every((entry) => entry.releaseStatus === "CANCELED_PHYSICAL_RELEASE"));
  assert.equal(releases.find((entry) => entry.barcode === "4949244013444")?.catalogNumber, "ELJM-30490");
  assert.equal(guide().physicalEditions.filter((entry) => entry.releaseStatus === "RELEASED").length, 20);

  const goldGame = getCatalogGame("ps5-assassin-s-creed-shadows-gold-edition");
  assert.ok(goldGame);
  const grouped = groupCatalogListGames([toCatalogListGame(goldGame)]);
  assert.equal(grouped[0].physicalEditionGroup?.physicalEditionCount, 0);
  assert.deepEqual(grouped[0].physicalEditionGroup?.priceRanges, {});
  assert.equal(goldGame.recommendedPrice, null);
  assert.equal(goldGame.estimatedPriceComplete, undefined);
  assert.equal(goldGame.estimatedPriceSealed, undefined);
});

test("Target UPC 887256116729 is a case-only bonus and never a PhysicalEdition", () => {
  assert.equal(guide().physicalEditions.some((entry) => entry.barcode === "887256116729"), false);
  const bonus = guide().physicalBonusItems.find((entry) => entry.upc === "887256116729");
  assert.ok(bonus);
  assert.equal(bonus.type, "STEELBOOK_CASE");
  assert.equal(bonus.retailer, "Target");
  assert.equal(bonus.market, "US");
  assert.equal(bonus.includesGame, false);
  assert.deepEqual(bonus.catalogIds, ["ps5-usa-assassin-s-creed-shadows-steelbook"]);

  const steelbookGame = getCatalogGame("ps5-usa-assassin-s-creed-shadows-steelbook");
  assert.ok(steelbookGame);
  const current = getCatalogEditionGuide(steelbookGame);
  assert.equal(current?.currentBonusItemId, bonus.id);
  assert.equal(current?.currentEditionId, undefined);
  const grouped = groupCatalogListGames([toCatalogListGame(steelbookGame)]);
  assert.equal(grouped[0].physicalEditionGroup, undefined);
});

test("Premium remains non-physical, Claws is an expansion, and unsupported markets stay pending", () => {
  assert.equal(guide().editionFamilies.some((entry) => /premium/i.test(entry.id)), false);
  assert.equal(guide().physicalEditions.some((entry) => /premium/i.test(entry.label)), false);
  assert.deepEqual(guide().relatedReleases.map((entry) => ({
    label: entry.label,
    type: entry.type,
    expansionOf: entry.expansionOf,
  })), [{
    label: "Claws of Awaji",
    type: "EXPANSION",
    expansionOf: "assassins-creed-shadows",
  }]);
  const pendingMarkets = new Set(guide().researchTasks.flatMap((entry) => entry.marketRegions));
  for (const market of ["KR", "MX", "BR", "NZ"]) assert.ok(pendingMarkets.has(market));
  assert.equal(
    guide().physicalEditions.some((entry) => entry.marketRegions.some((market) => ["KR", "MX", "BR", "NZ"].includes(market))),
    false,
  );
});

test("legacy routes, covers and prices remain attached to every unmodified catalog identity", () => {
  const expectedPrices: Partial<Record<(typeof LEGACY_IDS)[number], number>> = {
    "ps5-usa-assassin-s-creed-shadows": 20.49,
    "ps5-usa-assassin-s-creed-shadows-collector-s-edition": 191.26,
    "ps5-usa-assassin-s-creed-shadows-limited-edition": 25.88,
    "ps5-usa-assassin-s-creed-shadows-special-edition": 22.17,
    "ps5-usa-assassin-s-creed-shadows-steelbook": 8.31,
  };
  for (const id of LEGACY_IDS) {
    const game = getCatalogGame(id);
    assert.ok(game, id);
    assert.match(game.coverUrl ?? "", /^\/covers\/ps5\/.*shadows.*\.jpg$/);
    assert.match(game.pcPath ?? "", /^\/game\//);
    assert.match(catalogGamePath(game), /^\/catalogo\//);
    if (expectedPrices[id] !== undefined) assert.equal(game.recommendedPrice, expectedPrices[id]);
    assert.equal(getCatalogEditionGuide(game)?.id, guide().id);
  }
});
