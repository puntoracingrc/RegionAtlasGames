import assert from "node:assert/strict";
import test from "node:test";
import guideDocument from "../../data/catalog-edition-guides-ac-unity-valhalla.json";
import { canonicalCatalogId } from "./catalog-id-aliases";
import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuide, normalizeCatalogEditionGuide, type RawCatalogEditionGuide } from "./catalog-edition-guides";
import { getOwnedScanSetById } from "./catalog-owned-scans";

function unityGuide() {
  const raw = guideDocument.guides.find((entry) => entry.id === "assassins-creed-unity-ps4-worldwide");
  assert.ok(raw);
  return normalizeCatalogEditionGuide(raw as RawCatalogEditionGuide);
}

function edition(id: string) {
  const value = unityGuide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing Unity physical edition ${id}`);
  return value;
}

test("Unity V2 keeps one canonical game and the reviewed legacy redirect", () => {
  const guide = unityGuide();
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassins-creed-unity");
  assert.equal(guide.editionFamilies.length, 1);
  assert.equal(guide.editionFamilies[0].physicalEditionIds.length, guide.physicalEditions.length);
  assert.equal(canonicalCatalogId("ps4-assassin%27s-creed-unity"), "ps4-assassins-creed-unity");
  const game = getCatalogGame("ps4-assassins-creed-unity");
  assert.ok(game);
  assert.equal(getCatalogEditionGuide(game)?.id, "assassins-creed-unity-ps4-worldwide");
});

test("Unity Spain uses the owned scan without changing its catalog identity", () => {
  const spain = edition("ac-unity-ps4-standard-es");
  assert.equal(spain.barcode, "3307215785942");
  assert.equal(spain.serial, "CUSA-00605");
  assert.deepEqual(spain.marketRegions, ["ES"]);
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.scanSetIds, ["ps4-assassins-creed-unity"]);
  const scan = getOwnedScanSetById("ps4-assassins-creed-unity");
  assert.equal(scan?.packaging.ean, spain.barcode);
  assert.equal(scan?.packaging.reference, spain.serial);
  assert.equal(scan?.images.length, 3);
  assert.match(spain.notes.join(" "), /Portugal.*no constituye packaging portugués/);
  assert(!unityGuide().physicalEditions.some((entry) => entry.marketRegions.length === 1 && entry.marketRegions[0] === "PT"));
});

test("Unity European Standard barcodes remain separate and conservative", () => {
  assert.deepEqual(edition("ac-unity-ps4-standard-fr-a").packagingLanguages, ["FR"]);
  assert.equal(edition("ac-unity-ps4-standard-fr-a").barcode, "3307215785881");
  assert.equal(edition("ac-unity-ps4-standard-fr-b").barcode, "3307215785966");
  assert.equal(edition("ac-unity-ps4-standard-de").barcode, "3307215785911");
  assert.deepEqual(edition("ac-unity-ps4-standard-de").packagingLanguages, ["DE"]);
  assert.deepEqual(edition("ac-unity-ps4-standard-it").packagingLanguages, ["IT"]);
  assert.equal(edition("ac-unity-ps4-standard-it").barcode, "3307215785935");
  assert.equal(edition("ac-unity-ps4-standard-nordic").barcode, "3307215785904");
  assert.deepEqual(edition("ac-unity-ps4-standard-nordic").packagingLanguages, []);
  assert.deepEqual(edition("ac-unity-ps4-standard-benelux-candidate").packagingLanguages, []);
  assert.deepEqual(edition("ac-unity-ps4-standard-eu-en-fr").packagingLanguages, []);
  for (const barcode of ["3307215785928", "3307215803448", "3307215803462", "3307215810989"]) {
    const pending = unityGuide().physicalEditions.find((entry) => entry.barcode === barcode);
    assert.ok(pending);
    assert.match(pending.notes.join(" "), /PENDING_MAPPING/);
    assert.deepEqual(pending.marketRegions, []);
  }
});

test("Unity North American identifiers do not collapse Standard, Limited or Walmart", () => {
  assert.equal(edition("ac-unity-ps4-standard-na").barcode, "887256301262");
  assert.equal(edition("ac-unity-ps4-limited-us").barcode, "887256300302");
  const caMx = edition("ac-unity-ps4-limited-ca-mx");
  assert.equal(caMx.barcode, "887256300340");
  assert.equal(caMx.serial, "CUSA-00663LEL");
  assert.equal(caMx.catalogNumber, "UBP30500952-CVRT");
  assert.equal(edition("ac-unity-ps4-walmart-us").barcode, "887256301286");
  assert.match(edition("ac-unity-ps4-standard-na").notes.join(" "), /887256300333.*PENDING_MAPPING/);
});

test("Unity Japan, Korea and Asia physical identities remain independent", () => {
  assert.equal(edition("ac-unity-ps4-standard-jp").serial, "PLJM-84013");
  assert.equal(edition("ac-unity-ps4-ubi-the-best-jp").serial, "PLJM-84051");
  assert.equal(edition("ac-unity-ps4-standard-kr").serial, "PLKS-97003");
  assert.equal(edition("ac-unity-ps4-standard-asia-en-zh").serial, undefined);
  assert.notEqual(edition("ac-unity-ps4-standard-jp").id, edition("ac-unity-ps4-ubi-the-best-jp").id);
});

test("Unity editions keep their regional variants and pending identifiers explicit", () => {
  assert.equal(edition("ac-unity-ps4-special-es").barcode, "3307215803530");
  assert.equal(edition("ac-unity-ps4-bastille-es").barcode, "3307215813164");
  assert.equal(edition("ac-unity-ps4-bastille-au").barcode, "3307215792148");
  assert.equal(edition("ac-unity-ps4-notre-dame-eu-a").barcode, "3307215791967");
  assert.equal(edition("ac-unity-ps4-notre-dame-eu-b").barcode, "3307215791912");
  assert.equal(edition("ac-unity-ps4-guillotine-eu").barcode, undefined);
  assert.equal(edition("ac-unity-ps4-amazon-exclusive-eu").barcode, undefined);
  const collectors = edition("ac-unity-ps4-collector-us").variants;
  assert.deepEqual(collectors.map((entry) => entry.barcode), ["887256301309", "887256301323"]);
});

test("Unity packaging is never populated from its broader software language list", () => {
  const spain = edition("ac-unity-ps4-standard-es");
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.match(spain.notes.join(" "), /audio DE\/ES\/FR\/EN\/IT/);
  assert(!spain.packagingLanguages.includes("DE"));
  assert(!spain.packagingLanguages.includes("FR"));
});

test("Unity public catalog URLs, covers and prices remain attached to their original IDs", () => {
  const linkedIds = unityGuide().physicalEditions.flatMap((entry) => entry.catalogIds);
  for (const id of [
    "ps4-assassins-creed-unity",
    "ps4-usa-assassin%27s-creed-unity",
    "ps4-usa-assassin%27s-creed-unity-limited-edition",
    "ps4-usa-assassin%27s-creed-unity-walmart-edition",
    "ps4-usa-assassin%27s-creed-unity-collector%27s-edition",
    "ps4-usa-assassin%27s-creed-unity-playstation-hits",
    "ps4-assassin%27s-creed-unity-special-edition",
  ]) {
    assert(linkedIds.includes(id), `unlinked public Unity catalog ID ${id}`);
    const game = getCatalogGame(id);
    assert.ok(game);
    assert.ok(game.coverUrl);
  }
  assert.equal(getCatalogGame("ps4-assassins-creed-unity")?.recommendedPrice, 13.48);
});
