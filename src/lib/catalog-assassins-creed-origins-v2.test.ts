import assert from "node:assert/strict";
import test from "node:test";
import acPs4Guides from "../../data/catalog-edition-guides-ac-ps4.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { catalogGamePath } from "./catalog-url";

const GUIDE_ID = "assassins-creed-origins-ps4";

function originsGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(guide);
  assert.equal(guide.schemaVersion, 2);
  return guide;
}

function edition(id: string) {
  const result = originsGuide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(result, `missing Origins physical edition ${id}`);
  return result;
}

test("Origins is one V2 game while every existing public edition keeps its catalog identity", () => {
  const guide = originsGuide();
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassins-creed-origins");
  assert.equal(guide.game.title, "Assassin's Creed Origins");
  assert.equal(
    getCatalogEditionGuides().filter((entry) => entry.id === GUIDE_ID).length,
    1,
  );

  const linkedCatalogIds = [
    "ps4-assassins-creed-origins",
    "ps4-usa-assassin%27s-creed-origins",
    "ps4-assassin%27s-creed-origins-gold-edition",
    "ps4-usa-assassin%27s-creed-origins-gold-edition",
    "ps4-usa-assassin%27s-creed-origins-deluxe-edition",
    "ps4-usa-assassin%27s-creed-origins-gods-collector%27s-edition",
    "ps4-usa-assassin%27s-creed-origins-dawn-of-the-creed-collector%27s-edition",
    "ps4-usa-assassin%27s-creed-origins-legendary-edition",
  ];
  assert.deepEqual(
    guide.physicalEditions.flatMap((entry) => entry.catalogIds).sort(),
    linkedCatalogIds.sort(),
  );
  for (const catalogId of linkedCatalogIds) {
    const game = getCatalogGame(catalogId);
    assert.ok(game, `missing catalog identity ${catalogId}`);
    assert.equal(getCatalogEditionGuide(game)?.id, GUIDE_ID);
    assert.match(catalogGamePath(game), /^\/catalogo\//);
  }

  const legacyAlias = getCatalogGame("ps4-assassin%27s-creed-origins");
  assert.equal(legacyAlias?.id, "ps4-assassins-creed-origins");
  assert.equal(getCatalogEditionGuide(legacyAlias!)?.id, GUIDE_ID);
});

test("Origins Spain uses the inspected owner scan and Portugal remains circulation rather than invented packaging", () => {
  const spain = edition("ac-origins-ps4-standard-es");
  assert.equal(spain.barcode, "3307216025832");
  assert.equal(spain.catalogNumber, "CUSA-05625");
  assert.deepEqual(spain.marketRegions, ["ES", "PT"]);
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.ratingSystems, ["PEGI 18"]);
  assert.deepEqual(spain.scanSetIds, ["ps4-assassins-creed-origins"]);
  assert.equal(getOwnedScanSetById(spain.scanSetIds[0])?.images.length, 3);

  const portugal = edition("ac-origins-ps4-standard-pt-english-sku");
  assert.equal(portugal.barcode, "3307216041641");
  assert.deepEqual(portugal.marketRegions, ["PT"]);
  assert.deepEqual(portugal.packagingLanguages, []);
  assert.equal(portugal.componentLanguageEvidence[0].basis, "DECLARED");

  const pendingPortugal = edition("ac-origins-ps4-standard-pt-pending-3307216021636");
  assert.equal(pendingPortugal.barcode, "3307216021636");
  assert.match(pendingPortugal.notes.join(" "), /PENDING_MAPPING/);
});

test("Origins Standard variants keep regional barcodes, disc families and packaging evidence separate", () => {
  assert.deepEqual(edition("ac-origins-ps4-standard-it").packagingLanguages, ["IT"]);
  assert.deepEqual(edition("ac-origins-ps4-standard-english-3307216025795").packagingLanguages, ["EN"]);
  assert.equal(edition("ac-origins-ps4-standard-fr").barcode, "3307216025801");
  assert.equal(edition("ac-origins-ps4-standard-at-dfi").barcode, "3307216025825");
  assert.equal(edition("ac-origins-ps4-standard-benelux-candidate").barcode, "3307216025818");
  assert.equal(edition("ac-origins-ps4-standard-au").barcode, "3307216021629");

  const primary = edition("ac-origins-ps4-standard-es");
  const alternate = edition("ac-origins-ps4-standard-eu-english-cusa-08393");
  assert.equal(primary.catalogNumber, "CUSA-05625");
  assert.equal(alternate.catalogNumber, "CUSA-08393");
  assert.notEqual(primary.barcode, alternate.barcode);
  assert.match(
    edition("ac-origins-ps4-standard-eu-reprint-pending-3307216025870").notes.join(" "),
    /no se fusiona/i,
  );
});

