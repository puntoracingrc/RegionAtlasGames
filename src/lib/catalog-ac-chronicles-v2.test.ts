import assert from "node:assert/strict";
import test from "node:test";
import rawGuideData from "../../data/catalog-edition-guides-ac-chronicles.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-url";

const GUIDE_ID = "assassins-creed-chronicles-ps4";
const CONTENTS = [
  "Assassin's Creed Chronicles: China",
  "Assassin's Creed Chronicles: India",
  "Assassin's Creed Chronicles: Russia",
];

function guide() {
  const value = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(value);
  return value;
}

test("Chronicles is one PS4 compilation across the preserved ES, US and JP catalog identities", () => {
  const expected = guide();
  assert.equal(expected.schemaVersion, 2);
  assert.equal(expected.game.title, "Assassin's Creed Chronicles");
  assert.equal(expected.game.canonicalCatalogId, "ps4-assassin%27s-creed-chronicles");
  assert.ok(expected.physicalEditions.every((entry) => entry.editionType === "COMPILATION"));
  assert.ok(expected.physicalEditions.every((entry) => CONTENTS.every((title) => entry.physicalContents.includes(title))));

  for (const id of [
    "ps4-assassin%27s-creed-chronicles",
    "ps4-usa-assassin%27s-creed-chronicles",
    "ps4-japon-assassin%27s-creed-chronicles",
  ]) {
    const game = getCatalogGame(id);
    assert.ok(game);
    assert.equal(getCatalogEditionGuide(game)?.id, GUIDE_ID);
  }
});

test("Chronicles keeps the European CUSA across distinct physical EANs", () => {
  const editions = guide().physicalEditions;
  const europe = editions.filter((entry) => entry.catalogNumber === "CUSA-03440" || entry.serial === "CUSA-03440");
  const barcodes = new Set(europe.map((entry) => entry.barcode).filter(Boolean));
  assert.ok(barcodes.has("3307215916285"));
  assert.ok(barcodes.has("3307215916254"));
  assert.ok(barcodes.has("3307215916247"));
  assert.ok(barcodes.has("3307215916230"));
  assert.ok(barcodes.has("3307215916223"));
  assert.ok(barcodes.has("3307215916308"));
  assert.ok(barcodes.has("3307215916278"));
  assert.ok(barcodes.has("3307215916315"));
  assert.equal(barcodes.has("3307215916322"), false);
});

test("Chronicles preserves packaging evidence without converting software or retailer languages", () => {
  const editions = new Map(guide().physicalEditions.map((entry) => [entry.id, entry]));
  const spanish = editions.get("ac-chronicles-ps4-europe-spain-5916285");
  const uk = editions.get("ac-chronicles-ps4-europe-uk-5916254");
  const german = editions.get("ac-chronicles-ps4-europe-germany-5916247");
  const atCh = editions.get("ac-chronicles-ps4-europe-at-ch-candidate-5916230");
  const nordic = editions.get("ac-chronicles-ps4-europe-nordic-identifier-review");
  assert.ok(spanish && uk && german && atCh && nordic);
  assert.deepEqual(spanish.packagingLanguages, []);
  assert.deepEqual(uk.packagingLanguages, ["EN"]);
  assert.deepEqual(uk.componentLanguageEvidence.map((entry) => entry.component), ["BOX", "MANUAL"]);
  assert.match(uk.notes.join(" "), /Idiomas de software/);
  assert.deepEqual(german.packagingLanguages, []);
  assert.deepEqual(atCh.packagingLanguages, []);
  assert.deepEqual(nordic.packagingLanguages, ["SV", "DA", "NO", "FI"]);
  assert.equal(nordic.barcode, undefined);
  assert.equal(nordic.catalogNumber, "3307215916292");
  assert.match(nordic.notes.join(" "), /3307215916322 sigue pendiente/);
});

test("Chronicles separates North America and Japan from CUSA-03440", () => {
  const editions = new Map(guide().physicalEditions.map((entry) => [entry.id, entry]));
  const northAmerica = editions.get("ac-chronicles-ps4-north-america-887256019525");
  const japan = editions.get("ac-chronicles-ps4-asia-japan-4949244003711");
  assert.ok(northAmerica && japan);
  assert.equal(northAmerica.barcode, "887256019525");
  assert.equal(northAmerica.catalogNumber, "CUSA-03482");
  assert.deepEqual(northAmerica.marketRegions, ["US", "CA", "MX"]);
  assert.equal(japan.barcode, "4949244003711");
  assert.equal(japan.catalogNumber, "PLJM-80132");
  assert.deepEqual(japan.ratingSystems, ["CERO C"]);
});

test("Chronicles does not promote Portuguese, Polish, New Zealand, Brazilian, Korean or Asian digital leads", () => {
  const expected = guide();
  const markets = expected.physicalEditions.flatMap((entry) => entry.marketRegions);
  for (const market of ["PT", "PL", "NZ", "BR", "KR", "HK", "TW"]) {
    assert.equal(markets.includes(market), false, market);
  }
  assert.match(expected.evidenceNote, /packaging dedicado Portugal y Polonia/);
  assert.match(expected.evidenceNote, /físico Nueva Zelanda, Brasil, Corea y Asia Trilogy/);
  assert.match(expected.evidenceNote, /no se inventan tres fichas físicas/);
});

test("Chronicles keeps the legacy Spanish route and independent regional prices", () => {
  const spanish = getCatalogGame("ps4-assassin%27s-creed-chronicles");
  const american = getCatalogGame("ps4-usa-assassin%27s-creed-chronicles");
  assert.ok(spanish && american);
  assert.equal(catalogGamePath(spanish), "/catalogo/assassin-s-creed-chronicles-ps4-pal-es");
  assert.equal(spanish.recommendedPrice, 10);
  assert.equal(american.recommendedPrice, 12.94);
});

test("Chronicles raw guide has one family and unique edition/catalog identities", () => {
  assert.equal(rawGuideData.schemaVersion, 2);
  const [raw] = rawGuideData.guides;
  assert.equal(raw.editionFamilies.length, 1);
  assert.equal(raw.editionFamilies[0].physicalEditionIds.length, raw.physicalEditions.length);
  assert.equal(new Set(raw.physicalEditions.map((entry) => entry.id)).size, raw.physicalEditions.length);
  const catalogIds = raw.physicalEditions.flatMap((entry) => entry.catalogIds ?? []);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  assert.ok(raw.sources.every((source) => source.url.startsWith("https://")));
});
