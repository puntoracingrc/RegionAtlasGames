import assert from "node:assert/strict";
import test from "node:test";
import acPs4Guides from "../../data/catalog-edition-guides-ac-ps4.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-url";

const GUIDE_ID = "assassins-creed-rogue-remastered-ps4";

function rogueGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(guide);
  assert.equal(guide.schemaVersion, 2);
  return guide;
}

function edition(id: string) {
  const result = rogueGuide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(result, `missing Rogue Remastered physical edition ${id}`);
  return result;
}

test("Rogue Remastered keeps one canonical game and the existing ES/US deep links", () => {
  const guide = rogueGuide();
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassins-creed-rogue-remastered");
  assert.equal(guide.game.title, "Assassin's Creed Rogue Remastered");
  assert.deepEqual(guide.editionFamilies.map((family) => family.id), ["standard"]);
  assert.equal(guide.physicalEditions.length, 14);

  for (const catalogId of [
    "ps4-assassins-creed-rogue-remastered",
    "ps4-usa-assassin%27s-creed-rogue-remastered",
  ]) {
    const game = getCatalogGame(catalogId);
    assert.ok(game);
    assert.equal(getCatalogEditionGuide(game)?.id, GUIDE_ID);
    assert.match(catalogGamePath(game), /^\/catalogo\//);
  }

  const legacyAlias = getCatalogGame("ps4-assassin%27s-creed-rogue-remastered");
  assert.equal(legacyAlias?.id, "ps4-assassins-creed-rogue-remastered");
  assert.equal(getCatalogEditionGuide(legacyAlias!)?.id, GUIDE_ID);
});

test("Rogue Spain is confirmed while Portuguese circulation never creates PT packaging", () => {
  const spain = edition("ac-rogue-remastered-ps4-standard-es");
  assert.equal(spain.barcode, "3307216044505");
  assert.equal(spain.catalogNumber, "CUSA-10123");
  assert.deepEqual(spain.marketRegions, ["ES", "PT"]);
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.scanSetIds, []);
  assert.match(spain.notes.join(" "), /PENDING_COVER_EVIDENCE/);
  assert.match(spain.notes.join(" "), /MA15\+/);

  assert.equal(
    rogueGuide().physicalEditions.some((entry) => entry.marketRegions.includes("PT") && entry.packagingLanguages.includes("PT")),
    false,
  );
});

test("Rogue European EANs remain separate and marketplace countries do not invent packaging", () => {
  assert.equal(edition("ac-rogue-remastered-ps4-standard-fr-3307216044451").barcode, "3307216044451");
  assert.equal(edition("ac-rogue-remastered-ps4-standard-fr-multilingual-3307216044499").barcode, "3307216044499");
  assert.equal(edition("ac-rogue-remastered-ps4-standard-de").barcode, "3307216044437");

  const uk = edition("ac-rogue-remastered-ps4-standard-gb");
  assert.equal(uk.barcode, "3307216044475");
  assert.deepEqual(uk.packagingLanguages, ["EN"]);

  const international = edition("ac-rogue-remastered-ps4-standard-eu-international-3307216044512");
  assert.equal(international.barcode, "3307216044512");
  assert.deepEqual(international.packagingLanguages, ["EN"]);
  assert.match(international.notes.join(" "), /no la convierte en packaging argentino/i);

  const central = edition("ac-rogue-remastered-ps4-standard-central-eu-3307216044482");
  assert.equal(central.barcode, "3307216044482");
  assert.deepEqual(central.marketRegions, ["AT", "CH", "BE", "BG"]);
  assert.equal(central.packagingLanguages.length, 0);

  const benelux = edition("ac-rogue-remastered-ps4-standard-benelux");
  assert.equal(benelux.barcode, "3307216044529");
  assert.deepEqual(benelux.marketRegions, ["NL", "BE"]);
});

test("Rogue Poland retains 3307216044536 as a manufacturer reference, never an EAN", () => {
  const poland = edition("ac-rogue-remastered-ps4-standard-poland-cenega-pending");
  assert.equal(poland.barcode, undefined);
  assert.equal(poland.boxCode, "3307216044536");
  assert.match(poland.notes.join(" "), /no como EAN/i);
  assert.match(poland.notes.join(" "), /3307216044482/);
});

test("Rogue Australia, North America, Japan, Korea and Asia retain exact regional identities", () => {
  const australia = edition("ac-rogue-remastered-ps4-standard-au");
  assert.equal(australia.barcode, "3307216044444");
  assert.equal(australia.catalogNumber, "CUSA-10123");
  assert.deepEqual(australia.marketRegions, ["AU"]);

  const northAmerica = edition("ac-rogue-remastered-ps4-standard-na");
  assert.equal(northAmerica.barcode, "887256037499");
  assert.equal(northAmerica.catalogNumber, "CUSA-10158");
  assert.deepEqual(northAmerica.marketRegions, ["US", "CA", "MX"]);
  assert.deepEqual(northAmerica.packagingLanguages, ["EN", "FR", "ES"]);

  const japan = edition("ac-rogue-remastered-ps4-standard-jp");
  assert.equal(japan.barcode, "4949244004534");
  assert.equal(japan.catalogNumber, "PLJM-16169");
  assert.deepEqual(japan.packagingLanguages, ["JA"]);

  const korea = edition("ac-rogue-remastered-ps4-standard-kr-pending");
  const asia = edition("ac-rogue-remastered-ps4-standard-asia-en-zh");
  assert.equal(korea.barcode, undefined);
  assert.equal(korea.catalogNumber, undefined);
  assert.equal(asia.barcode, undefined);
  assert.equal(asia.catalogNumber, undefined);
  assert.notEqual(korea.id, asia.id);
  assert.match(asia.notes.join(" "), /no identifica esta caja Reg\.3/);
});

test("Rogue separates software languages from packaging and preserves catalog prices and covers", () => {
  const europe = edition("ac-rogue-remastered-ps4-standard-es");
  assert.deepEqual(europe.packagingLanguages, ["ES"]);
  assert.ok(europe.componentLanguageEvidence.some((entry) => (
    entry.component === "INNER_GAME" && entry.languages.includes("IT")
  )));

  const northAmerica = edition("ac-rogue-remastered-ps4-standard-na");
  assert.ok(northAmerica.componentLanguageEvidence.some((entry) => (
    entry.component === "INNER_GAME" && entry.languages.includes("PT")
  )));

  const spanishCatalog = getCatalogGame("ps4-assassins-creed-rogue-remastered")!;
  assert.equal(spanishCatalog.coverUrl, "/covers/ps4/assassins-creed-rogue-remastered.jpg");
  assert.equal(spanishCatalog.recommendedPrice, 15);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-rogue-remastered")?.recommendedPrice, 15.52);

  const rawGuide = acPs4Guides.guides.find((entry) => entry.id === GUIDE_ID);
  assert.ok(rawGuide);
  assert.match(rawGuide.evidenceNote, /5411313912082/);
  assert.match(rawGuide.evidenceNote, /Ninguno se promociona/);
});
