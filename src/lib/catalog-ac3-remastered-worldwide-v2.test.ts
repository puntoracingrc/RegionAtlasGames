import assert from "node:assert/strict";
import test from "node:test";
import guideDocument from "../../data/catalog-edition-guides-ac-ps4-worldwide.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";
import { getCatalogRouteRedirect } from "./catalog-route-redirects";
import { toCatalogListGame } from "./catalog-list-game";
import { resolveCatalogGameParam } from "./catalog-url";

const CANONICAL_ID = "ps4-assassins-creed-3-remastered";
const US_ID = "ps4-usa-assassin%27s-creed-iii-remastered";
const GUIDE_ID = "assassins-creed-iii-remastered-ps4";

function ac3Guide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(guide);
  return guide;
}

test("AC III Remastered uses one canonical work with the historical title as an alias", () => {
  const guide = ac3Guide();
  assert.equal(guide.game.canonicalCatalogId, CANONICAL_ID);
  assert.equal(guide.game.title, "Assassin's Creed III Remastered");
  assert.deepEqual(guide.game.aliases, ["Assassin's Creed 3 Remastered"]);
  assert.equal(getCatalogGame(CANONICAL_ID)?.title, "Assassin's Creed 3 Remastered");

  const es = getCatalogGame(CANONICAL_ID)!;
  const us = getCatalogGame(US_ID)!;
  assert.equal(getCatalogEditionGuide(es)?.id, GUIDE_ID);
  assert.equal(getCatalogEditionGuide(us)?.id, GUIDE_ID);

  const grouped = groupCatalogListGames([toCatalogListGame(es), toCatalogListGame(us)]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].id, CANONICAL_ID);
  assert.equal(grouped[0].title, "Assassin's Creed 3 Remastered");
});

test("the owned Spanish box remains Spanish while Portugal is circulation evidence only", () => {
  const guide = ac3Guide();
  const spanish = guide.physicalEditions.find((edition) => edition.id === "ac3-remastered-ps4-europe-es");
  assert.ok(spanish);
  assert.equal(spanish.barcode, "3307216111672");
  assert.deepEqual(spanish.productCodes, ["CUSA-11560"]);
  assert.deepEqual(spanish.marketRegions, ["ES"]);
  assert.deepEqual(spanish.evidenceMarkets, ["ES", "PT"]);
  assert.deepEqual(spanish.packagingLanguages, ["es"]);
  assert.deepEqual(spanish.softwareLanguages, ["es"]);
  assert.deepEqual(spanish.scanSetIds, [CANONICAL_ID]);
  assert.equal(spanish.confidence, "CONFIRMED_PHYSICAL_COPY");
  assert.equal(guide.physicalEditions.some((edition) => edition.marketRegions.includes("PT")), false);

  const portugal = guide.researchTasks.find((task) => task.id === "ac3-remastered-portugal-dedicated-packaging");
  assert.equal(portugal?.status, "UNCONFIRMED");
  assert.deepEqual(portugal?.marketRegions, ["PT"]);
});

test("the worldwide standard family keeps every backed barcode and pending identifier separate", () => {
  const guide = ac3Guide();
  const standard = guide.editionFamilies.find((family) => family.id === "standard");
  assert.ok(standard);
  assert.equal(standard.physicalEditionIds.length, 15);
  assert.equal(guide.physicalEditions.length, 15);

  const byBarcode = new Map(guide.physicalEditions.flatMap((edition) => (
    edition.barcode ? [[edition.barcode, edition] as const] : []
  )));
  assert.equal(byBarcode.size, 12);
  assert.deepEqual(byBarcode.get("3307216111634")?.packagingLanguages, ["de", "fr", "it"]);
  assert.deepEqual(byBarcode.get("3307216120445")?.packagingLanguages, ["fr", "nl"]);
  assert.deepEqual(byBarcode.get("887256039387")?.marketRegions, ["US", "CA"]);
  assert.deepEqual(byBarcode.get("4949244005333")?.productCodes, ["PLJM-16388"]);

  const japan = guide.physicalEditions.find((edition) => edition.id === "ac3-remastered-ps4-asia-jp");
  const korea = guide.physicalEditions.find((edition) => edition.id === "ac3-remastered-ps4-asia-kr");
  const asia = guide.physicalEditions.find((edition) => edition.id === "ac3-remastered-ps4-asia-zh-en");
  assert.ok(japan && korea && asia);
  assert.notEqual(japan.id, korea.id);
  assert.notEqual(korea.id, asia.id);
  assert.deepEqual(korea.packagingLanguages, []);
  assert.deepEqual(korea.softwareLanguages, ["ko", "ja", "zh", "en"]);
  assert.equal(asia.confidence, "PENDING_IDENTIFIER");
  assert.equal(asia.barcode, undefined);

  const latam = guide.physicalEditions.find((edition) => edition.id === "ac3-remastered-ps4-latin-america-spanish-cover");
  assert.equal(latam?.confidence, "PENDING_IDENTIFIER");
  assert.deepEqual(latam?.packagingLanguages, []);
});

test("both legacy public routes still resolve and retain their regional selection", () => {
  const legacyEs = getCatalogRouteRedirect("assassin-s-creed-iii-remastered-ps4-pal-es");
  assert.equal(legacyEs?.targetCatalogId, CANONICAL_ID);

  const us = resolveCatalogGameParam("assassin-s-creed-iii-remastered-ps4-pal-us");
  assert.equal(us?.id, US_ID);
  assert.equal(getCatalogEditionGuide(us!)?.currentEditionId, "ac3-remastered-ps4-north-america-us-ca");
  assert.equal(getCatalogEditionGuide(getCatalogGame(CANONICAL_ID)!)?.currentEditionId, "ac3-remastered-ps4-europe-es");
});

test("the AC PS4 guide document remains schema V2", () => {
  assert.equal(guideDocument.schemaVersion, 2);
  assert.equal(guideDocument.guides[0].schemaVersion, 2);
  assert.equal(guideDocument.guides[0].game.canonicalCatalogId, CANONICAL_ID);
});
