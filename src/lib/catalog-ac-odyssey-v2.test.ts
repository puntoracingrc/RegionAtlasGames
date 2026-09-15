import assert from "node:assert/strict";
import test from "node:test";
import guideDocument from "../../data/catalog-edition-guides-ac-odyssey.json";
import collectionDocument from "../../data/collection.json";
import { catalog, getCatalogGame, getCollectionItem, isPublicCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { getCatalogRouteRedirect } from "./catalog-route-redirects";
import { catalogGamePath } from "./catalog-url";

const GUIDE_ID = "assassins-creed-odyssey-ps4";
const CANONICAL_ID = "ps4-assassins-creed-odyssey";
const USA_STANDARD_ID = "ps4-usa-assassin%27s-creed-odyssey";

type WorldwideEditionFields = {
  evidenceMarkets?: string[];
  distributionMarkets?: string[];
  softwareLanguages?: string[];
  productCodes?: string[];
  confidence?: string;
};

function odysseyGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(guide, "missing Assassin's Creed Odyssey PS4 V2 guide");
  return guide;
}

function edition(id: string) {
  const result = odysseyGuide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(result, `missing Odyssey physical edition ${id}`);
  return result as typeof result & WorldwideEditionFields;
}

function rawResearchTask(id: string) {
  const result = guideDocument.guides[0].researchTasks.find((entry) => entry.id === id);
  assert.ok(result, `missing Odyssey research task ${id}`);
  return result;
}

test("Odyssey uses one canonical work and links every unambiguous public regional card", () => {
  const guide = odysseyGuide();
  assert.equal(guide.schemaVersion, 2);
  assert.equal(guide.game.title, "Assassin's Creed Odyssey");
  assert.equal(guide.game.canonicalCatalogId, CANONICAL_ID);
  assert.deepEqual(guide.editionFamilies.map((family) => family.id), [
    "standard",
    "gold",
    "deluxe",
    "collectors",
    "pantheon",
    "athenian",
  ]);

  const expectedLinks = new Map([
    [CANONICAL_ID, "ac-odyssey-ps4-standard-es"],
    [USA_STANDARD_ID, "ac-odyssey-ps4-standard-us-catalog-unresolved"],
    ["ps4-usa-assassin%27s-creed-odyssey-gold-edition", "ac-odyssey-ps4-gold-us-catalog"],
    ["ps4-usa-assassin%27s-creed-odyssey-deluxe-edition", "ac-odyssey-ps4-deluxe-us-catalog"],
    ["ps4-usa-assassin%27s-creed-odyssey-collector%27s-edition", "ac-odyssey-ps4-collectors-us-catalog"],
    ["ps4-japon-assassin%27s-creed-odyssey-collector%27s-edition", "ac-odyssey-ps4-collectors-jp-catalog"],
    ["ps4-usa-assassin%27s-creed-odyssey-pantheon-edition", "ac-odyssey-ps4-pantheon-us-catalog"],
    ["ps4-assassin%27s-creed-odyssey-athenian-edition", "ac-odyssey-ps4-athenian-es-catalog"],
  ]);
  const paths = new Set<string>();
  for (const [catalogId, physicalEditionId] of expectedLinks) {
    const game = getCatalogGame(catalogId);
    assert.ok(game, catalogId);
    assert.equal(isPublicCatalogGame(game), true, catalogId);
    const currentGuide = getCatalogEditionGuide(game);
    assert.equal(currentGuide?.id, GUIDE_ID, catalogId);
    assert.equal(currentGuide?.currentEditionId, physicalEditionId, catalogId);
    paths.add(catalogGamePath(game));
  }
  assert.equal(paths.size, expectedLinks.size);

  const assigned = guide.editionFamilies.flatMap((family) => family.physicalEditionIds);
  assert.equal(assigned.length, guide.physicalEditions.length);
  assert.equal(new Set(assigned).size, assigned.length);
});

