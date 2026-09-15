import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { isReleasedPhysicalEdition } from "./catalog-edition-guide-types";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { toCatalogListGame } from "./catalog-list-game";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { getCatalogPhysicalEditionPublicIdentity, groupCatalogListGames } from "./catalog-physical-edition-browse";
import { catalogGamePath, resolveCatalogGameParam } from "./catalog-url";

const GUIDE_ID = "assassins-creed-valhalla-ps5";
const DAWN_GUIDE_ID = "assassins-creed-valhalla-dawn-of-ragnarok-ps5";
const PS4_GUIDE_ID = "assassins-creed-valhalla-ps4-worldwide";

function guide() {
  const value = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(value, "missing Assassin's Creed Valhalla PS5 V2 guide");
  return value;
}

function dawnGuide() {
  const value = getCatalogEditionGuides().find((entry) => entry.id === DAWN_GUIDE_ID);
  assert.ok(value, "missing Dawn of Ragnarök PS5 V2 guide");
  return value;
}

function edition(id: string) {
  const value = guide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing ${id}`);
  return value;
}

test("QA 01: one canonical Valhalla PS5 game anchors seven complete edition families", () => {
  const value = guide();
  assert.equal(value.game.canonicalCatalogId, "ps5-assassin-s-creed-valhalla");
  assert.equal(value.game.platformSlug, "ps5");
  assert.deepEqual(value.editionFamilies.map((family) => family.id), [
    "standard", "gold", "drakkar", "ultimate", "limited", "collector", "ragnarok",
  ]);
  const assigned = value.editionFamilies.flatMap((family) => family.physicalEditionIds);
  assert.equal(assigned.length, value.physicalEditions.length);
  assert.deepEqual(new Set(assigned), new Set(value.physicalEditions.map((entry) => entry.id)));
});

test("QA 02: PS4 and PS5 release trees stay independent", () => {
  const ps4 = getCatalogEditionGuides().find((entry) => entry.id === PS4_GUIDE_ID);
  assert.ok(ps4);
  assert.equal(ps4.game.platformSlug, "ps4");
  assert.equal(guide().game.platformSlug, "ps5");
  assert.notEqual(ps4.game.canonicalCatalogId, guide().game.canonicalCatalogId);
  assert.equal(ps4.physicalEditions.some((entry) => entry.id.startsWith("ac-valhalla-ps5-")), false);
});

test("QA 03-05: Spain uses its PS5 EAN and Spanish box without inventing Portugal", () => {
  const spain = edition("ac-valhalla-ps5-standard-es");
  assert.equal(spain.barcode, "3307216174349");
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.marketRegions, ["ES"]);
  assert.deepEqual(spain.evidenceMarkets, ["ES", "PT"]);
  assert.equal(
    guide().physicalEditions.some((entry) => entry.marketRegions.length === 1 && entry.marketRegions[0] === "PT"),
    false,
  );
  assert.match(
    guide().researchTasks.find((task) => task.id === "valhalla-ps5-portugal-dedicated")?.notes.join(" ") ?? "",
    /3307216174332.*5601988529733/,
  );
});

test("QA 06: FR/NL A and B remain distinct and B packaging remains pending", () => {
  const a = edition("ac-valhalla-ps5-standard-fr-nl-a");
  const b = edition("ac-valhalla-ps5-standard-fr-nl-b");
  assert.equal(a.barcode, "3307216174127");
  assert.deepEqual(a.packagingLanguages, ["FR", "NL"]);
  assert.equal(b.barcode, "3307216174196");
  assert.deepEqual(b.packagingLanguages, []);
  assert.deepEqual(b.evidenceMarkets, ["FR", "NL"]);
});

test("QA 07-11: Germany, Italy, UK, Poland and Australia keep exact PS5 identities", () => {
  assert.equal(edition("ac-valhalla-ps5-standard-de").barcode, "3307216174219");
  assert.deepEqual(edition("ac-valhalla-ps5-standard-de").packagingLanguages, ["DE"]);
  assert.equal(edition("ac-valhalla-ps5-standard-it").barcode, "3307216174257");
  assert.deepEqual(edition("ac-valhalla-ps5-standard-it").packagingLanguages, []);
  const uk = edition("ac-valhalla-ps5-standard-uk");
  assert.equal(uk.barcode, "3307216174165");
  assert.deepEqual(uk.packagingLanguages, ["EN"]);
  assert.deepEqual(uk.productCodes, ["PPSA-01532"]);
  const poland = edition("ac-valhalla-ps5-standard-pl-cee");
  assert.equal(poland.barcode, "3307216174387");
  assert.deepEqual(poland.packagingLanguages, ["EN"]);
  assert.deepEqual(poland.softwareLanguages, ["PL", "EN"]);
  const australia = edition("ac-valhalla-ps5-standard-au");
  assert.equal(australia.barcode, "3307216174103");
  assert.equal(australia.marketRegions.includes("NZ"), false);
});

test("QA 12: all three USA UPCs remain separate", () => {
  const usa = ["us-a", "us-b", "us-c"].map((suffix) => edition(`ac-valhalla-ps5-standard-${suffix}`));
  assert.deepEqual(usa.map((entry) => entry.barcode), ["887256090753", "887256112554", "887256090661"]);
  assert.equal(new Set(usa.map((entry) => entry.barcode)).size, 3);
  assert.deepEqual(usa[2].evidenceMarkets, ["US", "CL"]);
});

test("QA 13: Japan Standard keeps JAN and ELJM together", () => {
  const japan = edition("ac-valhalla-ps5-standard-jp");
  assert.equal(japan.barcode, "4949244011594");
  assert.equal(japan.catalogNumber, "ELJM-30007");
  assert.deepEqual(japan.packagingLanguages, ["JA"]);
});

test("Asia and Korea do not collapse into Japan or into one another", () => {
  const asia = edition("ac-valhalla-ps5-standard-asia-en");
  const korea = edition("ac-valhalla-ps5-standard-kr-pending");
  assert.deepEqual(asia.productCodes, ["PPSA-01504"]);
  assert.deepEqual(asia.packagingLanguages, ["EN"]);
  assert.equal(asia.barcode, undefined);
  assert.deepEqual(korea.marketRegions, ["KR"]);
  assert.equal(korea.barcode, undefined);
  assert.equal(korea.countsAsNativePhysicalRelease, false);
});

test("QA 14-15: Gold Spain and USA Steelbook keep distinct physical barcodes", () => {
  assert.equal(edition("ac-valhalla-ps5-gold-es").barcode, "3307216173724");
  const steelbook = edition("ac-valhalla-ps5-gold-steelbook-us");
  assert.equal(steelbook.barcode, "887256110826");
  assert.equal(steelbook.editionType, "STEELBOOK");
});

test("QA 16: Drakkar PS5 uses EAN 3307216173823", () => {
  assert.equal(edition("ac-valhalla-ps5-drakkar-eu-game").barcode, "3307216173823");
});

test("QA 17-19: Ultimate DE, AT and JP stay separate", () => {
  assert.equal(edition("ac-valhalla-ps5-ultimate-de").barcode, "3307216173991");
  assert.equal(edition("ac-valhalla-ps5-ultimate-at").barcode, "3307216174011");
  const japan = edition("ac-valhalla-ps5-ultimate-jp");
  assert.equal(japan.barcode, "4949244011600");
  assert.equal(japan.catalogNumber, "ELJM-30010");
});

test("Limited PS5 keeps the legacy route while barcode and reverse scan remain pending", () => {
  const limited = edition("ac-valhalla-ps5-limited-eu-pending");
  assert.equal(limited.catalogIds[0], "ps5-assassin-s-creed-valhalla-limited-edition");
  assert.equal(limited.barcode, undefined);
  assert.equal(limited.nativePhysicalPlatform, undefined);
  assert.equal(limited.containsDisc, undefined);
  assert.equal(limited.countsAsNativePhysicalRelease, false);
  assert.equal(limited.notes.join(" ").includes("3307216168782"), true);
});

test("QA 20: Collector remains visible only as PS4-native media with a PS5 upgrade", () => {
  for (const id of ["ac-valhalla-collector-playstation-eu", "ac-valhalla-collector-playstation-na"]) {
    const collector = edition(id);
    assert.equal(collector.nativePhysicalPlatform, "ps4");
    assert.deepEqual(collector.compatiblePlatforms, ["ps4", "ps5"]);
    assert.equal(collector.containsDisc, true);
    assert.equal(collector.upgradeToPS5, true);
    assert.equal(collector.upgradePath, "FREE_DIGITAL_PS5_UPGRADE");
    assert.equal(collector.countsAsNativePhysicalRelease, false);
  }
  assert.equal(edition("ac-valhalla-collector-playstation-na").barcode, "887256110024");
});

test("Collector and unconfirmed Korea are excluded from native physical counts", () => {
  const ids = [
    "ps5-assassin-s-creed-valhalla",
    "ps5-assassin-s-creed-valhalla-collector-s-edition",
    "ps5-usa-assassin-s-creed-valhalla-collector-s-edition",
  ];
  const grouped = groupCatalogListGames(ids.map((id) => toCatalogListGame(getCatalogGame(id)!)));
  const standard = grouped.find((entry) => entry.id === "ps5-assassin-s-creed-valhalla");
  const collector = grouped.find((entry) => entry.id === "ps5-assassin-s-creed-valhalla-collector-s-edition");
  assert.equal(standard?.physicalEditionGroup?.physicalEditionCount, 13);
  assert.equal(collector?.physicalEditionGroup?.physicalEditionCount, 0);
  const standardGame = getCatalogGame("ps5-assassin-s-creed-valhalla");
  const collectorGame = getCatalogGame("ps5-assassin-s-creed-valhalla-collector-s-edition");
  assert.ok(standardGame);
  assert.ok(collectorGame);
  assert.match(getCatalogPhysicalEditionPublicIdentity(standardGame, "PlayStation 5")?.description ?? "", /13 ediciones físicas nativas/);
  assert.match(getCatalogPhysicalEditionPublicIdentity(collectorGame, "PlayStation 5")?.description ?? "", /sin soporte nativo verificado/);
});

test("the shared released-native predicate keeps Shadows and Valhalla counts independent", () => {
  const shadows = getCatalogEditionGuides().find((entry) => entry.id === "assassins-creed-shadows-ps5-worldwide");
  assert.ok(shadows);
  const shadowsGold = shadows.editionFamilies.find((entry) => entry.id === "gold-canceled");
  const standard = guide().editionFamilies.find((entry) => entry.id === "standard");
  const collector = guide().editionFamilies.find((entry) => entry.id === "collector");
  assert.ok(shadowsGold);
  assert.ok(standard);
  assert.ok(collector);

  const counted = (ids: string[], editions = guide().physicalEditions) => editions
    .filter((entry) => ids.includes(entry.id))
    .filter(isReleasedPhysicalEdition).length;

  assert.equal(counted(shadowsGold.physicalEditionIds, shadows.physicalEditions), 0);
  assert.equal(counted(standard.physicalEditionIds), 13);
  assert.equal(counted(collector.physicalEditionIds), 0);

  const korea = edition("ac-valhalla-ps5-standard-kr-pending");
  assert.equal(korea.releaseStatus, "RELEASED");
  assert.equal(korea.countsAsNativePhysicalRelease, false);
  assert.equal(isReleasedPhysicalEdition(korea), false);
  assert.equal(dawnGuide().physicalEditions.filter(isReleasedPhysicalEdition).length, 0);

  const dawnGame = getCatalogGame("ps5-assassin-s-creed-valhalla-dawn-of-ragnarok");
  assert.ok(dawnGame);
  const groupedDawn = groupCatalogListGames([toCatalogListGame(dawnGame)]);
  assert.equal(groupedDawn[0].physicalEditionGroup?.physicalEditionCount, 0);
});

test("QA 21: Ragnarök is a base-disc bundle and not the Dawn expansion entity", () => {
  const ragnarokFamily = guide().editionFamilies.find((family) => family.id === "ragnarok");
  assert.ok(ragnarokFamily);
  for (const id of ragnarokFamily.physicalEditionIds) {
    const ragnarok = edition(id);
    assert.equal(ragnarok.containsDisc, true);
    assert(ragnarok.physicalContents.some((entry) => /base game disc/i.test(entry)));
    assert(ragnarok.digitalContents.some((entry) => /Dawn of Ragnarök/i.test(entry)));
    assert.equal(ragnarok.expansionOf, undefined);
  }
  assert.notEqual(guide().game.canonicalCatalogId, dawnGuide().game.canonicalCatalogId);
});

test("QA 22: Ragnarök Japan keeps JAN and ELJM-30124", () => {
  const japan = edition("ac-valhalla-ps5-ragnarok-jp");
  assert.equal(japan.barcode, "4949244012881");
  assert.equal(japan.catalogNumber, "ELJM-30124");
});

test("Ragnarök keeps six worldwide variants including both Australian EANs", () => {
  const ragnarok = guide().editionFamilies.find((family) => family.id === "ragnarok");
  assert.ok(ragnarok);
  assert.equal(ragnarok.physicalEditionIds.length, 6);
  assert.equal(edition("ac-valhalla-ps5-ragnarok-eu").barcode, "3307216232650");
  assert.equal(edition("ac-valhalla-ps5-ragnarok-dfi-at-ch").barcode, "3307216232957");
  assert.equal(edition("ac-valhalla-ps5-ragnarok-us").barcode, "887256112639");
  assert.equal(edition("ac-valhalla-ps5-ragnarok-au-a").barcode, "3307216232544");
  assert.equal(edition("ac-valhalla-ps5-ragnarok-au-b").barcode, "3307216232902");
});

test("QA 23: Dawn Code in a Box has no disc, redeems the expansion and requires Valhalla", () => {
  const dawn = dawnGuide();
  assert.equal(dawn.editionFamilies[0].id, "code-in-box");
  assert.deepEqual(dawn.physicalEditions.map((entry) => entry.barcode), ["3307216234258", "3307216234142"]);
  for (const codeProduct of dawn.physicalEditions) {
    assert.equal(codeProduct.physicalProductType, "DOWNLOAD_CODE_IN_BOX");
    assert.equal(codeProduct.containsDisc, false);
    assert.equal(codeProduct.countsAsNativePhysicalRelease, false);
    assert.equal(codeProduct.requiresBaseGame, true);
    assert.equal(codeProduct.expansionOf, "ps5-assassin-s-creed-valhalla");
    assert.equal(codeProduct.redeems, "Assassin's Creed Valhalla: Dawn of Ragnarök");
  }
  const grouped = groupCatalogListGames([
    toCatalogListGame(getCatalogGame("ps5-assassin-s-creed-valhalla-dawn-of-ragnarok")!),
  ]);
  assert.equal(grouped[0]?.physicalEditionGroup?.physicalEditionCount, 0);
});

test("QA 24: no PS4 EAN, CUSA or PLJM is copied into PS5 native editions", () => {
  const nativePs5 = guide().physicalEditions.filter((entry) => entry.countsAsNativePhysicalRelease !== false);
  const forbiddenPs4Barcodes = new Set([
    "3307216168379", "3307216168553", "887256110628", "3307216168423",
    "887256110642", "3307216168782", "3307216168904",
  ]);
  for (const barcode of nativePs5.flatMap((entry) => entry.barcode ? [entry.barcode] : [])) {
    assert.equal(forbiddenPs4Barcodes.has(barcode), false, barcode);
  }
  for (const value of nativePs5.flatMap((entry) => [entry.catalogNumber, entry.serial, ...entry.productCodes]).filter(Boolean)) {
    assert.equal(/^(CUSA|PLJM)-/i.test(value!), false, value);
  }
});

test("QA 25: all thirteen legacy PS5 identities, URLs, covers and prices remain public", () => {
  const expected = new Map<string, { pcPath: string; coverUrl: string; complete?: number; sealed?: number; loose?: number }>([
    ["ps5-assassin-s-creed-valhalla", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla", coverUrl: "/covers/ps5/assassin-s-creed-valhalla.jpg" }],
    ["ps5-assassin-s-creed-valhalla-limited-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-limited-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-limited-edition.jpg" }],
    ["ps5-assassin-s-creed-valhalla-ragnarok-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-ragnarok-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-ragnarok-edition.jpg" }],
    ["ps5-assassin-s-creed-valhalla-dawn-of-ragnarok", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-dawn-of-ragnarok", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-dawn-of-ragnarok.jpg" }],
    ["ps5-assassin-s-creed-valhalla-collector-s-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-collector%27s-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-collector-s-edition.jpg" }],
    ["ps5-assassin-s-creed-valhalla-ultimate-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-ultimate-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-ultimate-edition.jpg" }],
    ["ps5-assassin-s-creed-valhalla-gold-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-gold-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-gold-edition.jpg" }],
    ["ps5-assassin-s-creed-valhalla-drakkar-edition", { pcPath: "/game/pal-playstation-5/assassin%27s-creed-valhalla-drakkar-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-drakkar-edition.jpg" }],
    ["ps5-usa-assassin-s-creed-valhalla", { pcPath: "/game/playstation-5/assassin%27s-creed-valhalla", coverUrl: "/covers/ps5/usa-assassin-s-creed-valhalla.jpg", complete: 12.74, sealed: 15.13, loose: 9.63 }],
    ["ps5-usa-assassin-s-creed-valhalla-collector-s-edition", { pcPath: "/game/playstation-5/assassin%27s-creed-valhalla-collector%27s-edition", coverUrl: "/covers/ps5/usa-assassin-s-creed-valhalla-collector-s-edition.jpg", complete: 152.15, sealed: 197.58 }],
    ["ps5-usa-assassin-s-creed-valhalla-gold-edition", { pcPath: "/game/playstation-5/assassin%27s-creed-valhalla-gold-edition", coverUrl: "/covers/ps5/usa-assassin-s-creed-valhalla-gold-edition.jpg", complete: 49.18, sealed: 72.12, loose: 47.98 }],
    ["ps5-japon-assassin%27s-creed-valhalla", { pcPath: "/game/jp-playstation-5/assassin%27s-creed-valhalla", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-2.jpg" }],
    ["ps5-japon-assassin%27s-creed-valhalla-ultimate-edition", { pcPath: "/game/jp-playstation-5/assassin%27s-creed-valhalla-ultimate-edition", coverUrl: "/covers/ps5/assassin-s-creed-valhalla-ultimate-edition-2.jpg" }],
  ]);
  const paths = new Set<string>();
  for (const [id, preserved] of expected) {
    const game = getCatalogGame(id);
    assert.ok(game, id);
    assert.equal(isPublicCatalogGame(game), true, id);
    assert.equal(game.pcPath, preserved.pcPath, `${id} pcPath`);
    assert.equal(game.coverUrl, preserved.coverUrl, `${id} cover`);
    assert.equal(game.estimatedPriceComplete, preserved.complete, `${id} complete`);
    assert.equal(game.estimatedPriceSealed, preserved.sealed, `${id} sealed`);
    assert.equal(game.estimatedPriceLoose, preserved.loose, `${id} loose`);
    const path = catalogGamePath(game);
    assert.equal(resolveCatalogGameParam(path.split("/").at(-1)!)?.id, id, `${id} route`);
    assert.equal(getCatalogEditionGuide(game)?.id, id.includes("dawn-of-ragnarok") ? DAWN_GUIDE_ID : GUIDE_ID, `${id} guide`);
    paths.add(path);
  }
  assert.equal(paths.size, expected.size);
});

test("the existing owned PS4 scan remains linked only to the PS4 guide", () => {
  const scan = getOwnedScanSetById("ps4-assassins-creed-valhalla");
  assert.ok(scan);
  assert.equal(scan.packaging.ean, "3307216168379");
  assert.equal(guide().physicalEditions.some((entry) => entry.scanSetIds.includes("ps4-assassins-creed-valhalla")), false);
  assert.equal(dawnGuide().physicalEditions.some((entry) => entry.scanSetIds.includes("ps4-assassins-creed-valhalla")), false);
});
