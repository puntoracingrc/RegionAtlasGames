import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { catalogGamePath, resolveCatalogGameParam } from "./catalog-url";

const GUIDE_ID = "assassins-creed-mirage-ps5";
const PS4_GUIDE_ID = "assassins-creed-mirage-ps4";

function guide() {
  const value = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(value, "missing Assassin's Creed Mirage PS5 V2 guide");
  return value;
}

function edition(id: string) {
  const value = guide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing ${id}`);
  return value;
}

test("QA 01: one canonical Mirage PS5 game anchors four complete edition families", () => {
  const value = guide();
  assert.equal(value.game.title, "Assassin's Creed Mirage");
  assert.equal(value.game.platformSlug, "ps5");
  assert.equal(value.game.canonicalCatalogId, "ps5-assassin-s-creed-mirage");
  assert.deepEqual(value.editionFamilies.map((family) => family.id), ["standard", "deluxe", "launch", "collectors-case"]);
  const assigned = value.editionFamilies.flatMap((family) => family.physicalEditionIds);
  assert.equal(assigned.length, 32);
  assert.deepEqual(new Set(assigned), new Set(value.physicalEditions.map((entry) => entry.id)));
});

test("QA 02: PS4 and PS5 keep independent release trees", () => {
  const ps4 = getCatalogEditionGuides().find((entry) => entry.id === PS4_GUIDE_ID);
  assert.ok(ps4);
  assert.equal(ps4.game.platformSlug, "ps4");
  assert.equal(guide().game.platformSlug, "ps5");
  assert.notEqual(ps4.game.canonicalCatalogId, guide().game.canonicalCatalogId);
  assert.equal(ps4.physicalEditions.some((entry) => entry.id.startsWith("ac-mirage-ps5-")), false);
  assert.equal(guide().physicalEditions.some((entry) => entry.id.startsWith("ac-mirage-ps4-")), false);
});

test("QA 03: PS5 Standard ES/PT uses EAN 3307216258285", () => {
  assert.equal(edition("ac-mirage-ps5-standard-es-pt").barcode, "3307216258285");
});

test("QA 04: PS5 Standard France uses EAN 3307216258247", () => {
  assert.equal(edition("ac-mirage-ps5-standard-fr").barcode, "3307216258247");
});

test("QA 05: PS5 Standard Germany uses EAN 3307216256786", () => {
  assert.equal(edition("ac-mirage-ps5-standard-de").barcode, "3307216256786");
});

test("QA 06: PS5 Standard Italy uses EAN 3307216258261", () => {
  assert.equal(edition("ac-mirage-ps5-standard-it").barcode, "3307216258261");
});

test("QA 07: PS5 Standard PL/CZ/HU uses EAN 3307216258278", () => {
  assert.equal(edition("ac-mirage-ps5-standard-pl-cz-hu").barcode, "3307216258278");
});

test("QA 08: PS5 Standard UK uses EAN 3307216258315", () => {
  assert.equal(edition("ac-mirage-ps5-standard-uk").barcode, "3307216258315");
});

test("QA 09: PS5 Standard Australia uses EAN 3307216256762", () => {
  assert.equal(edition("ac-mirage-ps5-standard-au").barcode, "3307216256762");
  assert.equal(edition("ac-mirage-ps5-standard-au").marketRegions.includes("NZ"), false);
});

test("QA 10: PS5 Standard USA uses UPC 887256114299", () => {
  assert.equal(edition("ac-mirage-ps5-standard-us").barcode, "887256114299");
});

test("QA 11: PS5 Standard Mexico uses distinct UPC 887256114350", () => {
  const mx = edition("ac-mirage-ps5-standard-mx");
  assert.equal(mx.barcode, "887256114350");
  assert.notEqual(mx.barcode, edition("ac-mirage-ps5-standard-us").barcode);
});

test("QA 12: PS5 Standard Japan keeps JAN and ELJM together", () => {
  const japan = edition("ac-mirage-ps5-standard-jp");
  assert.equal(japan.barcode, "4949244013314");
  assert.equal(japan.catalogNumber, "ELJM-30329");
});

test("QA 13: PS5 Standard Asia Chinese uses EAN 3307216275121", () => {
  const asia = edition("ac-mirage-ps5-standard-asia-chinese");
  assert.equal(asia.barcode, "3307216275121");
  assert.deepEqual(asia.softwareLanguages, ["EN", "JA", "ZH-HANS", "ZH-HANT", "KO"]);
  assert.deepEqual(asia.packagingLanguages, []);
});

test("QA 14: standalone Standard Canada is not invented", () => {
  const standards = guide().editionFamilies.find((family) => family.id === "standard");
  assert.ok(standards);
  assert.equal(standards.physicalEditionIds.some((id) => edition(id).marketRegions.includes("CA")), false);
  assert.equal(
    guide().researchTasks.find((task) => task.id === "mirage-ps5-standard-ca-unconfirmed")?.status,
    "PHYSICAL_VARIANT_NOT_CONFIRMED",
  );
});

test("QA 15: Deluxe USA and Canada remain separate physical SKUs", () => {
  const usa = edition("ac-mirage-ps5-deluxe-us");
  const canada = edition("ac-mirage-ps5-deluxe-ca");
  assert.deepEqual(usa.marketRegions, ["US"]);
  assert.deepEqual(canada.marketRegions, ["CA"]);
  assert.equal(usa.barcode, "887256114282");
  assert.equal(canada.barcode, "887256114398");
  assert.notEqual(usa.barcode, canada.barcode);
});

test("QA 16: Deluxe Mexico reuses USA evidence without creating a duplicate variant", () => {
  const deluxe = guide().editionFamilies.find((family) => family.id === "deluxe");
  assert.ok(deluxe);
  assert.equal(deluxe.physicalEditionIds.some((id) => edition(id).marketRegions.includes("MX")), false);
  const usa = edition("ac-mirage-ps5-deluxe-us");
  assert.equal(usa.barcode, "887256114282");
  assert.deepEqual(usa.evidenceMarkets, ["US", "MX"]);
});

test("QA 17: Launch Canada uses UPC 887256114381", () => {
  assert.equal(edition("ac-mirage-ps5-launch-ca").barcode, "887256114381");
});

test("QA 18: Collector EU and USA share one conceptual edition family", () => {
  const collector = guide().editionFamilies.find((family) => family.id === "collectors-case");
  assert.ok(collector);
  assert.equal(collector.label, "Collector's Case");
  assert.ok(collector.physicalEditionIds.includes("ac-mirage-ps5-collectors-case-us-pending"));
  assert.ok(collector.physicalEditionIds.includes("ac-mirage-ps5-collectors-case-eu-game-pending"));
  assert.deepEqual(edition("ac-mirage-ps5-collectors-case-us-pending").catalogIds, ["ps5-usa-assassin-s-creed-mirage-collector-s-case"]);
  assert.deepEqual(edition("ac-mirage-ps5-collectors-case-eu-game-pending").catalogIds, ["ps5-assassin-s-creed-mirage-collector-s-edition"]);
});

test("QA 19: Collector PL/CZ/HU uses EAN 3307216251392", () => {
  assert.equal(edition("ac-mirage-ps5-collectors-case-pl-cz-hu").barcode, "3307216251392");
});

test("QA 20: Collector Asia Chinese uses EAN 3307216280255", () => {
  assert.equal(edition("ac-mirage-ps5-collectors-case-asia-chinese").barcode, "3307216280255");
});

test("QA 21: PS4 identifiers never copy forward into PS5", () => {
  const ps4 = getCatalogEditionGuides().find((entry) => entry.id === PS4_GUIDE_ID);
  assert.ok(ps4);
  const ps4Barcodes = new Set(ps4.physicalEditions.flatMap((entry) => entry.barcode ? [entry.barcode] : []));
  const ps5Barcodes = guide().physicalEditions.flatMap((entry) => entry.barcode ? [entry.barcode] : []);
  for (const barcode of ps5Barcodes) assert.equal(ps4Barcodes.has(barcode), false, barcode);
  for (const value of guide().physicalEditions.flatMap((entry) => [entry.catalogNumber, entry.serial, ...entry.productCodes]).filter(Boolean)) {
    assert.equal(/^(CUSA|PLJM)-/i.test(value!), false, value);
  }
  assert.equal(edition("ac-mirage-ps5-standard-es-pt").barcode === "3307216257660", false);
  assert.equal(edition("ac-mirage-ps5-standard-it").barcode === "3307216257646", false);
});

test("QA 22: every legacy PS5 identity, route, cover and price remains public", () => {
  const expected = new Map<string, { pcPath: string; coverUrl: string; complete?: number }>([
    ["ps5-assassin-s-creed-mirage", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-mirage", coverUrl: "/covers/ps5/assassin-s-creed-mirage.jpg" }],
    ["ps5-assassin-s-creed-mirage-deluxe-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-mirage-deluxe-edition", coverUrl: "/covers/ps5/assassin-s-creed-mirage-deluxe-edition.jpg" }],
    ["ps5-assassin-s-creed-mirage-launch-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-mirage-launch-edition", coverUrl: "/covers/ps5/assassin-s-creed-mirage-launch-edition.jpg" }],
    ["ps5-assassin-s-creed-mirage-collector-s-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-mirage-collector%27s-edition", coverUrl: "/covers/ps5/assassin-s-creed-mirage-collector-s-edition.jpg" }],
    ["ps5-usa-assassin-s-creed-mirage", { pcPath: "/game/playstation-5/assassin%27s-creed-mirage", coverUrl: "/covers/ps5/usa-assassin-s-creed-mirage.jpg", complete: 11.74 }],
    ["ps5-usa-assassin-s-creed-mirage-deluxe-edition", { pcPath: "/game/playstation-5/assassin%27s-creed-mirage-deluxe-edition", coverUrl: "/covers/ps5/usa-assassin-s-creed-mirage-deluxe-edition.jpg", complete: 14.06 }],
    ["ps5-usa-assassin-s-creed-mirage-launch-edition", { pcPath: "/game/playstation-5/assassin%27s-creed-mirage-launch-edition", coverUrl: "/covers/ps5/usa-assassin-s-creed-mirage-launch-edition.jpg", complete: 17.91 }],
    ["ps5-usa-assassin-s-creed-mirage-collector-s-case", { pcPath: "/game/playstation-5/assassin%27s-creed-mirage-collector%27s-case", coverUrl: "/covers/ps5/usa-assassin-s-creed-mirage-collector-s-case.jpg", complete: 118.56 }],
  ]);
  const publicPaths = new Set<string>();
  for (const [catalogId, preserved] of expected) {
    const game = getCatalogGame(catalogId);
    assert.ok(game, catalogId);
    assert.equal(isPublicCatalogGame(game), true, catalogId);
    assert.equal(game.pcPath, preserved.pcPath, `${catalogId} pcPath`);
    assert.equal(game.coverUrl, preserved.coverUrl, `${catalogId} coverUrl`);
    assert.equal(game.estimatedPriceComplete, preserved.complete, `${catalogId} complete price`);
    assert.equal(getCatalogEditionGuide(game)?.id, GUIDE_ID, `${catalogId} guide`);
    const path = catalogGamePath(game);
    assert.ok(path.startsWith("/catalogo/"), path);
    assert.equal(resolveCatalogGameParam(path.split("/").at(-1)!)?.id, catalogId, `${catalogId} route`);
    publicPaths.add(path);
  }
  assert.equal(publicPaths.size, expected.size);
});

test("confirmed packaging stays separate from software languages and pending identifiers stay empty", () => {
  assert.deepEqual(edition("ac-mirage-ps5-standard-es-pt").packagingLanguages, ["ES", "PT"]);
  assert.deepEqual(edition("ac-mirage-ps5-standard-fr").packagingLanguages, ["FR"]);
  assert.deepEqual(edition("ac-mirage-ps5-standard-de").packagingLanguages, ["DE"]);
  assert.deepEqual(edition("ac-mirage-ps5-standard-it").packagingLanguages, ["IT"]);
  assert.deepEqual(edition("ac-mirage-ps5-standard-jp").packagingLanguages, ["JA"]);
  for (const id of [
    "ac-mirage-ps5-standard-kr-pending",
    "ac-mirage-ps5-deluxe-kr-pending",
    "ac-mirage-ps5-collectors-case-kr-pending",
    "ac-mirage-ps5-collectors-case-us-pending",
    "ac-mirage-ps5-collectors-case-eu-game-pending",
  ]) {
    assert.equal(edition(id).barcode, undefined, id);
    assert.equal(edition(id).catalogNumber, undefined, id);
  }
});

test("the existing owned PS4 Deluxe scan remains linked only to the PS4 guide", () => {
  const scan = getOwnedScanSetById("ps4-assassins-creed-mirage-deluxe-edition");
  assert.ok(scan);
  assert.equal(scan.packaging.ean, "3307216257806");
  assert.equal(
    guide().physicalEditions.some((entry) => entry.scanSetIds.includes("ps4-assassins-creed-mirage-deluxe-edition")),
    false,
  );
});