test("the owned Spanish box stays Spanish and Portuguese circulation never becomes a PT variant", () => {
  const spanish = edition("ac-odyssey-ps4-standard-es");
  assert.equal(spanish.barcode, "3307216063926");
  assert.equal(spanish.catalogNumber, "CUSA-09303");
  assert.deepEqual(spanish.productCodes, ["CUSA-09303"]);
  assert.deepEqual(spanish.marketRegions, ["ES"]);
  assert.deepEqual(spanish.evidenceMarkets, ["ES", "PT"]);
  assert.deepEqual(spanish.packagingLanguages, ["es"]);
  assert.deepEqual(spanish.softwareLanguages, ["es"]);
  assert.deepEqual(spanish.scanSetIds, [CANONICAL_ID]);
  assert.equal(spanish.confidence, "CONFIRMED_PHYSICAL_COPY");
  assert.equal(odysseyGuide().physicalEditions.some((entry) => entry.marketRegions.includes("PT")), false);

  const scan = getOwnedScanSetById(CANONICAL_ID);
  assert.equal(scan?.packaging.ean, spanish.barcode);
  assert.equal(scan?.packaging.reference, spanish.catalogNumber);
  assert.deepEqual(scan?.packaging.languages, ["Español"]);

  const portugal = rawResearchTask("odyssey-portugal-dedicated-packaging");
  assert.equal(portugal.status, "UNCONFIRMED");
  assert.deepEqual(portugal.marketRegions, ["PT"]);
});

test("confirmed European Standard boxes retain exact identifiers and evidence scopes", () => {
  const italy = edition("ac-odyssey-ps4-standard-it");
  assert.equal(italy.barcode, "3307216063933");
  assert.deepEqual(italy.marketRegions, ["IT"]);
  assert.deepEqual(italy.packagingLanguages, ["it"]);
  assert.deepEqual(italy.softwareLanguages, ["it"]);

  const uk = edition("ac-odyssey-ps4-standard-gb");
  assert.equal(uk.barcode, "3307216063889");
  assert.deepEqual(uk.marketRegions, ["GB"]);
  assert.deepEqual(uk.packagingLanguages, ["en"]);

  const poland = edition("ac-odyssey-ps4-standard-pl");
  assert.equal(poland.barcode, "3307216063940");
  assert.deepEqual(poland.marketRegions, ["PL"]);
  assert.deepEqual(poland.distributionMarkets, ["PL"]);
  assert.deepEqual(poland.softwareLanguages, ["pl"]);
  assert.deepEqual(poland.packagingLanguages, []);

  const southeast = edition("ac-odyssey-ps4-standard-southeast-europe-en");
  assert.equal(southeast.barcode, "3307216063872");
  assert.equal(southeast.catalogNumber, "CUSA-12042");
  assert.deepEqual(southeast.productCodes, ["CUSA-12042"]);
  assert.deepEqual(southeast.marketRegions, []);
  assert.deepEqual(southeast.evidenceMarkets, ["GR", "TR"]);
  assert.deepEqual(southeast.packagingLanguages, ["en"]);
  assert.match(southeast.notes.join(" "), /Eslovenia/);
});

test("Germany and the D/F/I box remain distinct physical identities", () => {
  const germany = edition("ac-odyssey-ps4-standard-de");
  const dfi = edition("ac-odyssey-ps4-standard-dfi");
  assert.notEqual(germany.id, dfi.id);
  assert.equal(germany.barcode, "3307216063865");
  assert.deepEqual(germany.marketRegions, ["DE"]);
  assert.equal(dfi.barcode, "3307216063919");
  assert.deepEqual(dfi.marketRegions, []);
  assert.deepEqual(dfi.packagingLanguages, ["de", "fr", "it"]);
});

