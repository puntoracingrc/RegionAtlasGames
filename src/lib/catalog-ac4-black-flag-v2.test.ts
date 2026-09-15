import assert from "node:assert/strict";
import test from "node:test";
import rawGuideData from "../../data/catalog-edition-guides-ac4-black-flag.json";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-url";

const GUIDE_ID = "assassins-creed-iv-black-flag-ps4";

function guide() {
  const value = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(value);
  return value;
}

test("Black Flag has one canonical PS4 V2 work across the preserved ES and US identities", () => {
  const expected = guide();
  assert.equal(expected.schemaVersion, 2);
  assert.equal(expected.game.title, "Assassin's Creed IV: Black Flag");
  assert.equal(expected.game.canonicalCatalogId, "ps4-assassins-creed-4-black-flag");

  const spanish = getCatalogGame("ps4-assassins-creed-4-black-flag");
  const american = getCatalogGame("ps4-usa-assassin%27s-creed-iv-black-flag");
  const oldDuplicate = getCatalogGame("ps4-assassin%27s-creed-iv-black-flag");
  assert.ok(spanish);
  assert.ok(american);
  assert.ok(oldDuplicate);
  assert.equal(oldDuplicate.id, spanish.id);
  assert.equal(getCatalogEditionGuide(spanish)?.id, GUIDE_ID);
  assert.equal(getCatalogEditionGuide(american)?.id, GUIDE_ID);
  assert.equal(catalogGamePath(spanish), "/catalogo/assassins-creed-4-black-flag-ps4-pal-es");
  assert.equal(catalogGamePath(american), "/catalogo/assassin-s-creed-iv-black-flag-ps4-pal-us");
});

test("Black Flag keeps CUSA families, regional SKUs and uncertain packaging separate", () => {
  const editions = new Map(guide().physicalEditions.map((entry) => [entry.id, entry]));
  const spanish = editions.get("ac4-black-flag-ps4-europe-spain-standard");
  assert.ok(spanish);
  assert.equal(spanish.barcode, "3307215717769");
  assert.equal(spanish.catalogNumber, "CUSA-00009");
  assert.deepEqual(spanish.packagingLanguages, ["ES"]);
  assert.deepEqual(spanish.scanSetIds, ["ps4-assassins-creed-4-black-flag"]);
  assert.equal(spanish.componentLanguageEvidence[0].basis, "OBSERVED");

  const europeanCusa = guide().physicalEditions.filter((entry) => entry.catalogNumber === "CUSA-00009");
  assert.ok(new Set(europeanCusa.map((entry) => entry.barcode).filter(Boolean)).size > 10);
  assert.equal(editions.get("ac4-black-flag-ps4-north-america-standard")?.catalogNumber, "CUSA-00010");
  assert.equal(editions.get("ac4-black-flag-ps4-asia-japan-standard")?.catalogNumber, "PLJM-80005");
  assert.equal(editions.get("ac4-black-flag-ps4-asia-standard")?.catalogNumber, "PLAS-05012");

  assert.equal(editions.get("ac4-black-flag-ps4-europe-nordic-5715192")?.barcode, "3307215715192");
  assert.equal(editions.get("ac4-black-flag-ps4-europe-germany-5717721")?.barcode, "3307215717721");
  assert.equal(editions.get("ac4-black-flag-ps4-europe-france-5715185")?.barcode, "3307215715185");
  assert.equal(editions.get("ac4-black-flag-ps4-europe-english-5715116")?.barcode, "3307215715116");
  assert.deepEqual(editions.get("ac4-black-flag-ps4-europe-benelux-candidate-5715444")?.packagingLanguages, []);
  assert.deepEqual(editions.get("ac4-black-flag-ps4-europe-poland-candidate-5717790")?.marketRegions, []);
});

test("Black Flag does not turn Portuguese, Italian or New Zealand leads into physical markets", () => {
  const expected = guide();
  const markets = expected.physicalEditions.flatMap((entry) => entry.marketRegions);
  assert.equal(markets.includes("PT"), false);
  assert.equal(markets.includes("IT"), false);
  assert.equal(markets.includes("NZ"), false);
  assert.match(expected.evidenceNote, /packaging dedicado Portugal e Italia/);
  assert.match(expected.evidenceNote, /SKU físico Nueva Zelanda/);
  assert.match(expected.evidenceNote, /Mexico\/LATAM/);
});

test("Black Flag reissues and retailer editions remain distinct price identities", () => {
  const expected = guide();
  const families = new Map(expected.editionFamilies.map((entry) => [entry.id, entry]));
  assert.equal(families.get("budget-reissues")?.physicalEditionIds.length, 4);
  assert.equal(families.get("special-and-collector")?.physicalEditionIds.length, 8);

  const retailerIds = [
    "ps4-usa-assassin%27s-creed-iv-black-flag-gamestop-edition",
    "ps4-usa-assassin%27s-creed-iv-black-flag-limited-edition",
    "ps4-usa-assassin%27s-creed-iv-black-flag-signature-edition",
    "ps4-usa-assassin%27s-creed-iv-black-flag-special-edition",
    "ps4-usa-assassin%27s-creed-iv-black-flag-target-edition",
    "ps4-usa-assassin%27s-creed-iv-black-flag-walmart-edition",
  ];
  const linkedIds = expected.physicalEditions.flatMap((entry) => entry.catalogIds);
  for (const id of retailerIds) assert.ok(linkedIds.includes(id), id);

  assert.equal(getCatalogGame("ps4-assassins-creed-4-black-flag")?.recommendedPrice, 17.18);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-iv-black-flag")?.recommendedPrice, 11.64);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-iv-black-flag-limited-edition")?.recommendedPrice, 102.92);
});

test("Black Flag raw guide remains schema-shaped and source-bounded", () => {
  assert.equal(rawGuideData.schemaVersion, 2);
  assert.equal(rawGuideData.guides.length, 1);
  const [raw] = rawGuideData.guides;
  assert.equal(new Set(raw.physicalEditions.map((entry) => entry.id)).size, raw.physicalEditions.length);
  assert.equal(new Set(raw.physicalEditions.flatMap((entry) => entry.catalogIds ?? [])).size,
    raw.physicalEditions.flatMap((entry) => entry.catalogIds ?? []).length);
  assert.ok(raw.sources.every((source) => source.url.startsWith("https://")));
});
