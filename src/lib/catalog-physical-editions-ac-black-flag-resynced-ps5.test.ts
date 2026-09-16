import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-black-flag-resynced-ps5.json";
import exclusions from "../../data/research/ac-black-flag-resynced-ps5-non-edition-products-2026-09-15.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";

const guide = rawDocument.guides[0];
type RawEdition = {
  id: string;
  label: string;
  editionType: string;
  barcode?: string;
  catalogNumber?: string;
  confidence?: string;
  releaseDate: string;
  packagingLanguages?: string[];
  softwareFamilyCodes: string[];
  marketRegions?: string[];
  evidenceMarkets?: string[];
  catalogIds?: string[];
};
const editions = guide.physicalEditions as RawEdition[];

const LEGACY_IDS = [
  "ps5-assassin-s-creed-black-flag-resynced-standard-edition",
  "ps5-assassin-s-creed-black-flag-resynced-launch-edition",
  "ps5-assassin-s-creed-black-flag-resynced-collector-s-edition",
  "ps5-usa-assassin-s-creed-black-flag-resynced",
  "ps5-usa-assassin-s-creed-black-flag-resynced-launch-edition",
  "ps5-usa-assassin-s-creed-black-flag-resynced-collector-s-edition",
] as const;

function byBarcode(barcode: string) {
  const result = editions.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Resynced PS5 barcode ${barcode}`);
  return result;
}

test("Resynced PS5 has one canonical game, one platform release and the official date", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide.game.canonicalGameId, "assassins-creed-black-flag-resynced");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-black-flag-resynced-ps5");
  assert.equal(guide.game.platformSlug, "ps5");
  assert.equal(guide.game.canonicalCatalogId, LEGACY_IDS[0]);
  assert.ok(editions.every((entry) => entry.releaseDate === "2026-07-09"));
  assert.ok(editions.every((entry) => entry.barcode !== "PPSA-28183"));
  assert.ok(editions.every((entry) => entry.softwareFamilyCodes.includes("PPSA-28183")));
});

test("Standard keeps twelve physical SKUs and Asia/Hong Kong outside the count pending evidence", () => {
  const standard = guide.editionFamilies.find((entry) => entry.id === "standard");
  assert.ok(standard);
  assert.equal(standard.physicalEditionIds.length, 12);
  assert.deepEqual(standard.physicalEditionIds.map((id) => editions.find((entry) => entry.id === id)?.barcode), [
    "3307216308812",
    "3307216308829",
    "3307216308836",
    "3307216308843",
    "3307216308850",
    "3307216308867",
    "3307216308874",
    "3307216308881",
    "3307216308898",
    "3307216308904",
    "887256117177",
    "4949244013697",
  ]);
  assert.notEqual(byBarcode("3307216308898").id, byBarcode("3307216308904").id);
  assert.deepEqual(byBarcode("3307216308850").packagingLanguages ?? [], ["de", "fr", "it"]);
  assert.deepEqual(byBarcode("3307216308867").packagingLanguages ?? [], ["it"]);
  assert.deepEqual(byBarcode("4949244013697").packagingLanguages ?? [], ["ja"]);
  assert.equal(byBarcode("4949244013697").catalogNumber, "ELJM-30874");
  assert.ok(guide.researchTasks.some((entry) => entry.id === "resynced-ps5-asia-hk-standard"));
});

test("Launch is separate from Standard and preserves both disputed candidates", () => {
  const launch = guide.editionFamilies.find((entry) => entry.id === "launch");
  assert.ok(launch);
  assert.equal(launch.physicalEditionIds.length, 11);
  for (const barcode of [
    "3307216309581",
    "3307216309598",
    "3307216309604",
    "3307216309611",
    "3307216309628",
    "3307216309635",
    "3307216309642",
    "887256117191",
  ]) assert.ok(launch.physicalEditionIds.includes(byBarcode(barcode).id));
  assert.notEqual(byBarcode("3307216309635").id, byBarcode("3307216309642").id);
  assert.notEqual(byBarcode("3307216308850").editionType, byBarcode("3307216309598").editionType);
  const launchSpain = editions.find((entry) => entry.id === "ac-black-flag-resynced-ps5-launch-es-game");
  assert.ok(launchSpain);
  assert.equal(launchSpain.catalogNumber, "GAME-260679");
  assert.equal(launchSpain.barcode, undefined);
  assert.equal(launchSpain.confidence, "PENDING_IDENTIFIER");
  assert.equal(byBarcode("887256117191").catalogIds?.[0], LEGACY_IDS[4]);
  assert.equal(editions.find((entry) => entry.id === "ac-black-flag-resynced-ps5-launch-ca-pending")?.barcode, undefined);
  assert.equal(editions.find((entry) => entry.id === "ac-black-flag-resynced-ps5-launch-au-nz-pending")?.barcode, undefined);
});

test("Collector keeps Europe, Spain, USA, Canada, Oceania and Mexico decisions explicit", () => {
  const collectors = guide.editionFamilies.find((entry) => entry.id === "collectors");
  assert.ok(collectors);
  assert.equal(collectors.physicalEditionIds.length, 6);
  assert.deepEqual(byBarcode("3307216309178").evidenceMarkets ?? [], ["FR", "GB", "PL", "CH"]);
  assert.deepEqual(byBarcode("887256117207").marketRegions ?? [], ["US"]);
  assert.notEqual(byBarcode("3307216309178").id, byBarcode("887256117207").id);
  const spain = editions.find((entry) => entry.id === "ac-black-flag-resynced-ps5-collectors-es-pending");
  const canada = editions.find((entry) => entry.id === "ac-black-flag-resynced-ps5-collectors-ca-pending");
  assert.ok(spain && canada);
  assert.equal(spain.barcode, undefined);
  assert.equal(canada.barcode, undefined);
  assert.equal(spain.catalogIds?.[0], LEGACY_IDS[2]);
  assert.equal((byBarcode("3307216309178").evidenceMarkets ?? []).includes("ES"), false);
  assert.equal((byBarcode("887256117207").marketRegions ?? []).includes("CA"), false);
});

test("Deluxe, promotional SteelBooks and retailer or hardware bundles never become PhysicalEdition rows", () => {
  assert.equal(editions.some((entry) => /deluxe/i.test(entry.label)), false);
  assert.equal(exclusions.digitalEditions[0].distribution, "DIGITAL_ONLY");
  assert.equal(exclusions.digitalEditions[0].countsAsPhysicalEdition, false);
  assert.equal(guide.physicalBonusItems[0].includesGame, false);
  assert.equal(exclusions.physicalBonusItems[0].relation, "PREORDER_BONUS");
  assert.equal(exclusions.physicalBonusItems[0].countsAsPhysicalEdition, false);
  assert.equal(exclusions.retailerBundles.length, 2);
  assert.ok(exclusions.retailerBundles.every((entry) => entry.retailer === "Xtralife"));
  assert.ok(exclusions.retailerBundles.every((entry) => entry.countsAsOfficialPhysicalEdition === false));
  assert.equal(exclusions.hardwareBundlePolicy.countsAsPhysicalEdition, false);
});

test("all 29 regional physical rows have unique identities and no duplicate physical barcode", () => {
  assert.equal(guide.editionFamilies.length, 3);
  assert.equal(editions.length, 29);
  assert.equal(new Set(editions.map((entry) => entry.id)).size, editions.length);
  const barcodes = editions.flatMap((entry) => entry.barcode ? [entry.barcode] : []);
  assert.equal(new Set(barcodes).size, barcodes.length);
});

test("disputed EAN pairs remain explicitly unresolved", () => {
  assert.deepEqual(exclusions.disputedPhysicalRelations, [
    {
      leftBarcode: "3307216308898",
      rightBarcode: "3307216308904",
      resolution: "KEEP_SEPARATE_PENDING_PHYSICAL_COMPARISON",
    },
    {
      leftBarcode: "3307216309635",
      rightBarcode: "3307216309642",
      resolution: "KEEP_SEPARATE_PENDING_PHYSICAL_COMPARISON",
    },
    {
      leftBarcode: "3307216308850",
      rightBarcode: "3307216309598",
      resolution: "KEEP_SEPARATE_PENDING_INNER_OUTER_SCAN",
    },
  ]);
});

test("the six legacy catalog identities retain routes, covers and source identifiers", () => {
  const expectedPcIds: Record<(typeof LEGACY_IDS)[number], number> = {
    "ps5-assassin-s-creed-black-flag-resynced-standard-edition": 14193316,
    "ps5-assassin-s-creed-black-flag-resynced-launch-edition": 13633541,
    "ps5-assassin-s-creed-black-flag-resynced-collector-s-edition": 13633552,
    "ps5-usa-assassin-s-creed-black-flag-resynced": 13634930,
    "ps5-usa-assassin-s-creed-black-flag-resynced-launch-edition": 13645084,
    "ps5-usa-assassin-s-creed-black-flag-resynced-collector-s-edition": 13634931,
  };
  for (const id of LEGACY_IDS) {
    const game = getCatalogGame(id);
    assert.ok(game, id);
    assert.equal(game.pcId, expectedPcIds[id]);
    assert.match(game.coverUrl ?? "", /^\/covers\/ps5\/.*black-flag-resynced.*\.jpg$/);
    assert.match(game.pcPath ?? "", /^\/game\//);
    assert.match(catalogGamePath(game), /^\/catalogo\//);
  }
  assert.deepEqual(
    editions.flatMap((entry) => entry.catalogIds ?? []),
    [LEGACY_IDS[0], LEGACY_IDS[3], LEGACY_IDS[1], LEGACY_IDS[4], LEGACY_IDS[2], LEGACY_IDS[5]],
  );
});