test("Asia and LATAM stay physical but pending without invented identifiers or countries", () => {
  const asia = edition("ac-odyssey-ps4-standard-asia-en-zh-pending");
  assert.equal(asia.broadRegion, "ASIA");
  assert.equal(asia.barcode, undefined);
  assert.equal(asia.catalogNumber, undefined);
  assert.deepEqual(asia.marketRegions, []);
  assert.deepEqual(asia.packagingLanguages, []);
  assert.deepEqual(asia.softwareLanguages, ["en", "zh"]);
  assert.equal(asia.confidence, "PENDING_IDENTIFIER");

  const latam = edition("ac-odyssey-ps4-standard-latam-cover-pending");
  assert.equal(latam.broadRegion, "LATIN_AMERICA");
  assert.equal(latam.barcode, undefined);
  assert.equal(latam.catalogNumber, undefined);
  assert.deepEqual(latam.marketRegions, []);
  assert.deepEqual(latam.packagingLanguages, []);
  assert.equal(latam.confidence, "PENDING_IDENTIFIER");
});

test("the two USA UPC candidates never merge or silently claim the existing USA card", () => {
  const first = edition("ac-odyssey-ps4-standard-us-upc-887256035969");
  const second = edition("ac-odyssey-ps4-standard-us-upc-887256036041");
  const catalogIdentity = edition("ac-odyssey-ps4-standard-us-catalog-unresolved");
  assert.equal(first.barcode, "887256035969");
  assert.equal(second.barcode, "887256036041");
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.catalogIds, []);
  assert.deepEqual(second.catalogIds, []);
  assert.deepEqual(catalogIdentity.catalogIds, [USA_STANDARD_ID]);
  assert.equal(catalogIdentity.barcode, undefined);
  assert.equal(catalogIdentity.confidence, "PENDING_IDENTIFIER");
  assert.match(first.notes.join(" "), /No se afirma/);
  assert.match(second.notes.join(" "), /No se afirma/);
  assert.equal(rawResearchTask("odyssey-us-upc-relationship").status, "PENDING_REVIEW");
});

test("Japan and the conceptual edition families never collapse into one another", () => {
  const standard = edition("ac-odyssey-ps4-standard-jp");
  const gold = edition("ac-odyssey-ps4-gold-jp");
  const deluxe = edition("ac-odyssey-ps4-deluxe-jp-2020");
  assert.deepEqual(
    [standard.barcode, standard.catalogNumber, gold.barcode, gold.catalogNumber, deluxe.barcode, deluxe.catalogNumber],
    ["4949244004572", "PLJM-16214", "4949244004664", "PLJM-16292", "4949244009805", "PLJM-16601"],
  );
  assert.equal(new Set([standard.id, gold.id, deluxe.id]).size, 3);

  const guide = odysseyGuide();
  for (const familyId of ["deluxe", "gold", "collectors", "pantheon", "athenian"]) {
    assert.ok(guide.editionFamilies.some((family) => family.id === familyId), familyId);
  }
  const distinctPendingConcepts = [
    "odyssey-spartan-edition-identity",
    "odyssey-omega-edition-identity",
    "odyssey-steelbook-edition-identity",
    "odyssey-limited-edition-identity",
  ].map(rawResearchTask);
  assert.equal(new Set(distinctPendingConcepts.map((task) => task.id)).size, 4);
  assert.ok(distinctPendingConcepts.every((task) => task.status === "PENDING_REVIEW"));

  const pendingGold = ["3307216067214", "3307216067290", "3307216079040"].map((barcode) => (
    guide.physicalEditions.find((entry) => entry.barcode === barcode)
  ));
  assert.ok(pendingGold.every(Boolean));
  for (const candidate of pendingGold) {
    assert.deepEqual(candidate?.marketRegions, []);
    assert.deepEqual(candidate?.packagingLanguages, []);
  }
});

