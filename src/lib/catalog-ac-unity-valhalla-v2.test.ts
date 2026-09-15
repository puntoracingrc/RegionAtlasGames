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

function guideById(id: string) {
  const raw = guideDocument.guides.find((entry) => entry.id === id);
  assert.ok(raw, `missing raw guide ${id}`);
  return normalizeCatalogEditionGuide(raw as RawCatalogEditionGuide);
}

function valhallaEdition(id: string) {
  const value = guideById("assassins-creed-valhalla-ps4-worldwide").physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing Valhalla physical edition ${id}`);
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

test("Valhalla V2 keeps one canonical base game and the reviewed legacy redirect", () => {
  const guide = guideById("assassins-creed-valhalla-ps4-worldwide");
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassins-creed-valhalla");
  assert.equal(canonicalCatalogId("ps4-assassin%27s-creed-valhalla"), "ps4-assassins-creed-valhalla");
  assert.equal(guide.editionFamilies[0].physicalEditionIds.length, guide.physicalEditions.length);
  const game = getCatalogGame("ps4-assassins-creed-valhalla");
  assert.ok(game);
  assert.equal(getCatalogEditionGuide(game)?.id, guide.id);
});

test("Valhalla Spain preserves the owned scan, CUSA and packaging evidence", () => {
  const spain = valhallaEdition("ac-valhalla-ps4-standard-es");
  assert.equal(spain.barcode, "3307216168379");
  assert.equal(spain.serial, "CUSA-18534");
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.scanSetIds, ["ps4-assassins-creed-valhalla"]);
  const scan = getOwnedScanSetById("ps4-assassins-creed-valhalla");
  assert.equal(scan?.packaging.ean, spain.barcode);
  assert.equal(scan?.packaging.reference, spain.serial);
  assert.equal(scan?.images.length, 3);
  assert.match(spain.notes.join(" "), /voces en castellano requieren descarga/);
});

test("Valhalla European Standard variants do not infer market or packaging", () => {
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-fr-nl").packagingLanguages, ["FR", "NL"]);
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-pl").packagingLanguages, ["PL"]);
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-en").packagingLanguages, ["EN"]);
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-at").marketRegions, ["AT"]);
  assert(!valhallaEdition("ac-valhalla-ps4-standard-at").marketRegions.includes("DE"));
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-it-market-en-cover").packagingLanguages, ["EN"]);
  assert(!valhallaEdition("ac-valhalla-ps4-standard-it-market-en-cover").packagingLanguages.includes("IT"));
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-eu-pending-3307216168317").marketRegions, []);
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-eu-cusa18535").serial, "CUSA-18535");
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-es").serial, "CUSA-18534");
});

test("Valhalla USA and Canada Standard identifiers remain separate", () => {
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-us-a").barcode, "887256110116");
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-us-b").barcode, "887256110123");
  assert.match(valhallaEdition("ac-valhalla-ps4-standard-us-b").notes.join(" "), /NEEDS_PHYSICAL_MAPPING/);
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-ca").barcode, "887256110130");
  assert.deepEqual(valhallaEdition("ac-valhalla-ps4-standard-ca").packagingLanguages, ["EN", "FR"]);
});

test("Valhalla Japan and Asia identities do not collapse", () => {
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-jp").serial, "PLJM-16677");
  assert.equal(valhallaEdition("ac-valhalla-ps4-ultimate-jp").serial, "PLJM-16678");
  assert.equal(valhallaEdition("ac-valhalla-ps4-standard-asia").serial, undefined);
  assert.match(valhallaEdition("ac-valhalla-ps4-standard-asia").notes.join(" "), /EN\/JA\/ZH-Hans\/ZH-Hant\/KO/);
});

test("Valhalla Gold, Ultimate, Limited and Drakkar remain distinct physical editions", () => {
  assert.equal(valhallaEdition("ac-valhalla-ps4-gold-eu").barcode, "3307216168553");
  assert.equal(valhallaEdition("ac-valhalla-ps4-gold-steelbook-us").barcode, "887256110628");
  assert.equal(valhallaEdition("ac-valhalla-ps4-ultimate-eu-game").barcode, "3307216168423");
  assert.equal(valhallaEdition("ac-valhalla-ps4-ultimate-steelbook-us").barcode, "887256110642");
  assert.equal(valhallaEdition("ac-valhalla-ps4-limited-fr-eu").barcode, "3307216168782");
  assert.equal(valhallaEdition("ac-valhalla-ps4-drakkar-eu").barcode, "3307216168904");
  assert.equal(valhallaEdition("ac-valhalla-ps4-drakkar-eu").serial, "CUSA-18535");
});

test("Ragnarök Edition is a base-disc bundle and its disputed US UPC stays pending", () => {
  for (const id of [
    "ac-valhalla-ps4-ragnarok-eu",
    "ac-valhalla-ps4-ragnarok-fr",
    "ac-valhalla-ps4-ragnarok-au",
    "ac-valhalla-ps4-ragnarok-jp",
    "ac-valhalla-ps4-ragnarok-pal-catalog-pending",
    "ac-valhalla-ps4-ragnarok-us-platform-pending",
  ]) {
    const ragnarok = valhallaEdition(id);
    assert(ragnarok.physicalContents.some((entry) => /base game disc/.test(entry)));
    assert(ragnarok.digitalContents.some((entry) => /Dawn of Ragnarök/.test(entry)));
    assert.match(ragnarok.notes.join(" "), /BASE_GAME_PLUS_EXPANSION_CODE/);
  }
  const japan = valhallaEdition("ac-valhalla-ps4-ragnarok-jp");
  assert.equal(japan.barcode, "4949244012720");
  assert.equal(japan.serial, "PLJM-16994");
  const us = valhallaEdition("ac-valhalla-ps4-ragnarok-us-platform-pending");
  assert.equal(us.barcode, undefined);
  assert.match(us.notes.join(" "), /887256112639.*PLATFORM_MAPPING_NEEDS_VERIFICATION/);
});

test("Dawn of Ragnarök is a separate expansion guide and Code in a Box contains no disc", () => {
  const base = guideById("assassins-creed-valhalla-ps4-worldwide");
  const dawn = guideById("assassins-creed-valhalla-dawn-of-ragnarok-ps4");
  assert.notEqual(dawn.game.canonicalCatalogId, base.game.canonicalCatalogId);
  assert.match(dawn.note, /expansión/);
  assert.match(dawn.evidenceNote, /EXPANSION.*expansionOf ps4-assassins-creed-valhalla/);
  assert(!base.physicalEditions.flatMap((entry) => entry.catalogIds).includes(dawn.game.canonicalCatalogId));
  for (const codeProduct of dawn.physicalEditions) {
    assert(codeProduct.physicalContents.includes("Sin disco"));
    assert(codeProduct.digitalContents.some((entry) => /Código de descarga/.test(entry)));
    assert.match(codeProduct.notes.join(" "), /PHYSICAL_DOWNLOAD_CODE/);
    assert.equal(codeProduct.barcode, undefined);
  }
});

test("Valhalla public catalog cards keep their existing IDs, covers and prices", () => {
  const linkedIds = guideById("assassins-creed-valhalla-ps4-worldwide").physicalEditions.flatMap((entry) => entry.catalogIds);
  for (const id of [
    "ps4-assassins-creed-valhalla",
    "ps4-usa-assassin%27s-creed-valhalla",
    "ps4-usa-assassin%27s-creed-valhalla-gold-edition",
    "ps4-usa-assassin%27s-creed-valhalla-ultimate-edition",
    "ps4-usa-assassin%27s-creed-valhalla-collector%27s-editions",
    "ps4-assassin%27s-creed-valhalla-ragnarok-edition",
    "ps4-usa-assassin%27s-creed-valhalla-ragnarok-edition",
  ]) {
    assert(linkedIds.includes(id), `unlinked public Valhalla catalog ID ${id}`);
    const game = getCatalogGame(id);
    assert.ok(game);
    assert.ok(game.coverUrl);
  }
  assert.equal(getCatalogGame("ps4-assassins-creed-valhalla")?.recommendedPrice, 14.13);
  assert.equal(getCatalogGame("ps4-assassin%27s-creed-valhalla-ragnarok-edition")?.recommendedPrice, 76.31);
});