test("Origins North America, Japan, Korea and Asia stay physically distinct", () => {
  const northAmerica = edition("ac-origins-ps4-standard-na-first-pyramids");
  assert.equal(northAmerica.barcode, "887256028428");
  assert.equal(northAmerica.catalogNumber, "CUSA-05855");
  assert.deepEqual(northAmerica.marketRegions, ["US", "CA"]);
  assert.deepEqual(northAmerica.packagingLanguages, ["EN"]);

  const japan = edition("ac-origins-ps4-standard-jp");
  assert.equal(japan.barcode, "4949244004251");
  assert.equal(japan.catalogNumber, "PLJM-16012");
  assert.deepEqual(japan.marketRegions, ["JP"]);

  const korea = edition("ac-origins-ps4-standard-kr-pending");
  const asia = edition("ac-origins-ps4-standard-asia-en-zh");
  assert.equal(korea.barcode, undefined);
  assert.equal(korea.catalogNumber, undefined);
  assert.equal(asia.barcode, undefined);
  assert.equal(asia.catalogNumber, undefined);
  assert.notEqual(korea.id, asia.id);
});

test("Origins edition families do not collapse distinct Gold, Deluxe or collector boxes", () => {
  const guide = originsGuide();
  assert.deepEqual(guide.editionFamilies.map((family) => family.id), [
    "standard",
    "gold",
    "deluxe",
    "gods-collector",
    "dawn-collector",
    "dawn-legendary",
  ]);

  assert.equal(edition("ac-origins-ps4-gold-eu-cusa-05625").barcode, "3307216025931");
  assert.equal(edition("ac-origins-ps4-gold-eu-cusa-08393").barcode, "3307216025924");
  assert.equal(edition("ac-origins-ps4-gold-fr").barcode, "3307216025948");
  assert.equal(edition("ac-origins-ps4-gold-us").barcode, "887256028527");
  assert.equal(edition("ac-origins-ps4-gold-au").barcode, "3307216021667");

  assert.equal(edition("ac-origins-ps4-deluxe-us").barcode, "887256028565");
  assert.equal(edition("ac-origins-ps4-deluxe-eu-cusa-08393r").catalogNumber, "CUSA-08393R");
  assert.equal(edition("ac-origins-ps4-deluxe-jp-2019").releaseDate, "2019-07-11");

  assert.equal(edition("ac-origins-ps4-gods-collector-us").barcode, "887256032180");
  assert.equal(edition("ac-origins-ps4-gods-collector-eu").barcode, "3307216019015");
  assert.equal(edition("ac-origins-ps4-dawn-collector-us").barcode, "887256032203");
  assert.match(edition("ac-origins-ps4-legendary-legacy-pending").notes.join(" "), /PENDING_VISUAL_VERIFICATION/);
});

test("Origins keeps software evidence separate, preserves prices and leaves the Double Pack independent", () => {
  const english = edition("ac-origins-ps4-standard-english-3307216025795");
  assert.deepEqual(english.packagingLanguages, ["EN"]);
  assert.ok(english.componentLanguageEvidence.some((entry) => (
    entry.component === "INNER_GAME" && entry.languages.includes("ES") && entry.languages.includes("PL")
  )));

  const spanishCatalog = getCatalogGame("ps4-assassins-creed-origins")!;
  assert.equal(spanishCatalog.coverUrl, "/catalog-covers/ps4/escaneos-propios/assassins-creed-origins/assassins-creed-origins-ps4-pal-es-portada-catalogo.webp");
  assert.equal(spanishCatalog.recommendedPrice, 12.33);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-origins")?.recommendedPrice, 10.13);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-origins-legendary-edition")?.recommendedPrice, 723.43);

  const doublePack = getCatalogGame("ps4-double-pack-assassin%27s-creed-odyssey-&#43;-assassin%27s-creed-origins");
  assert.ok(doublePack);
  assert.notEqual(getCatalogEditionGuide(doublePack)?.id, GUIDE_ID);
  assert.match(acPs4Guides.guides[0].evidenceNote, /compilación independiente/);
});
