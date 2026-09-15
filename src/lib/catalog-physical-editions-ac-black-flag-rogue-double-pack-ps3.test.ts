import assert from "node:assert/strict";
import test from "node:test";
import rawDocument from "../../data/catalog-edition-guides-ac-black-flag-rogue-double-pack-ps3.json";
import mediaAudit from "../../data/research/ac-black-flag-rogue-double-pack-ps3-media-2026-09-15.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";

const guide = rawDocument.guides[0];
type RawEdition = {
  id: string;
  label: string;
  editionType: string;
  broadRegion: string;
  barcode?: string;
  serial: string;
  catalogNumber?: string;
  confidence?: string;
  marketRegions?: string[];
  evidenceMarkets?: string[];
  packagingLanguages?: string[];
  softwareLanguages?: string[];
  catalogIds?: string[];
  containsCatalogIds?: string[];
};
const variants = guide.physicalEditions as RawEdition[];

const LEGACY_IDS = [
  "ps3-assassin%27s-creed-black-flag-&amp;-rogue",
  "ps3-assassin%27s-creed-double-pack",
] as const;
const INCLUDED_IDS = [
  "ps3-assassin%27s-creed-iv-black-flag",
  "ps3-assassin%27s-creed-rogue",
] as const;

function byBarcode(barcode: string) {
  const result = variants.find((entry) => entry.barcode === barcode);
  assert.ok(result, `missing Double Pack barcode ${barcode}`);
  return result;
}

test("the Double Pack is one PS3 compilation, not an edition of either included game", () => {
  assert.equal(rawDocument.guides.length, 1);
  assert.equal(guide.game.canonicalGameId, "assassins-creed-black-flag-rogue-double-pack");
  assert.equal(guide.game.platformReleaseId, "assassins-creed-black-flag-rogue-double-pack-ps3");
  assert.equal(guide.game.platformSlug, "ps3");
  assert.equal(guide.game.canonicalCatalogId, LEGACY_IDS[0]);
  assert.equal(guide.editionFamilies.length, 1);
  assert.equal(guide.editionFamilies[0].id, "compilation");
  assert.ok(variants.every((entry) => entry.editionType === "COMPILATION"));
  assert.equal(mediaAudit.classification.isStandaloneProduct, true);
  assert.equal(mediaAudit.classification.isBlackFlagEdition, false);
  assert.equal(mediaAudit.classification.isRogueEdition, false);
});

test("five regional variants preserve the four known EANs and the Russian serial-only release", () => {
  assert.equal(variants.length, 5);
  assert.deepEqual(variants.map((entry) => entry.barcode), [
    "3307215888827",
    "3307215888834",
    "3307215888865",
    "3307215888803",
    undefined,
  ]);
  assert.equal(new Set(variants.flatMap((entry) => entry.barcode ? [entry.barcode] : [])).size, 4);
  const russia = variants.find((entry) => entry.id === "ac-black-flag-rogue-double-pack-ps3-ru-pending");
  assert.ok(russia);
  assert.equal(russia.serial, "BLES-02211");
  assert.equal(russia.barcode, undefined);
  assert.equal(russia.confidence, "PENDING_IDENTIFIER");
});

test("France and Italy are confirmed while English candidates keep provisional territory", () => {
  assert.deepEqual(byBarcode("3307215888834").marketRegions ?? [], ["FR"]);
  assert.equal(byBarcode("3307215888834").serial, "BLES-02204");
  assert.equal((byBarcode("3307215888834").marketRegions ?? []).includes("RU"), false);
  assert.deepEqual(byBarcode("3307215888865").marketRegions ?? [], ["IT"]);
  assert.equal(byBarcode("3307215888865").catalogNumber, "300076391");
  assert.deepEqual(byBarcode("3307215888827").marketRegions ?? [], []);
  assert.deepEqual(byBarcode("3307215888803").marketRegions ?? [], []);
  assert.deepEqual(byBarcode("3307215888803").evidenceMarkets ?? [], ["GB", "CZ", "SK", "ZA"]);
});

test("Redump languages remain software metadata and never populate packaging", () => {
  const expected = ["en", "fr", "de", "es", "it", "nl", "pt", "sv", "no", "da", "fi", "pl"];
  for (const variant of variants.filter((entry) => entry.serial === "BLES-02204")) {
    assert.deepEqual(variant.softwareLanguages ?? [], expected);
    assert.deepEqual(variant.packagingLanguages ?? [], []);
  }
  assert.deepEqual(mediaAudit.physicalMedia[0].softwareLanguages, expected);
  assert.deepEqual(mediaAudit.physicalMedia[0].packagingLanguages, []);
});

test("each regional box contains both standalone games through relations only", () => {
  for (const variant of variants) assert.deepEqual(variant.containsCatalogIds, [...INCLUDED_IDS]);
  assert.deepEqual(mediaAudit.includedGames.map((entry) => entry.catalogId), [...INCLUDED_IDS]);
  assert.ok(mediaAudit.includedGames.every((entry) => entry.relation === "CONTAINS_GAME"));
  assert.ok(mediaAudit.includedGames.every((entry) => entry.isEditionOfIncludedGame === false));
  assert.equal(mediaAudit.classification.bonusAndRetailerBundlesCount, 0);
});

test("disc composition stays unresolved instead of inventing one or two media", () => {
  assert.equal(mediaAudit.physicalMedia.length, 2);
  assert.ok(mediaAudit.physicalMedia.every((entry) => entry.mediumCount === null));
  assert.ok(mediaAudit.physicalMedia.every((entry) => entry.composition === "PENDING_PHYSICAL_SCAN_OR_DUMP_CONFIRMATION"));
  assert.ok(guide.researchTasks.some((entry) => entry.id === "doublepack-ps3-physical-media-composition"));
  assert.ok(guide.researchTasks.some((entry) => entry.id === "doublepack-ps3-russia-barcode-packaging"));
});

test("the two legacy routes map to one physical variant and retain catalog metadata", () => {
  const canonicalVariant = byBarcode("3307215888827");
  assert.deepEqual(canonicalVariant.catalogIds, [...LEGACY_IDS]);
  const expected = {
    "ps3-assassin%27s-creed-black-flag-&amp;-rogue": {
      pcId: 62323,
      coverUrl: "/covers/ps3/assassin-39-s-creed-black-flag-amp-rogue.jpg",
    },
    "ps3-assassin%27s-creed-double-pack": {
      pcId: 68930,
      coverUrl: "/covers/ps3/assassin-39-s-creed-double-pack.jpg",
    },
  } as const;
  for (const id of LEGACY_IDS) {
    const game = getCatalogGame(id);
    assert.ok(game, id);
    assert.equal(game.pcId, expected[id].pcId);
    assert.equal(game.coverUrl, expected[id].coverUrl);
    assert.match(game.pcPath ?? "", /^\/game\//);
    assert.match(catalogGamePath(game), /^\/catalogo\//);
  }
});

test("unproven national boxes and additional EANs remain research tasks", () => {
  const researchTasks = guide.researchTasks as Array<{ id: string; marketRegions?: string[] }>;
  const pending = researchTasks.find((entry) => entry.id === "doublepack-ps3-unconfirmed-european-markets");
  assert.ok(pending);
  assert.deepEqual(pending.marketRegions ?? [], ["ES", "DE", "NL", "BE", "PL", "PT", "SE", "NO", "DK", "FI"]);
  assert.ok(researchTasks.some((entry) => entry.id === "doublepack-ps3-additional-eans"));
  assert.equal(variants.some((entry) => (entry.marketRegions ?? []).some((market) => (pending.marketRegions ?? []).includes(market))), false);
});
