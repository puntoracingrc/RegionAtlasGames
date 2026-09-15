import assert from "node:assert/strict";
import test from "node:test";
import guideDocument from "../../data/catalog-edition-guides-ac-ezio-collection-ps4.json";
import { canonicalCatalogId } from "./catalog-id-aliases";
import { getCatalogEditionGuides } from "./catalog-edition-guides";

function ezioGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === "assassins-creed-the-ezio-collection-ps4");
  assert.ok(guide);
  return guide;
}

test("The Ezio Collection is one PS4 compilation, not three physical games", () => {
  const guide = ezioGuide();
  assert.equal(guide.schemaVersion, 2);
  assert.equal(guide.game.title, "Assassin's Creed: The Ezio Collection");
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassins-creed-the-ezio-collection");
  assert.equal(guide.physicalEditions.length, 17);
  assert.equal(guide.physicalEditions.filter((edition) => edition.editionType === "COMPILATION").length, 16);
  assert.equal(guide.physicalEditions.filter((edition) => edition.editionType === "COLLECTOR").length, 1);
  assert.equal(canonicalCatalogId("ps4-assassin%27s-creed-the-ezio-collection"), guide.game.canonicalCatalogId);
  assert.equal(guideDocument.schemaVersion, 2);
});

test("the Spanish owned scan defines the compilation contents and excludes multiplayer", () => {
  const spanish = ezioGuide().physicalEditions.find((edition) => edition.id === "assassins-creed-ezio-collection-ps4-es");
  assert.ok(spanish);
  assert.equal(spanish.editionType, "COMPILATION");
  assert.equal(spanish.barcode, "3307215977453");
  assert.equal(spanish.catalogNumber, "CUSA-04893");
  assert.deepEqual(spanish.marketRegions, ["ES"]);
  assert.deepEqual(spanish.packagingLanguages, ["ES"]);
  assert.deepEqual(spanish.scanSetIds, ["ps4-assassins-creed-the-ezio-collection"]);
  assert.deepEqual(spanish.physicalContents, [
    "Assassin's Creed II",
    "Assassin's Creed: Brotherhood",
    "Assassin's Creed: Revelations",
  ]);
  assert.ok(spanish.digitalContents.includes("Assassin's Creed Lineage"));
  assert.ok(spanish.digitalContents.includes("Assassin's Creed Embers"));
  assert.match(spanish.notes.join(" "), /excluye expresamente el contenido multijugador original/);
});

test("European Ezio Collection boxes preserve exact EAN and packaging evidence", () => {
  const byId = new Map(ezioGuide().physicalEditions.map((edition) => [edition.id, edition]));
  assert.equal(byId.get("assassins-creed-ezio-collection-ps4-fr-be")?.barcode, "3307215977385");
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-fr-be")?.packagingLanguages, []);
  assert.equal(byId.get("assassins-creed-ezio-collection-ps4-de")?.barcode, "3307215977392");
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-de")?.packagingLanguages, []);
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-de")?.componentLanguageEvidence[0].languages, ["DE"]);
  assert.equal(byId.get("assassins-creed-ezio-collection-ps4-at-ch")?.barcode, "3307215977408");
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-it")?.packagingLanguages, ["IT"]);
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-uk")?.packagingLanguages, ["EN"]);
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-eu-english-3307215977378")?.marketRegions, []);
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-eu-3307215977446")?.marketRegions, []);
});

test("North America and LATAM remain separate physical Ezio Collection variants", () => {
  const byId = new Map(ezioGuide().physicalEditions.map((edition) => [edition.id, edition]));
  const northAmerica = byId.get("assassins-creed-ezio-collection-ps4-na");
  const latam = byId.get("assassins-creed-ezio-collection-ps4-latam");
  assert.equal(northAmerica?.barcode, "887256022280");
  assert.equal(northAmerica?.catalogNumber, "CUSA-05008");
  assert.equal(latam?.barcode, "887256024284");
  assert.deepEqual(latam?.marketRegions, []);
  assert.deepEqual(latam?.packagingLanguages, []);
  assert.notEqual(northAmerica?.id, latam?.id);
  assert.match(latam?.notes.join(" ") ?? "", /Brasil es circulación.*no packaging PT-BR dedicado/);
});

test("Japan, Asia, Korea and the Asian Collector remain separate", () => {
  const byId = new Map(ezioGuide().physicalEditions.map((edition) => [edition.id, edition]));
  assert.equal(byId.get("assassins-creed-ezio-collection-ps4-jp")?.catalogNumber, "PLJM-84081");
  assert.equal(byId.get("assassins-creed-ezio-collection-ps4-asia")?.catalogNumber, "PLAS-07087");
  assert.equal(byId.get("assassins-creed-ezio-collection-ps4-kr")?.catalogNumber, "PLKS-97034");
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-asia")?.packagingLanguages, []);
  assert.deepEqual(byId.get("assassins-creed-ezio-collection-ps4-asia")?.componentLanguageEvidence[0].languages, ["ZH-HANT"]);
  const collector = byId.get("assassins-creed-ezio-collection-ps4-collector-asia");
  assert.equal(collector?.editionType, "COLLECTOR");
  assert.equal(collector?.barcode, undefined);
  assert.equal(collector?.catalogNumber, undefined);
  assert.match(collector?.notes.join(" ") ?? "", /No se crean Collector equivalentes para Europa o Norteamérica/);
});

test("Portugal and other unresolved Ezio Collection boxes are not invented", () => {
  const guide = ezioGuide();
  assert.equal(guide.physicalEditions.some((edition) => edition.marketRegions.includes("PT")), false);
  assert.equal(guide.physicalEditions.some((edition) => edition.id.includes("benelux")), false);
  assert.equal(guide.physicalEditions.some((edition) => edition.id.includes("nordic")), false);
  assert.match(guide.evidenceNote, /Portugal, Benelux, Nórdicos/);
});