test("all historical Odyssey rows, routes, prices, covers and owned data remain intact", () => {
  const excludedIds = [
    "ps4-assassin%27s-creed-odyssey",
    "ps4-assassin%27s-creed-odyssey-gold-edition",
    "ps4-assassin%27s-creed-odyssey-limited-edition",
    "ps4-assassin%27s-creed-odyssey-omega-edition",
    "ps4-assassin%27s-creed-odyssey-promo-not-for-resale",
    "ps4-assassin%27s-creed-odyssey-spartan-edition",
    "ps4-assassins-creed-odyssey-medusa-edition",
  ];
  for (const id of excludedIds) {
    const game = catalog.find((entry) => entry.id === id);
    assert.ok(game, id);
    assert.equal(game.listingStatus, "excluded", id);
  }

  const legacyStandard = catalog.find((entry) => entry.id === "ps4-assassin%27s-creed-odyssey");
  assert.equal(legacyStandard?.pcPath, "/game/pal-playstation-4/assassin%27s-creed-odyssey");
  assert.equal(legacyStandard?.coverUrl, "/covers/ps4/assassin-39-s-creed-odyssey.jpg");
  assert.equal(legacyStandard?.recommendedPrice, 12.44);
  assert.equal(getCatalogGame("ps4-assassin%27s-creed-odyssey")?.id, CANONICAL_ID);
  assert.equal(getCatalogRouteRedirect("ps4-assassin%27s-creed-odyssey")?.targetCatalogId, CANONICAL_ID);
  assert.equal(getCatalogRouteRedirect("assassin-s-creed-odyssey-ps4-pal-es")?.targetParam, "assassins-creed-odyssey-ps4-pal-es");

  const spanish = getCatalogGame(CANONICAL_ID);
  assert.equal(spanish?.coverUrl, "/catalog-covers/ps4/escaneos-propios/assassins-creed-odyssey/assassins-creed-odyssey-ps4-pal-es-portada-catalogo.webp");
  assert.equal(spanish?.recommendedPrice, 15.67);
  const usa = getCatalogGame(USA_STANDARD_ID);
  assert.equal(usa?.pcPath, "/game/playstation-4/assassin%27s-creed-odyssey");
  assert.equal(usa?.coverUrl, "/covers/ps4/assassin-s-creed-odyssey.jpg");
  assert.deepEqual([usa?.estimatedPriceComplete, usa?.estimatedPriceSealed], [11.37, 14.46]);

  const pantheon = getCatalogGame("ps4-usa-assassin%27s-creed-odyssey-pantheon-edition");
  assert.equal(pantheon?.coverUrl, "/covers/ps4/assassin-s-creed-odyssey-pantheon-edition.jpg");
  assert.deepEqual([pantheon?.estimatedPriceComplete, pantheon?.estimatedPriceSealed], [798.62, 1037.96]);

  const owned = getCollectionItem("assassins-creed-odyssey");
  assert.equal(owned?.catalogId, CANONICAL_ID);
  assert.equal(owned?.sealed, true);
  assert.equal(owned?.buyPrice, 11);
  assert.equal(owned?.totalValue, 15.67);
  const storedOwned = collectionDocument.find((item) => item.id === "assassins-creed-odyssey");
  assert.equal(storedOwned?.catalogId, CANONICAL_ID);
  assert.equal(storedOwned?.totalValue, 15);

  const doublePack = getCatalogGame("ps4-double-pack-assassin%27s-creed-odyssey-&#43;-assassin%27s-creed-origins");
  assert.ok(doublePack);
  assert.notEqual(getCatalogEditionGuide(doublePack)?.id, GUIDE_ID);
});

test("the Odyssey document remains a standalone schema V2 data slice", () => {
  assert.equal(guideDocument.schemaVersion, 2);
  assert.equal(guideDocument.guides.length, 1);
  assert.equal(guideDocument.guides[0].schemaVersion, 2);
  assert.equal(guideDocument.guides[0].game.canonicalCatalogId, CANONICAL_ID);
});
