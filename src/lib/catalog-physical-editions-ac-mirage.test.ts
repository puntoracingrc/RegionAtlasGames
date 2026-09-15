import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame, getCollectionItem, isPublicCatalogGame } from "./catalog";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { catalogGamePath } from "./catalog-path";
import { resolveCatalogPhysicalVariant } from "./catalog-physical-variant";

const GUIDE_ID = "assassins-creed-mirage-ps4";

function mirageGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === GUIDE_ID);
  assert.ok(guide, "missing Assassin's Creed Mirage PS4 V2 guide");
  return guide;
}

function edition(id: string) {
  const value = mirageGuide().physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing ${id}`);
  return value;
}

test("Mirage PS4 has one canonical work and four conceptual edition families", () => {
  const guide = mirageGuide();
  assert.equal(guide.schemaVersion, 2);
  assert.equal(guide.game.title, "Assassin's Creed Mirage");
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassin%27s-creed-mirage");
  assert.deepEqual(guide.editionFamilies.map((family) => family.id), [
    "standard",
    "deluxe",
    "collectors-case",
    "launch",
  ]);

  const assigned = guide.editionFamilies.flatMap((family) => family.physicalEditionIds);
  assert.equal(new Set(assigned).size, guide.physicalEditions.length);
  assert.deepEqual(new Set(assigned), new Set(guide.physicalEditions.map((entry) => entry.id)));
});

test("Mirage Standard keeps every documented regional barcode separate", () => {
  const expected = new Map([
    ["ac-mirage-ps4-standard-es-pt", "3307216257660"],
    ["ac-mirage-ps4-standard-fr", "3307216257622"],
    ["ac-mirage-ps4-standard-it", "3307216257646"],
    ["ac-mirage-ps4-standard-de", "3307216256748"],
    ["ac-mirage-ps4-standard-pl-cz-hu", "3307216257653"],
    ["ac-mirage-ps4-standard-en-pack", "3307216257684"],
    ["ac-mirage-ps4-standard-uk-candidate", "3307216257691"],
    ["ac-mirage-ps4-standard-au", "3307216256724"],
    ["ac-mirage-ps4-standard-us", "887256114138"],
    ["ac-mirage-ps4-standard-ca", "887256114268"],
    ["ac-mirage-ps4-standard-mx", "887256114220"],
    ["ac-mirage-ps4-standard-jp", "4949244013307"],
  ]);
  for (const [id, barcode] of expected) assert.equal(edition(id).barcode, barcode, id);

  const englishPack = edition("ac-mirage-ps4-standard-en-pack");
  const ukCandidate = edition("ac-mirage-ps4-standard-uk-candidate");
  assert.notEqual(englishPack.id, ukCandidate.id);
  assert.notEqual(englishPack.barcode, ukCandidate.barcode);
  assert.deepEqual(englishPack.packagingLanguages, ["EN"]);
  assert.deepEqual(ukCandidate.packagingLanguages, []);

  assert.equal(new Set([
    edition("ac-mirage-ps4-standard-us").barcode,
    edition("ac-mirage-ps4-standard-ca").barcode,
    edition("ac-mirage-ps4-standard-mx").barcode,
  ]).size, 3);
});

test("Japan, Korea and Asia Chinese remain separate and pending identifiers are not invented", () => {
  const japan = edition("ac-mirage-ps4-standard-jp");
  const korea = edition("ac-mirage-ps4-standard-kr-pending");
  const asia = edition("ac-mirage-ps4-standard-asia-chinese-pending");
  assert.deepEqual(japan.marketRegions, ["JP"]);
  assert.equal(japan.catalogNumber, "PLJM-17271");
  assert.equal(japan.barcode, "4949244013307");
  assert.deepEqual(japan.packagingLanguages, ["JA"]);
  assert.deepEqual(korea.marketRegions, ["KR"]);
  assert.equal(korea.barcode, undefined);
  assert.equal(korea.catalogNumber, undefined);
  assert.equal(asia.barcode, undefined);
  assert.equal(asia.serial, undefined);
  assert.ok(asia.notes.some((note) => note.includes("CUSA-33152")));
});

test("Mirage Deluxe variants retain their own barcodes, catalog ownership and scan", () => {
  const expected = new Map([
    ["ac-mirage-ps4-deluxe-es-pt", "3307216257806"],
    ["ac-mirage-ps4-deluxe-fr", "3307216257769"],
    ["ac-mirage-ps4-deluxe-it", "3307216257783"],
    ["ac-mirage-ps4-deluxe-de", "3307216256861"],
    ["ac-mirage-ps4-deluxe-nl", "3307216257752"],
    ["ac-mirage-ps4-deluxe-pl-cz-nl-pending", "3307216257790"],
    ["ac-mirage-ps4-deluxe-au", "3307216256847"],
    ["ac-mirage-ps4-deluxe-us", "887256114145"],
  ]);
  for (const [id, barcode] of expected) assert.equal(edition(id).barcode, barcode, id);

  const spanish = edition("ac-mirage-ps4-deluxe-es-pt");
  assert.deepEqual(spanish.catalogIds, ["ps4-assassins-creed-mirage-deluxe-edition"]);
  assert.deepEqual(spanish.scanSetIds, ["ps4-assassins-creed-mirage-deluxe-edition"]);
  assert.equal(getOwnedScanSetById(spanish.scanSetIds[0])?.packaging.ean, "3307216257806");
  assert.equal(getOwnedScanSetById(spanish.scanSetIds[0])?.packaging.reference, "CUSA-33151");
  assert.equal(
    mirageGuide().physicalEditions.filter((entry) => entry.scanSetIds.length > 0).length,
    1,
  );

  const ambiguous = edition("ac-mirage-ps4-deluxe-pl-cz-nl-pending");
  assert.deepEqual(ambiguous.marketRegions, []);
  assert.deepEqual(ambiguous.packagingLanguages, []);
  assert.ok(ambiguous.notes.some((note) => note.includes("NEEDS_PACKAGING_VERIFICATION")));

  const asia = edition("ac-mirage-ps4-deluxe-asia-chinese-pending");
  assert.equal(asia.barcode, undefined);
  assert.equal(asia.serial, undefined);
  assert.ok(asia.notes.some((note) => note.includes("CUSA-33152")));
});

test("Collector's Case is one family with distinct Europe, North America and Asia variants", () => {
  const guide = mirageGuide();
  const family = guide.editionFamilies.find((entry) => entry.id === "collectors-case");
  assert.ok(family);
  assert.deepEqual(family.physicalEditionIds, [
    "ac-mirage-ps4-collectors-case-europe",
    "ac-mirage-ps4-collectors-case-north-america",
    "ac-mirage-ps4-collectors-case-asia-chinese",
  ]);
  for (const id of family.physicalEditionIds) {
    const collector = edition(id);
    assert.equal(collector.editionType, "COLLECTOR");
    assert.equal(collector.barcode, undefined);
  }
  assert.ok(edition(family.physicalEditionIds[0]).notes.some((note) => note.includes("Collector's Edition")));
});

test("Launch Edition never collapses into Standard and the legacy NA page stays explicitly pending", () => {
  const guide = mirageGuide();
  const launch = guide.editionFamilies.find((entry) => entry.id === "launch");
  const standard = guide.editionFamilies.find((entry) => entry.id === "standard");
  assert.ok(launch);
  assert.ok(standard);
  assert.equal(launch.physicalEditionIds.some((id) => standard.physicalEditionIds.includes(id)), false);
  assert.equal(edition("ac-mirage-ps4-launch-nl").barcode, "3307216257615");
  assert.equal(edition("ac-mirage-ps4-launch-fr").barcode, "3307216257936");
  assert.equal(edition("ac-mirage-ps4-launch-de").barcode, "3307216257912");
  assert.ok(edition("ac-mirage-ps4-launch-north-america-legacy-pending").notes.some(
    (note) => note.includes("VERIFY_NA_LAUNCH_EDITION"),
  ));
});

test("software language evidence cannot populate packaging languages", () => {
  const guide = mirageGuide();
  const europeSoftwareEvidence = guide.physicalEditions
    .flatMap((entry) => entry.evidence)
    .find((entry) => entry.id === "mirage-redump-europe");
  assert.ok(europeSoftwareEvidence?.summary?.includes("EN, FR, DE, ES, IT, PT y PL"));
  for (const id of [
    "ac-mirage-ps4-standard-fr",
    "ac-mirage-ps4-standard-de",
    "ac-mirage-ps4-standard-au",
    "ac-mirage-ps4-standard-us",
    "ac-mirage-ps4-standard-ca",
    "ac-mirage-ps4-standard-mx",
    "ac-mirage-ps4-standard-kr-pending",
    "ac-mirage-ps4-standard-asia-chinese-pending",
  ]) {
    assert.deepEqual(edition(id).packagingLanguages, [], id);
  }
});

test("linked legacy catalog pages stay public, canonicalized under the guide and region-priced", () => {
  const linkedIds = [
    "ps4-assassin%27s-creed-mirage",
    "ps4-usa-assassin%27s-creed-mirage",
    "ps4-assassins-creed-mirage-deluxe-edition",
    "ps4-usa-assassin%27s-creed-mirage-deluxe-edition",
    "ps4-assassin%27s-creed-mirage-collector%27s-edition",
    "ps4-usa-assassin%27s-creed-mirage-collector%27s-case",
    "ps4-usa-assassin%27s-creed-mirage-launch-edition",
  ];
  const paths = new Set<string>();
  for (const catalogId of linkedIds) {
    const game = getCatalogGame(catalogId);
    assert.ok(game, catalogId);
    assert.equal(isPublicCatalogGame(game), true, catalogId);
    assert.equal(getCatalogEditionGuide(game)?.id, GUIDE_ID, catalogId);
    const path = catalogGamePath(game);
    assert.ok(path.startsWith("/catalogo/"), catalogId);
    paths.add(path);
  }
  assert.equal(paths.size, linkedIds.length);

  assert.equal(getCatalogGame("ps4-assassin%27s-creed-mirage")?.estimatedPriceComplete, 18);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-mirage")?.estimatedPriceComplete, 15.06);
  assert.equal(getCatalogGame("ps4-assassins-creed-mirage-deluxe-edition")?.estimatedPriceComplete, 32);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-mirage-deluxe-edition")?.estimatedPriceComplete, 17.08);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-mirage-collector%27s-case")?.estimatedPriceComplete, 271.74);
  assert.equal(getCatalogGame("ps4-usa-assassin%27s-creed-mirage-launch-edition")?.estimatedPriceComplete, 17.25);
});

test("all historical Mirage IDs and the owned Deluxe identity remain preserved", () => {
  const historicalIds = [
    "ps4-assassin%27s-creed-mirage-collector%27s-edition",
    "ps4-assassin%27s-creed-mirage",
    "ps4-assassin%27s-creed-mirage-deluxe-edition",
    "ps4-assassin%27s-creed-mirage-launch-edition",
    "ps4-usa-assassin%27s-creed-mirage-launch-edition",
    "ps4-usa-assassin%27s-creed-mirage",
    "ps4-usa-assassin%27s-creed-mirage-collector%27s-case",
    "ps4-usa-assassin%27s-creed-mirage-deluxe-edition",
    "ps4-assassins-creed-mirage-deluxe-edition",
  ];
  for (const id of historicalIds) assert.ok(getCatalogGame(id), id);

  const owned = getCollectionItem("assassins-creed-mirage-deluxe-edition");
  assert.ok(owned);
  assert.equal(owned.catalogId, "ps4-assassins-creed-mirage-deluxe-edition");
  assert.equal(
    resolveCatalogPhysicalVariant(owned.catalogId)?.physicalVariantId,
    "ac-mirage-ps4-deluxe-es-pt",
  );
});

test("unconfirmed physical markets and identifiers remain absent", () => {
  const guide = mirageGuide();
  assert.equal(guide.physicalEditions.some((entry) => entry.marketRegions.includes("BR")), false);
  assert.equal(guide.physicalEditions.some((entry) => entry.marketRegions.includes("NZ")), false);
  assert.equal(guide.physicalEditions.some((entry) => (
    entry.editionType === "DELUXE" && entry.marketRegions.includes("CA")
  )), false);
  for (const id of [
    "ac-mirage-ps4-standard-kr-pending",
    "ac-mirage-ps4-standard-asia-chinese-pending",
    "ac-mirage-ps4-deluxe-asia-chinese-pending",
    "ac-mirage-ps4-collectors-case-europe",
    "ac-mirage-ps4-collectors-case-north-america",
    "ac-mirage-ps4-collectors-case-asia-chinese",
  ]) {
    assert.equal(edition(id).barcode, undefined, id);
  }
});
