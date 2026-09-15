import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import acPs3GuideDocument from "../../data/catalog-edition-guides-ac-ps3.json";
import acPs3Implementation from "../../data/research/ac-ps3-backed-v2-2026-09-13.json";
import acPs3RegionalDecisions from "../../data/research/ac-ps3-regional-packaging-decisions-2026-09-13.json";
import guideDocument from "../../data/catalog-edition-guides.json";
import residentEvilPs4Dedup from "../../data/research/resident-evil-ps4-dedup-2026-09-15.json";
import scanAssets from "../../data/research/owned-scans/2026-09-12-absolum-special-edition-assets.json";
import schemaDocument from "../../data/schemas/catalog-edition-guides-v2.schema.json";
import { catalog, getCatalogGame, getPlatform, publicListedCatalog } from "./catalog";
import {
  getCatalogEditionGuide,
  getCatalogEditionGuides,
  getGroupableCatalogEditionGuides,
  normalizeCatalogEditionGuide,
  type RawCatalogEditionGuide,
} from "./catalog-edition-guides";
import {
  BROAD_REGION_VALUES,
  CATALOG_MARKET_REGION_META,
  CATALOG_MARKET_REGION_VALUES,
  CATALOG_PHYSICAL_PRICE_CONDITION_VALUES,
  PHYSICAL_EDITION_TYPE_VALUES,
  PHYSICAL_EVIDENCE_TYPE_VALUES,
  PHYSICAL_RELEASE_STATUS_VALUES,
  canEvidenceDefinePhysicalVariant,
  catalogEditionFamilyCountLabel,
  catalogEditionFamilyHasVariants,
  catalogMarketRegionToLegacyRegion,
  isCatalogMarketRegion,
  isStrongPhysicalEvidence,
  isReleasedPhysicalEdition,
} from "./catalog-edition-guide-types";
import { filterCatalogGames, type CatalogFilterState } from "./catalog-filters";
import { toCatalogListGame } from "./catalog-list-game";
import {
  getOwnedScanSet,
  getOwnedScanSetById,
  withOwnedScanDetails,
} from "./catalog-owned-scans";
import {
  catalogPhysicalEditionBroadRegionAnchorId,
  catalogPhysicalEditionOverviewRegionLinks,
  catalogPhysicalEditionOverviewRegions,
  catalogPhysicalFilterOptions,
  getCatalogPhysicalEditionPublicIdentity,
  groupCatalogListGames,
} from "./catalog-physical-edition-browse";
import { catalogPhysicalEditionHeadingLabel } from "./catalog-physical-edition-display";
import { buildGameFaq, buildGameJsonLd, buildGameMetadata } from "./catalog-seo";
import {
  catalogOverlayRevision,
  mergePublicCatalogWithOverlayGames,
  resolveCatalogGameDetailsCatalogId,
} from "./catalog-runtime-overlay";
import { getCompany, getGameDetails } from "./indexes";
import { publicCatalogRegionFilterOptionsForPlatform } from "./public-catalog-filter-options";
import { enrichCatalogCards } from "./catalog-card-enrichment";
import { toCatalogQuickSearchGame } from "./catalog-quick-search-game";
import { getDefaultCatalogInitialPage, getDefaultPlatformInitialPage } from "./public-catalog-initial-page";
import { getRegionDisplay } from "./region-display";
import {
  collectionItemMatchesPhysicalVariant,
  collectionPhysicalIdentityKey,
  countOwnedPhysicalVariant,
  resolveCatalogPhysicalVariant,
} from "./catalog-physical-variant";
import { catalogGameToCollectionItem } from "./collection-store";
import { conditionPriceEntries } from "./condition-prices";
import { catalogGamePath } from "./catalog-url";
import {
  catalogEbayOfferCacheKey,
  catalogEbayRegionOptions,
  catalogGamePathWithEbayRegion,
  resolveCatalogEbayRegion,
} from "./catalog-ebay-region";
import { catalogConditionPriceRows } from "./price-display";
import {
  CATALOG_REGION_RAIL_CODES,
  catalogRegionRailSegments,
} from "./catalog-region-rail";

const ABSOLUM_CATALOG_IDS = [
  "ps5-absolum",
  "ps5-absolum-special-edition",
  "ps5-usa-absolum",
] as const;

const AC_PS3_NEW_CATALOG_IDS = [
  "ps3-japon-assassin%27s-creed-connor-saga-ubi-the-best",
  "ps3-japon-assassin%27s-creed-iii-ubi-the-best",
  "ps3-japon-assassin%27s-creed-iv-black-flag-ubi-the-best",
  "ps3-japon-assassin%27s-creed-rogue-ubi-the-best",
] as const;

const AC_PS3_GUIDE_IDS = [
  "assassins-creed-brotherhood-ps3",
  "assassins-creed-ezio-trilogy-ps3",
  "assassins-creed-ezio-saga-ps3",
  "assassins-creed-connor-saga-ps3",
  "assassins-creed-iii-ps3",
  "assassins-creed-iv-black-flag-ps3",
  "assassins-creed-rogue-ps3",
  "assassins-creed-ps3",
  "assassins-creed-ii-ps3",
  "assassins-creed-revelations-ps3",
  "assassins-creed-american-saga-ps3",
] as const;

const RESIDENT_EVIL_PS4_GUIDE_IDS = [
  "resident-evil-village-ps4",
  "resident-evil-7-biohazard-ps4",
  "resident-evil-4-remake-ps4",
] as const;

function absolumGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === "absolum-ps5");
  assert.ok(guide);
  assert.equal(guide.schemaVersion, 2);
  return guide;
}

function groupedAbsolum() {
  const source = ABSOLUM_CATALOG_IDS.map((id) => toCatalogListGame(getCatalogGame(id)!));
  const grouped = groupCatalogListGames(source);
  assert.equal(grouped.length, 2);
  return grouped;
}

const defaultFilters: CatalogFilterState = {
  q: "",
  region: "all",
  platform: "all",
  sort: "title-asc",
  priceFilter: "all",
};

test("edition families expose variant terminology only when alternatives exist", () => {
  assert.equal(catalogEditionFamilyHasVariants(0), false);
  assert.equal(catalogEditionFamilyHasVariants(1), false);
  assert.equal(catalogEditionFamilyHasVariants(2), true);
  assert.equal(catalogEditionFamilyCountLabel(1), "1 edición física");
  assert.equal(catalogEditionFamilyCountLabel(2), "2 variantes físicas");
});

test("optimized physical filters match the complete guide model", () => {
  for (const platformSlug of [undefined, "ps1"] as const) {
    const guides = getGroupableCatalogEditionGuides().filter((guide) =>
      !platformSlug || guide.game.platformSlug === platformSlug);
    const actual = catalogPhysicalFilterOptions(platformSlug);
    assert.deepEqual(
      actual.broadRegions.map((entry) => entry.value).sort(),
      [...new Set(guides.flatMap((guide) => guide.physicalEditions.filter(isReleasedPhysicalEdition).map((edition) => edition.broadRegion)))].sort(),
    );
    assert.deepEqual(
      actual.editionTypes.map((entry) => entry.value).sort(),
      [...new Set(guides.flatMap((guide) => guide.physicalEditions.filter(isReleasedPhysicalEdition).map((edition) => edition.editionType)))].sort(),
    );
    assert.deepEqual(
      actual.ratingSystems,
      [...new Set(guides.flatMap((guide) => guide.physicalEditions.filter(isReleasedPhysicalEdition).flatMap((edition) => edition.ratingSystems)))].sort(),
    );
  }
});

test("catalog search caches follow the worker overlay revision", () => {
  assert.equal(catalogOverlayRevision({ updatedAt: "one", ids: [], byPlatform: {}, seoSlugs: {} }), "static");
  assert.notEqual(
    catalogOverlayRevision({ updatedAt: "one", ids: ["game"], byPlatform: {}, seoSlugs: {} }),
    catalogOverlayRevision({ updatedAt: "two", ids: ["game"], byPlatform: {}, seoSlugs: {} }),
  );
});

test("optimized initial pages keep V2 totals and review counts aligned", async () => {
  const catalogPage = await getDefaultCatalogInitialPage();
  assert.equal(catalogPage.items.length, 48);
  assert.equal(catalogPage.reviewCounts.documented, catalogPage.total);
  assert(catalogPage.reviewCounts.pending > 0);

  const ps1Page = await getDefaultPlatformInitialPage("ps1");
  assert.equal(ps1Page.items.length, 48);
  assert.equal(ps1Page.reviewCounts.documented, ps1Page.total);
  assert(ps1Page.reviewCounts.pending > 0);
});

test("quick catalog search finds and enriches direct game identities without the full index", async () => {
  const quickGames = groupCatalogListGames(publicListedCatalog.map(toCatalogQuickSearchGame));
  const result = filterCatalogGames(quickGames, {
    q: "absolum",
    region: "all",
    platform: "all",
    sort: "title-asc",
    priceFilter: "all",
  }, { platforms: true, regions: true });
  assert.equal(result.total, 5);

  const cards = await enrichCatalogCards(result.items);
  const ps5 = cards.find((game) => game.id === "ps5-absolum");
  assert.equal(ps5?.displayYear, 2025);
  assert(cards.some((game) => game.id === "ps5-absolum-special-edition"));
});

test("V2 headings move markets, packaging languages and ratings out of legacy labels", () => {
  const heading = (
    label: string,
    marketRegions: string[],
    packagingLanguages: string[],
    ratingSystems: string[],
  ) => catalogPhysicalEditionHeadingLabel({
    editionType: "STANDARD",
    label,
    marketRegions,
    packagingLanguages,
    ratingSystems,
  });

  assert.equal(heading("Standard · EN / FR / ES · PEGI", ["FR", "ES", "GB"], ["EN", "FR", "ES"], ["PEGI"]), "Standard");
  assert.equal(heading("Standard · DE · USK", ["DE"], ["DE"], ["USK"]), "Standard");
  assert.equal(heading("Standard · Hong Kong / Taiwán", ["HK", "TW"], ["ZH"], []), "Standard");
  assert.equal(heading("Ezio Saga · Ubi the Best · Japón", ["JP"], ["JA"], ["CERO"]), "Ezio Saga · Ubi the Best");
  assert.equal(heading("Limited Codex Edition", ["ES"], ["ES"], ["PEGI"]), "Limited Codex Edition");
});

test("regional rails cover every supported flag and keep Italy ready without adding market data", () => {
  for (const regionCode of CATALOG_REGION_RAIL_CODES) {
    assert.ok(catalogRegionRailSegments(regionCode).length > 0, `missing rail for ${regionCode}`);
  }
  for (const marketCode of CATALOG_MARKET_REGION_VALUES) {
    assert.ok(catalogRegionRailSegments(marketCode).length > 0, `missing rail for ${marketCode}`);
  }
  assert.ok(CATALOG_REGION_RAIL_CODES.includes("IT"));
  assert.deepEqual(catalogRegionRailSegments("IT"), ["#009246", "#ffffff", "#ce2b37"]);
  assert.deepEqual(catalogRegionRailSegments("EUROPE"), ["#003399"]);
  assert.deepEqual(catalogRegionRailSegments("NORTH_AMERICA"), ["#3c3b6e", "#ffffff", "#b22234"]);
  assert.deepEqual(catalogRegionRailSegments("ASIA"), ["#bc002d", "#f2c94c"]);
  assert.equal(
    absolumGuide().physicalEditions.some((edition) => edition.marketRegions.includes("IT")),
    false,
  );
});

test("schema v2 keeps legacy guides readable and enumerations synchronized", () => {
  assert.equal(guideDocument.schemaVersion, 2);
  assert.equal(acPs3GuideDocument.schemaVersion, 2);
  assert.equal(acPs3GuideDocument.guides.length, AC_PS3_GUIDE_IDS.length);
  assert.ok(guideDocument.guides.some((guide) => !("schemaVersion" in guide)));
  assert.ok(guideDocument.guides.some((guide) => "schemaVersion" in guide && guide.schemaVersion === 2));
  assert.equal(schemaDocument.properties.schemaVersion.const, 2);
  assert.deepEqual(schemaDocument.$defs.broadRegion.enum, [...BROAD_REGION_VALUES]);
  assert.deepEqual(schemaDocument.$defs.marketRegion.enum, [...CATALOG_MARKET_REGION_VALUES]);
  assert.deepEqual(schemaDocument.$defs.editionType.enum, [...PHYSICAL_EDITION_TYPE_VALUES]);
  assert.deepEqual(schemaDocument.$defs.priceCondition.enum, [
    ...CATALOG_PHYSICAL_PRICE_CONDITION_VALUES,
  ]);
  assert.deepEqual(schemaDocument.$defs.evidenceType.enum, [...PHYSICAL_EVIDENCE_TYPE_VALUES]);
  assert.deepEqual(schemaDocument.$defs.releaseStatus.enum, [...PHYSICAL_RELEASE_STATUS_VALUES]);
});

test("V2 edition families declare their valid price states and Special excludes standard-only parts", () => {
  const guide = absolumGuide();
  const standard = guide.editionFamilies.find((family) => family.id === "standard");
  const special = guide.editionFamilies.find((family) => family.id === "special");
  assert.ok(standard);
  assert.ok(special);
  assert.deepEqual(standard.priceConditions, [
    "sealed",
    "newRetail",
    "complete",
    "gameManual",
    "loose",
  ]);
  assert.deepEqual(special.priceConditions, ["sealed", "newRetail", "complete"]);

  const pollutedSpecial = {
    ...getCatalogGame("ps5-absolum-special-edition")!,
    estimatedPriceSealed: 90,
    estimatedPriceNewRetail: 85,
    estimatedPriceComplete: 70,
    estimatedPriceGameManual: 25,
    estimatedPriceLoose: 20,
  };
  assert.deepEqual(
    conditionPriceEntries(pollutedSpecial, special.priceConditions).map((entry) => entry.bucket),
    ["sealed", "newRetail", "complete"],
  );
});

test("V2 eBay regions are explicit, default to Spain and preserve the catalog filter", () => {
  const guide = absolumGuide();
  const standardFamily = guide.editionFamilies.find((family) => family.id === "standard");
  assert.ok(standardFamily);
  const standardEditions = guide.physicalEditions.filter((edition) => (
    standardFamily.physicalEditionIds.includes(edition.id)
  ));
  const options = catalogEbayRegionOptions(standardEditions);

  assert.deepEqual(options.map((option) => option.value), [
    "FR", "ES", "GB", "DE", "US", "JP", "KR", "HK", "TW",
  ]);
  assert.equal(options.find((option) => option.value === "ES")?.catalogId, "ps5-absolum");
  assert.equal(options.find((option) => option.value === "US")?.catalogId, "ps5-usa-absolum");
  assert.equal(options.find((option) => option.value === "DE")?.catalogId, undefined);
  assert.equal(resolveCatalogEbayRegion(options)?.value, "ES");
  assert.equal(resolveCatalogEbayRegion(options, "US")?.value, "US");
  assert.equal(resolveCatalogEbayRegion(options, "invalid")?.value, "ES");
  assert.equal(resolveCatalogEbayRegion(options, null, "US")?.value, "US");

  const standard = groupedAbsolum().find((game) => game.physicalEditionGroup?.editionFamilyId === "standard");
  assert.ok(standard);
  assert.match(catalogGamePathWithEbayRegion(standard, "NTSC USA"), /\?ebayRegion=US$/);
  assert.match(catalogGamePathWithEbayRegion(standard, "PAL España"), /\?ebayRegion=ES$/);
  assert.doesNotMatch(catalogGamePathWithEbayRegion(standard, "all"), /ebayRegion=/);
  assert.equal(catalogEbayOfferCacheKey(standard.id, "US"), `${standard.id}:ebay:US`);
  assert.notEqual(
    catalogEbayOfferCacheKey(standard.id, "US"),
    catalogEbayOfferCacheKey(standard.id, "ES"),
  );

  const mrNutz = getCatalogEditionGuide(getCatalogGame("snes-pal-mr-nutz")!);
  assert.ok(mrNutz?.currentEditionFamilyId);
  const mrNutzFamily = mrNutz.editionFamilies.find((family) => family.id === mrNutz.currentEditionFamilyId);
  assert.ok(mrNutzFamily);
  const mrNutzOptions = catalogEbayRegionOptions(
    mrNutz.physicalEditions.filter((edition) => mrNutzFamily.physicalEditionIds.includes(edition.id)),
  );
  assert.deepEqual(mrNutzOptions.map((option) => option.value), ["ES", "US", "JP"]);
  assert.equal(resolveCatalogEbayRegion(mrNutzOptions)?.value, "ES");
  assert.equal(mrNutzOptions[0].catalogId, "snes-pal-mr-nutz");
});

test("Absolum models seven editions, three broad regions and one shared European disc", () => {
  const guide = absolumGuide();
  assert.equal(guide.physicalEditions.length, 7);
  assert.deepEqual(guide.editionFamilies.map((family) => [family.id, family.physicalEditionIds.length]), [
    ["standard", 6],
    ["special", 1],
  ]);
  assert.deepEqual([...new Set(guide.physicalEditions.map((edition) => edition.broadRegion))], [
    "EUROPE",
    "NORTH_AMERICA",
    "ASIA",
  ]);

  const european = guide.physicalEditions.filter((edition) => edition.broadRegion === "EUROPE");
  assert.equal(european.length, 3);
  assert.deepEqual([...new Set(european.map((edition) => edition.sharedDiscId))], ["absolum-ps5-europe-disc"]);
  const disc = guide.sharedDiscs.find((entry) => entry.id === "absolum-ps5-europe-disc");
  assert.ok(disc);
  assert.deepEqual(disc.ratingSystems, ["PEGI", "USK"]);
  assert.equal(disc.evidence[0]?.type, "OWNER_CONFIRMATION");

  const special = european.find((edition) => edition.editionType === "SPECIAL");
  assert.ok(special);
  assert.deepEqual(special.includesEditionIds, ["absolum-ps5-europe-standard-en-fr-es"]);
  assert.deepEqual(special.containsCatalogIds, ["ps5-absolum"]);
  assert.equal(special.barcode, "5061078710685");
  assert.ok(special.physicalContents.includes("4 pins metálicos"));
  assert.deepEqual(special.digitalContents, ["Banda sonora digital"]);
  assert.ok(special.evidence.some((entry) => entry.type === "PUBLISHER_DOCUMENTATION"));
  const contentsImage = special.images.find((image) => image.placement === "CONTENTS");
  assert.equal(contentsImage?.evidenceType, "PUBLISHER_MOCKUP");
  assert.equal(
    contentsImage?.url,
    "/catalog-covers/ps5/ediciones-documentadas/absolum/absolum-special-contents.webp",
  );
  assert.deepEqual(
    [special.dimensions?.widthCm, special.dimensions?.heightCm, special.dimensions?.depthCm],
    [14.8, 22.3, 3.2],
  );
  assert.equal(special.dimensions?.approximate, true);
  assert.equal(
    special.dimensions?.comparisonImageUrl,
    "/catalog-covers/ps5/ediciones-documentadas/absolum-special-box-size-comparison.webp",
  );
  assert.deepEqual(
    [special.dimensions?.comparison?.widthCm, special.dimensions?.comparison?.heightCm, special.dimensions?.comparison?.depthCm],
    [13.5, 17, 1.5],
  );

  const standardEurope = european.find((edition) => edition.id === "absolum-ps5-europe-standard-en-fr-es");
  assert.deepEqual(standardEurope?.marketRegions, ["FR", "ES", "GB"]);
  assert.deepEqual(
    guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-europe-standard-de")?.marketRegions,
    ["DE"],
  );
  assert.deepEqual(special.marketRegions, []);
  assert.deepEqual(
    guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-north-america-standard")?.marketRegions,
    ["US"],
  );
  assert.deepEqual(
    guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-asia-japan")?.marketRegions,
    ["JP"],
  );
  assert.deepEqual(
    guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-asia-korea")?.marketRegions,
    ["KR"],
  );
  assert.deepEqual(
    guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-asia-hk-tw")?.marketRegions,
    ["HK", "TW"],
  );
  assert.equal(getRegionDisplay("NTSC-J Hong Kong").flagCode, "HK");
});

test("real owned scans are referenced once and weak assets cannot define a physical variant", async () => {
  const guide = absolumGuide();
  const special = guide.physicalEditions.find((edition) => edition.id === "absolum-ps5-europe-special")!;
  assert.deepEqual(special.scanSetIds, ["ps5-absolum-special-edition"]);
  const scans = getOwnedScanSetById(special.scanSetIds[0]);
  assert.ok(scans);
  assert.equal(scans.packaging.ean, "5061078710685");
  const specialGame = getCatalogGame("ps5-absolum-special-edition");
  assert.ok(specialGame);
  assert.equal(getOwnedScanSet(specialGame)?.primaryCoverUrl, scans.primaryCoverUrl);
  assert.match(scans.packaging.marketEvidence, /no determinan un país de distribución exclusivo/i);
  assert.deepEqual(scans.images.map((image) => image.role), ["portada", "contraportada", "lomo"]);
  assert.equal(canEvidenceDefinePhysicalVariant("REAL_SCAN"), true);
  for (const type of ["RETAILER_ASSET", "PUBLISHER_MOCKUP", "PRE_RELEASE_ASSET"] as const) {
    assert.equal(canEvidenceDefinePhysicalVariant(type), false);
  }

  for (const asset of scanAssets.outputs) {
    const bytes = readFileSync(path.join(process.cwd(), "public", asset.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
  }
});

test("verified regional covers remain bound to their exact Absolum variant", async () => {
  const guide = absolumGuide();
  const expected = new Map([
    ["absolum-ps5-europe-standard-de", "197840889144"],
    ["absolum-ps5-asia-japan", "287136123203"],
    ["absolum-ps5-asia-korea", "157360068354"],
    ["absolum-ps5-asia-hk-tw", null],
  ]);

  for (const [editionId, ebayItemId] of expected) {
    const edition = guide.physicalEditions.find((entry) => entry.id === editionId);
    assert.ok(edition);
    assert.equal(edition.images.length, 1);
    assert.equal(isStrongPhysicalEvidence(edition.images[0].evidenceType), true);
    assert.ok(edition.evidence.some((entry) => isStrongPhysicalEvidence(entry.type)));
    if (ebayItemId) {
      assert.ok(edition.evidence.some((entry) => entry.url?.endsWith(`/itm/${ebayItemId}`)));
    } else {
      assert.match(edition.evidence[0]?.summary ?? "", /no demuestra.*Hong Kong.*Taiwán/i);
    }

    for (const url of [edition.images[0].url, edition.images[0].thumbnailUrl]) {
      const bytes = readFileSync(path.join(process.cwd(), "public", url));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.xmp, undefined);
    }
  }
});

test("Absolum exposes separate Standard and Special roots and filters each family independently", () => {
  const grouped = groupedAbsolum();
  const standard = grouped.find((game) => game.id === "ps5-absolum");
  const special = grouped.find((game) => game.id === "ps5-absolum-special-edition");
  assert.ok(standard?.physicalEditionGroup);
  assert.ok(special?.physicalEditionGroup);
  assert.equal(standard.physicalEditionGroup.editionFamilyLabel, "Standard Edition");
  assert.equal(standard.physicalEditionGroup.physicalEditionCount, 6);
  assert.deepEqual(standard.physicalEditionGroup.catalogIds.sort(), ["ps5-absolum", "ps5-usa-absolum"]);
  assert.deepEqual(standard.physicalEditionGroup.overviewRegions, [
    "PAL Europa",
    "NTSC USA",
    "NTSC-J Japón",
    "NTSC-J Corea",
    "NTSC-J Hong Kong",
    "NTSC-J Taiwán",
  ]);
  assert.ok(standard.physicalEditionGroup.marketRegions.includes("ES"));
  assert.equal(special.physicalEditionGroup.editionFamilyLabel, "Special Edition");
  assert.equal(special.physicalEditionGroup.physicalEditionCount, 1);
  assert.deepEqual(special.physicalEditionGroup.catalogIds, ["ps5-absolum-special-edition"]);
  assert.deepEqual(special.physicalEditionGroup.overviewRegions, ["PAL Europa"]);
  assert.deepEqual(
    catalogPhysicalEditionOverviewRegions(
      absolumGuide().physicalEditions.filter((edition) => edition.id === "absolum-ps5-europe-special"),
    ),
    ["PAL Europa"],
  );

  const usk = filterCatalogGames(grouped, { ...defaultFilters, ratingSystem: "USK" }, { platforms: true, regions: true });
  assert.deepEqual(usk.items.map((game) => game.id), ["ps5-absolum"]);
  const specialOnly = filterCatalogGames(grouped, { ...defaultFilters, physicalEditionType: "SPECIAL" }, { platforms: true, regions: true });
  assert.deepEqual(specialOnly.items.map((game) => game.id), ["ps5-absolum-special-edition"]);
  const standardOnly = filterCatalogGames(grouped, { ...defaultFilters, physicalEditionType: "STANDARD" }, { platforms: true, regions: true });
  assert.deepEqual(standardOnly.items.map((game) => game.id), ["ps5-absolum"]);
  const europe = filterCatalogGames(grouped, { ...defaultFilters, broadRegion: "EUROPE" }, { platforms: true, regions: true });
  assert.deepEqual(europe.items.map((game) => game.id).sort(), ["ps5-absolum", "ps5-absolum-special-edition"]);
  const marketFilterExpectations = new Map<string, string[]>([
    ["ES", ["ps5-absolum"]],
    ["FR", ["ps5-absolum"]],
    ["GB", ["ps5-absolum"]],
    ["DE", ["ps5-absolum"]],
    ["US", ["ps5-absolum"]],
    ["JP", ["ps5-absolum"]],
    ["KR", ["ps5-absolum"]],
    ["HK", ["ps5-absolum"]],
    ["TW", ["ps5-absolum"]],
  ]);
  for (const [marketCode, expectedIds] of marketFilterExpectations) {
    const legacyRegion = catalogMarketRegionToLegacyRegion(marketCode);
    const filtered = filterCatalogGames(
      grouped,
      { ...defaultFilters, region: legacyRegion },
      { platforms: true, regions: true },
    );
    assert.deepEqual(filtered.items.map((game) => game.id).sort(), expectedIds, `filter ${marketCode}`);
  }

  const palEurope = filterCatalogGames(
    grouped,
    { ...defaultFilters, region: "PAL Europa" },
    { platforms: true, regions: true },
  );
  assert.deepEqual(
    palEurope.items.map((game) => game.id).sort(),
    ["ps5-absolum", "ps5-absolum-special-edition"],
  );

  const europeanGroup = filterCatalogGames(
    grouped,
    { ...defaultFilters, region: "region-group:europe" },
    { platforms: true, regions: true },
  );
  assert.deepEqual(
    europeanGroup.items.map((game) => game.id).sort(),
    ["ps5-absolum", "ps5-absolum-special-edition"],
  );

  const ps5RegionOptions = publicCatalogRegionFilterOptionsForPlatform("ps5").map((option) => option.value);
  const documentedPs5Markets = [...new Set(absolumGuide().physicalEditions.flatMap((edition) => edition.marketRegions))];
  for (const marketCode of documentedPs5Markets) {
    const market = catalogMarketRegionToLegacyRegion(marketCode);
    assert.ok(ps5RegionOptions.includes(market), `missing PS5 region filter: ${market}`);
  }
  assert.equal(ps5RegionOptions.includes(catalogMarketRegionToLegacyRegion("PT")), true);
});

test("V2 overview regions link to the matching regional block or exact physical edition", () => {
  const guide = absolumGuide();
  const standardFamily = guide.editionFamilies.find((family) => family.id === "standard");
  assert.ok(standardFamily);
  const standardEditions = guide.physicalEditions.filter((edition) =>
    standardFamily.physicalEditionIds.includes(edition.id));

  assert.deepEqual(catalogPhysicalEditionOverviewRegionLinks(standardEditions), [
    { region: "PAL Europa", targetId: catalogPhysicalEditionBroadRegionAnchorId("EUROPE") },
    { region: "NTSC USA", targetId: "absolum-ps5-north-america-standard" },
    { region: "NTSC-J Japón", targetId: "absolum-ps5-asia-japan" },
    { region: "NTSC-J Corea", targetId: "absolum-ps5-asia-korea" },
    { region: "NTSC-J Hong Kong", targetId: "absolum-ps5-asia-hk-tw" },
    { region: "NTSC-J Taiwán", targetId: "absolum-ps5-asia-hk-tw" },
  ]);

  const special = guide.physicalEditions.filter((edition) => edition.id === "absolum-ps5-europe-special");
  assert.deepEqual(catalogPhysicalEditionOverviewRegionLinks(special), [
    { region: "PAL Europa", targetId: catalogPhysicalEditionBroadRegionAnchorId("EUROPE") },
  ]);
});

test("Absolum V2 public identity never inherits an unsupported legacy market", () => {
  const platform = getPlatform("ps5");
  assert.ok(platform);

  const specialGame = getCatalogGame("ps5-absolum-special-edition");
  assert.ok(specialGame);
  const specialIdentity = getCatalogPhysicalEditionPublicIdentity(specialGame, platform.shortName);
  assert.ok(specialIdentity);
  assert.equal(specialIdentity.metadataTitle, "Absolum [Special Edition] — PS5 · Europa");
  assert.equal(
    specialIdentity.description,
    "Absolum [Special Edition] para PS5. Edición física documentada en Europa.",
  );
  assert.equal(
    specialIdentity.coverAlt,
    "Portada de Absolum [Special Edition] para PS5 (Europa)",
  );
  assert.deepEqual(specialIdentity.currentMarketRegions, []);

  const specialCover = getOwnedScanSet(specialGame)?.primaryCoverUrl;
  assert.ok(specialCover);
  const metadata = buildGameMetadata(specialGame, undefined, {
    physicalEditionIdentity: specialIdentity,
    coverUrl: specialCover,
  });
  const metadataText = JSON.stringify(metadata);
  assert.equal(metadata.title, specialIdentity.metadataTitle);
  assert.doesNotMatch(metadataText, /PAL España|mercado español|Precio PS5 PAL España/i);
  assert.match(metadataText, /Absolum \[Special Edition\].*Europa/);
  assert.match(metadataText, /absolum-special-edition-ps5-europa/);
  assert.match(metadataText, /absolum-special-edition-ps5-portada\.webp/);

  const faqs = buildGameFaq(specialGame, platform, undefined, {
    physicalEditionIdentity: specialIdentity,
  });
  assert.equal(faqs[0]?.answer, "Aún no hay suficientes ventas verificadas para esta edición.");
  assert.doesNotMatch(JSON.stringify(faqs), /PAL España|mercado español|edición española/i);

  const jsonLd = buildGameJsonLd(specialGame, platform, undefined, {
    physicalEditionIdentity: specialIdentity,
    coverUrl: specialCover,
  });
  assert.doesNotMatch(JSON.stringify(jsonLd), /PAL España|mercado español|"name":"España"/i);
  assert.match(JSON.stringify(jsonLd), /Edición física documentada en Europa/);

  const standardGame = getCatalogGame("ps5-absolum");
  assert.ok(standardGame);
  const standardIdentity = getCatalogPhysicalEditionPublicIdentity(standardGame, platform.shortName);
  assert.ok(standardIdentity);
  assert.equal(standardIdentity.metadataTitle, "Absolum — Standard Edition · PS5");
  assert.deepEqual(standardIdentity.currentMarketRegions, ["FR", "ES", "GB"]);
  assert.deepEqual(standardIdentity.marketRegions, ["FR", "ES", "GB", "DE", "US", "JP", "KR", "HK", "TW"]);
  assert.match(standardIdentity.description, /Europa, Norteamérica y Asia/);
  assert.match(standardIdentity.description, /FR, ES, GB, DE, US, JP, KR, HK y TW/);
  const standardMetadata = buildGameMetadata(standardGame, undefined, {
    physicalEditionIdentity: standardIdentity,
  });
  assert.equal(standardMetadata.title, standardIdentity.metadataTitle);
  assert.doesNotMatch(JSON.stringify(standardMetadata), /Precio PS5 PAL España|\(PAL España\)/i);
});

test("legacy IDs and direct URLs remain unique while optical group prices omit loose disc", () => {
  assert.equal(new Set(catalog.map((game) => game.id)).size, catalog.length);
  const urls = ABSOLUM_CATALOG_IDS.map((id) => catalogGamePath(getCatalogGame(id)!));
  assert.equal(new Set(urls).size, ABSOLUM_CATALOG_IDS.length);
  assert.deepEqual(urls, [
    "/catalogo/absolum-standard-edition-ps5",
    "/catalogo/absolum-special-edition-ps5-europa",
    "/catalogo/absolum-standard-edition-ps5-estados-unidos",
  ]);
  for (const id of ABSOLUM_CATALOG_IDS) assert.equal(getCatalogGame(id)?.id, id);

  const standard = groupedAbsolum().find((game) => game.id === "ps5-absolum");
  assert.ok(standard);
  const prices = catalogConditionPriceRows(standard);
  assert.deepEqual(prices.map((row) => row.condition), ["sealed", "complete"]);
  assert.ok(prices.every((row) => row.condition !== "loose"));
});

test("every Absolum V2 edition shares verified game details and keeps its physical evidence", () => {
  for (const id of ABSOLUM_CATALOG_IDS) {
    const game = getCatalogGame(id);
    assert.ok(game);
    const detailsCatalogId = resolveCatalogGameDetailsCatalogId(game);
    assert.equal(detailsCatalogId, "ps5-absolum");
    const details = getGameDetails(detailsCatalogId);
    assert.equal(details?.year, 2025);
    assert.equal(details?.releaseDate, "2025-10-09");
    assert.equal(details?.players, 2);
    assert.equal(details?.support, "Disco Blu-ray");
    assert.deepEqual(details?.genres.map((genre) => genre.slug), [
      "beat-em-up",
      "action",
      "adventure",
    ]);
  }

  const specialGame = getCatalogGame("ps5-absolum-special-edition")!;
  const special = withOwnedScanDetails(specialGame, getGameDetails("ps5-absolum"));
  assert.equal(special?.reference, "PPSA-28311");

  for (const slug of ["dotemu", "guard-crush-games", "supamonks", "silver-lining"]) {
    const company = getCompany(slug);
    assert.ok(company, `missing company ${slug}`);
    assert.ok(company.gameIds.includes("ps5-absolum"), `Absolum is not linked to ${slug}`);
  }
});

test("documented guides use edition families while existing catalog IDs retain exact meaning", () => {
  const guidesWithFamilies = getCatalogEditionGuides().filter((guide) => guide.editionFamilies.length > 0);
  assert.deepEqual(
    guidesWithFamilies.map((guide) => guide.id),
    [
      "resident-evil-requiem-ps5",
      "absolum-ps5",
      ...AC_PS3_GUIDE_IDS,
      ...RESIDENT_EVIL_PS4_GUIDE_IDS,
      "assassins-creed-iii-remastered-ps4",
      "assassins-creed-iv-black-flag-ps4",
      "assassins-creed-chronicles-ps4",
      "assassins-creed-origins-ps4",
      "assassins-creed-rogue-remastered-ps4",
      "assassins-creed-mirage-ps4",
      "assassins-creed-mirage-ps5",
      "assassins-creed-syndicate-ps4",
      "assassins-creed-the-ezio-collection-ps4",
      "assassins-creed-unity-ps4-worldwide",
      "assassins-creed-valhalla-ps4-worldwide",
      "assassins-creed-valhalla-dawn-of-ragnarok-ps4",
      "assassins-creed-odyssey-ps4",
      "assassins-creed-shadows-ps5-worldwide",
      "assassins-creed-valhalla-ps5",
      "assassins-creed-valhalla-dawn-of-ragnarok-ps5",
    ],
  );

  for (const id of [
    "gameboy-es-solomon-s-club",
    "ps1-2xtreme",
    "ps4-sekiro-shadows-die-twice",
    "ps5-clair-obscur-expedition-33-lumiere-edition",
  ]) {
    const game = getCatalogGame(id);
    assert.ok(game, `missing legacy fixture ${id}`);
    assert.equal(getCatalogEditionGuide(game)?.schemaVersion, 2);
    assert.equal(resolveCatalogGameDetailsCatalogId(game), id);
  }

  const legacyGuide = getCatalogEditionGuides().find((guide) => guide.id === "resident-evil-requiem-ps5");
  assert.ok(legacyGuide);
  const legacyIds = legacyGuide.physicalEditions.flatMap((edition) => edition.catalogIds);
  const legacyGames = legacyIds.map((id) => toCatalogListGame(getCatalogGame(id)!));
  assert.deepEqual(groupCatalogListGames(legacyGames).map((game) => game.id), [
    "ps5-resident-evil-requiem",
    "ps5-resident-evil-requiem-lenticular-cover",
    "ps5-resident-evil-requiem-deluxe-edition",
    "ps5-japon-biohazard-requiem-collector%27s-edition",
  ]);

  assert.equal(
    resolveCatalogPhysicalVariant("ps5-absolum")?.physicalVariantId,
    "absolum-ps5-europe-standard-en-fr-es",
  );
  assert.equal(
    resolveCatalogPhysicalVariant("ps5-absolum-special-edition")?.physicalVariantId,
    "absolum-ps5-europe-special",
  );
  assert.equal(
    resolveCatalogPhysicalVariant("ps5-usa-absolum")?.physicalVariantId,
    "absolum-ps5-north-america-standard",
  );
});

test("sitewide V2 groups published regional pages and keeps their catalog collection identities", () => {
  for (const game of publicListedCatalog) {
    const guide = getCatalogEditionGuide(game);
    assert.ok(guide, `missing V2 presentation for ${game.id}`);
    assert.equal(guide.schemaVersion, 2);
    assert.ok(guide.currentEditionId || guide.currentBonusItemId);
    if (guide.currentEditionId) assert.ok(guide.currentEditionFamilyId);
    if (guide.currentBonusItemId) assert.equal(guide.currentEditionFamilyId, undefined);
  }

  const sekiroIds = [
    "ps4-sekiro-shadows-die-twice",
    "ps4-usa-sekiro-shadows-die-twice",
    "ps4-japon-sekiro-shadows-die-twice",
  ];
  const sekiro = getCatalogEditionGuide(getCatalogGame(sekiroIds[0])!);
  assert.ok(sekiro);
  assert.equal(sekiro.origin, "catalog-derived");
  const family = sekiro.editionFamilies.find((entry) => entry.id === sekiro.currentEditionFamilyId);
  assert.ok(family);
  assert.deepEqual(
    sekiro.physicalEditions.flatMap((edition) => edition.catalogIds).filter((id) => sekiroIds.includes(id)),
    sekiroIds,
  );
  assert.ok(sekiro.physicalEditions.every((edition) => edition.collectionIdentity === "catalog-entry"));
  assert.deepEqual(
    catalogEbayRegionOptions(sekiro.physicalEditions).map((option) => option.value),
    ["ES", "US", "JP"],
  );
  assert.deepEqual(
    groupCatalogListGames(sekiroIds.map((id) => toCatalogListGame(getCatalogGame(id)!))).map((game) => game.id),
    ["ps4-sekiro-shadows-die-twice"],
  );
  assert.equal(resolveCatalogPhysicalVariant(sekiroIds[0]), undefined);

  const singleton = getCatalogEditionGuide(getCatalogGame("3ds-3d-game-collection")!);
  assert.equal(singleton?.origin, "catalog-derived");
  assert.equal(singleton?.physicalEditions.length, 1);

  const sekiroEs = getCatalogGame(sekiroIds[0])!;
  const hotPublishedRegion = {
    ...sekiroEs,
    id: "overlay-ps4-au-sekiro-shadows-die-twice",
    slug: "sekiro-shadows-die-twice-au",
    region: "Australia",
    marketRegion: "AU",
    coverUrl: null,
  };
  const hotGuide = getCatalogEditionGuide(hotPublishedRegion);
  assert.ok(hotGuide);
  assert.ok(hotGuide.physicalEditions.some((edition) => edition.catalogIds.includes(hotPublishedRegion.id)));
  assert.ok(hotGuide.physicalEditions.some((edition) => edition.catalogIds.includes(sekiroIds[0])));
  const secondHotRegion = {
    ...hotPublishedRegion,
    id: "overlay-ps4-ca-sekiro-shadows-die-twice",
    slug: "sekiro-shadows-die-twice-ca",
    region: "Canadá",
    marketRegion: "CA",
  };
  const runtimeGrouped = groupCatalogListGames([
    ...sekiroIds.map((id) => toCatalogListGame(getCatalogGame(id)!)),
    toCatalogListGame(hotPublishedRegion),
    toCatalogListGame(secondHotRegion),
  ]);
  assert.equal(runtimeGrouped.length, 1);
  assert.equal(runtimeGrouped[0].physicalEditionGroup?.physicalEditionCount, 5);
  assert.deepEqual(runtimeGrouped[0].physicalEditionGroup?.marketRegions, ["ES", "US", "JP", "AU", "CA"]);

  const pendingRegion = {
    ...hotPublishedRegion,
    id: "overlay-pending-ps4-au-sekiro-shadows-die-twice",
    slug: "sekiro-shadows-die-twice-au-pending",
    listingStatus: "pending" as const,
  };
  const pendingGuide = getCatalogEditionGuide(pendingRegion);
  assert.equal(pendingGuide?.physicalEditions.length, 1);
  assert.deepEqual(pendingGuide?.physicalEditions[0].catalogIds, [pendingRegion.id]);
  assert.equal(groupCatalogListGames([
    ...sekiroIds.map((id) => toCatalogListGame(getCatalogGame(id)!)),
    toCatalogListGame(pendingRegion),
  ]).length, 2);

  const hiddenStatic = { ...sekiroEs, listingStatus: "excluded" as const };
  const mergedPublicCatalog = mergePublicCatalogWithOverlayGames(
    [sekiroEs, getCatalogGame(sekiroIds[1])!],
    [hiddenStatic, hotPublishedRegion],
  );
  assert.deepEqual(mergedPublicCatalog.map((game) => game.id), [sekiroIds[1], hotPublishedRegion.id]);

  const mixedResolutionIds = [
    "ps1-a-bug%27s-life",
    "ps1-usa-a-bug-s-life",
  ];
  const mixedResolutionGuide = getCatalogEditionGuide(getCatalogGame(mixedResolutionIds[0])!);
  assert.ok(mixedResolutionGuide);
  assert.deepEqual(
    mixedResolutionGuide.physicalEditions.flatMap((edition) => edition.catalogIds)
      .filter((id) => mixedResolutionIds.includes(id))
      .sort(),
    [...mixedResolutionIds].sort(),
  );
  assert.equal(
    mixedResolutionGuide.physicalEditions.find((edition) => edition.catalogIds.includes("ps1-us-scus-94288"))
      ?.broadRegion,
    "NORTH_AMERICA",
  );
  assert.equal(
    mixedResolutionGuide.physicalEditions.find((edition) => edition.catalogIds.includes("ps1-jp-slpm-86330"))
      ?.broadRegion,
    "ASIA",
  );

  const ambiguousTitleRows = publicListedCatalog.filter((candidate) => (
    candidate.platformSlug === "ps1" && candidate.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim() === "ace combat 3 electrosphere"
  ));
  const ambiguousWorkIds = new Set(ambiguousTitleRows.flatMap((candidate) => (
    candidate.workId && candidate.regionalStatus === "resolved" ? [candidate.workId] : []
  )));
  assert.ok(ambiguousWorkIds.size > 1);
  const unresolvedAceCombat = ambiguousTitleRows.find((candidate) => (
    !candidate.workId || candidate.regionalStatus !== "resolved"
  ));
  assert.ok(unresolvedAceCombat);
  const ambiguousGuide = getCatalogEditionGuide(unresolvedAceCombat);
  assert.ok(ambiguousGuide);
  assert.equal(
    ambiguousGuide.physicalEditions.flatMap((edition) => edition.catalogIds).some((catalogId) => (
      ambiguousTitleRows.some((candidate) => (
        candidate.id === catalogId && Boolean(candidate.workId) && candidate.regionalStatus === "resolved"
      ))
    )),
    false,
  );
});

test("scoped V2 grouping exposes only editions present in the input", () => {
  const source = ["ps5-absolum", "ps5-usa-absolum"].map((id) =>
    toCatalogListGame(getCatalogGame(id)!),
  );
  const grouped = groupCatalogListGames(source, { scopePhysicalEditionsToInput: true });

  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0]?.physicalEditionGroup?.catalogIds, [
    "ps5-absolum",
    "ps5-usa-absolum",
  ]);
  assert.equal(grouped[0]?.physicalEditionGroup?.physicalEditionCount, 2);
  assert.deepEqual(grouped[0]?.physicalEditionGroup?.overviewRegions, [
    "PAL Europa",
    "NTSC USA",
  ]);
  assert.equal(grouped[0]?.searchText?.includes("korea"), false);
});

test("V2 grouping emits one card when a company index repeats a catalog identity", () => {
  const source = ["ps5-absolum", "ps5-usa-absolum"].map((id) =>
    toCatalogListGame(getCatalogGame(id)!),
  );
  const grouped = groupCatalogListGames(
    [source[0]!, source[0]!, source[1]!, source[1]!],
    { scopePhysicalEditionsToInput: true },
  );

  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0]?.physicalEditionGroup?.catalogIds, [
    "ps5-absolum",
    "ps5-usa-absolum",
  ]);
});

test("the previous four catalog additions remain exact and all prior catalog rows are preserved", () => {
  const rawCatalog = JSON.parse(readFileSync(path.join(process.cwd(), "data", "catalog.json"), "utf8")) as Array<{
    id: string;
    platformSlug: string;
    seedSource?: string;
  }>;
  const additions = rawCatalog.filter((entry) => entry.seedSource === "ac-ps3-backed-v2");
  assert.deepEqual(additions.map((entry) => entry.id), [...AC_PS3_NEW_CATALOG_IDS]);
  assert.deepEqual(acPs3Implementation.createdCatalogIds, [...AC_PS3_NEW_CATALOG_IDS]);
  assert.equal(acPs3Implementation.preservation.destructiveChanges, 0);
  assert.equal(acPs3Implementation.preservation.userDataChanges, 0);

  const previousCatalog = rawCatalog.filter((entry) => !AC_PS3_NEW_CATALOG_IDS.includes(
    entry.id as (typeof AC_PS3_NEW_CATALOG_IDS)[number],
  ));
  const residentEvilBeforeById = new Map<string, (typeof rawCatalog)[number]>([
    [
      residentEvilPs4Dedup.exactMerge.retiredCatalogId,
      residentEvilPs4Dedup.exactMerge.before.retired,
    ],
    [
      residentEvilPs4Dedup.exactMerge.canonicalCatalogId,
      residentEvilPs4Dedup.exactMerge.before.canonical,
    ],
  ]);
  const previousCatalogBeforeResidentEvil = previousCatalog.map(
    (entry) => residentEvilBeforeById.get(entry.id) ?? entry,
  );
  assert.equal(previousCatalog.length, 81_425);
  assert.equal(
    createHash("sha256").update(JSON.stringify(previousCatalogBeforeResidentEvil)).digest("hex"),
    "7117deaedb862fa81c14a1b141063441f808a284a0e80b2224b8da66692f0bea",
  );

  const ps4 = rawCatalog.filter((entry) => entry.platformSlug === "ps4");
  const ps5 = rawCatalog.filter((entry) => entry.platformSlug === "ps5");
  const ps4BeforeResidentEvil = ps4.map(
    (entry) => residentEvilBeforeById.get(entry.id) ?? entry,
  );
  assert.equal(ps4.length, 9_716);
  assert.equal(ps5.length, 4_807);
  assert.equal(
    createHash("sha256").update(JSON.stringify(ps4BeforeResidentEvil)).digest("hex"),
    "e3ebbd3af1561e5bb03e43ddd6c4e287f5f1bdd364bc9bc4559aa02ae63d6238",
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(ps5)).digest("hex"),
    "711f1f988b43cb58eda10f83eed7349a524ea75d5e706ed61a697a1b583a5d30",
  );
});

test("the shared market registry supports all 56 targets without fabricating a fallback", () => {
  assert.equal(CATALOG_MARKET_REGION_VALUES.length, 56);
  assert.deepEqual(Object.keys(CATALOG_MARKET_REGION_META), [...CATALOG_MARKET_REGION_VALUES]);
  for (const marketCode of CATALOG_MARKET_REGION_VALUES) {
    const meta = CATALOG_MARKET_REGION_META[marketCode];
    assert.ok(BROAD_REGION_VALUES.includes(meta.broadRegion), marketCode);
    assert.equal(getRegionDisplay(marketCode).flagCode, meta.flagCode);
    assert.equal(catalogMarketRegionToLegacyRegion(marketCode), meta.legacyRegion);
  }
  assert.equal(isCatalogMarketRegion("XX"), false);
  assert.notEqual(getRegionDisplay("XX").shortLabel, "ES");
  assert.notEqual(getRegionDisplay("XX").shortLabel, "US");
});

test("the regional queue records all 133 decisions and publishes every priority candidate", () => {
  assert.equal(acPs3RegionalDecisions.observations.length, 133);
  assert.equal(acPs3RegionalDecisions.counts.CREADA, 19);
  assert.equal(acPs3RegionalDecisions.counts.REUTILIZADA_ENRIQUECIDA, 4);
  assert.equal(acPs3RegionalDecisions.counts.PENDIENTE_EVIDENCIA, 93);
  assert.equal(acPs3RegionalDecisions.counts.PENDIENTE_SUPERVISION, 6);

  const priorityIds = [
    "O096", "O097", "O100", "O101", "O102", "O103", "O104", "O107",
    "O108", "O109", "O110", "O111", "O112", "O113", "O114", "O115",
  ];
  const decisions = new Map(acPs3RegionalDecisions.observations.map((entry) => [entry.observationId, entry]));
  const publicEditionIds = new Set(getCatalogEditionGuides().flatMap((guide) =>
    guide.physicalEditions.map((edition) => edition.id),
  ));
  for (const observationId of priorityIds) {
    const decision = decisions.get(observationId);
    assert.equal(decision?.decision, "CREADA", observationId);
    assert.ok(decision?.targetPhysicalEditionId, observationId);
    assert.ok(publicEditionIds.has(decision.targetPhysicalEditionId), observationId);
    assert.ok(decision.targetPublicUrl?.includes(`#${decision.targetPhysicalEditionId}`), observationId);
  }
});

test("regional display assets, thumbnails, and untouched originals retain their recorded checksums", () => {
  const images = [...new Map(getCatalogEditionGuides()
    .flatMap((guide) => guide.physicalEditions.flatMap((edition) => edition.images))
    .filter((image) => image.key.startsWith("ac-ps3-regional-"))
    .map((image) => [image.key, image])).values()];
  assert.equal(images.length, 12);
  for (const image of images) {
    assert.ok(image.sha256);
    assert.ok(image.thumbnailSha256);
    assert.ok(image.originalUrl);
    assert.ok(image.originalSha256);
    const display = readFileSync(path.join(process.cwd(), "public", image.url.replace(/^\//, "")));
    const thumbnail = readFileSync(path.join(process.cwd(), "public", image.thumbnailUrl.replace(/^\//, "")));
    const original = readFileSync(path.join(process.cwd(), "public", image.originalUrl.replace(/^\//, "")));
    assert.equal(createHash("sha256").update(display).digest("hex"), image.sha256, image.key);
    assert.equal(createHash("sha256").update(thumbnail).digest("hex"), image.thumbnailSha256, image.key);
    assert.equal(createHash("sha256").update(original).digest("hex"), image.originalSha256, image.key);
  }
});

test("regional boxes are independent collection identities and language never becomes a market", () => {
  const game = getCatalogGame("ps3-assassin%27s-creed");
  assert.ok(game);
  const o100 = catalogGameToCollectionItem(game, [], "complete", "assassins-creed-ps3-europe-standard-o100");
  const o101 = catalogGameToCollectionItem(game, [o100], "complete", "assassins-creed-ps3-europe-standard-o101");
  assert.notEqual(collectionPhysicalIdentityKey(o100), collectionPhysicalIdentityKey(o101));
  assert.equal(countOwnedPhysicalVariant([o100, o101], "assassins-creed-ps3-europe-standard-o100"), 1);
  assert.equal(countOwnedPhysicalVariant([o101], "assassins-creed-ps3-europe-standard-o100"), 0);
  assert.equal(countOwnedPhysicalVariant([o101], "assassins-creed-ps3-europe-standard-o101"), 1);

  const ac1Games = [
    "ps3-assassin%27s-creed", "ps3-usa-assassin-s-creed", "ps3-japon-assassin%27s-creed",
    "ps3-assassin%27s-creed-platinum",
  ].map((id) => toCatalogListGame(getCatalogGame(id)!));
  const german = filterCatalogGames(
    groupCatalogListGames(ac1Games),
    { ...defaultFilters, region: catalogMarketRegionToLegacyRegion("DE") },
    { platforms: true, regions: true },
  );
  assert.deepEqual(german.items, []);
});

test("partial component evidence stays non-exhaustive and shared markets do not duplicate a box", () => {
  const guides = new Map(getCatalogEditionGuides().map((entry) => [entry.id, entry]));
  const o096 = guides.get("assassins-creed-revelations-ps3")?.physicalEditions.find(
    (edition) => edition.id === "assassins-creed-revelations-ps3-europe-ac1-o096",
  );
  assert.ok(o096);
  assert.deepEqual(o096.marketRegions, []);
  assert.deepEqual(o096.packagingLanguages, []);
  assert.deepEqual(o096.componentLanguageEvidence[0].languages, ["NL", "FR"]);
  assert.equal(o096.componentLanguageEvidence[0].basis, "OBSERVED");
  assert.equal(o096.componentLanguageEvidence[0].exhaustive, false);

  const shared = guides.get("assassins-creed-ii-ps3")?.physicalEditions.filter(
    (edition) => edition.id === "assassins-creed-ii-ps3-north-america-shared-o026",
  );
  assert.equal(shared?.length, 1);
  assert.deepEqual(shared[0].marketRegions, ["CA", "MX", "US"]);
});

test("backed Assassin's Creed PS3 facts remain attached to their exact physical editions", () => {
  const guides = new Map(getCatalogEditionGuides().map((guide) => [guide.id, guide]));
  for (const guideId of AC_PS3_GUIDE_IDS) {
    assert.equal(guides.get(guideId)?.schemaVersion, 2, `missing ${guideId}`);
  }

  const codex = guides.get("assassins-creed-brotherhood-ps3")?.physicalEditions.find(
    (edition) => edition.id === "assassins-creed-brotherhood-ps3-limited-codex",
  );
  assert.ok(codex);
  assert.equal(codex.barcode, "3307217934133");
  assert.equal(codex.releaseDate, "2010-11-18");
  assert.deepEqual(codex.marketRegions, []);
  assert.ok(codex.physicalContents.includes("Cofre coleccionista Renaissance"));

  const trilogy = guides.get("assassins-creed-ezio-trilogy-ps3")?.physicalEditions[0];
  assert.ok(trilogy);
  assert.equal(trilogy.releaseDate, "2012-11-13");
  assert.deepEqual(trilogy.marketRegions, ["US"]);
  assert.deepEqual(trilogy.containsCatalogIds, [
    "ps3-usa-assassin-s-creed-ii",
    "ps3-usa-assassin-s-creed-brotherhood",
    "ps3-usa-assassin-s-creed-revelations",
  ]);
  assert.deepEqual(trilogy.digitalContents, ["Contenido descargable de Assassin's Creed II"]);

  const expectedUbiTheBest = new Map([
    ["assassins-creed-connor-saga-ps3", ["BLJM-61287", "4949244003612", "2015-05-28"]],
    ["assassins-creed-iii-ps3", ["BLJM-61171", undefined, undefined]],
    ["assassins-creed-iv-black-flag-ps3", ["BLJM-61273", "4949244003575", "2015-06-25"]],
    ["assassins-creed-rogue-ps3", [undefined, "4949244003926", "2016-03-03"]],
  ]);
  for (const [guideId, [catalogNumber, barcode, releaseDate]] of expectedUbiTheBest) {
    const edition = guides.get(guideId)?.physicalEditions.find(
      (candidate) => candidate.editionType === "BUDGET_REISSUE",
    );
    assert.ok(edition, `missing Ubi the Best in ${guideId}`);
    assert.deepEqual(edition.marketRegions, ["JP"]);
    assert.equal(edition.catalogNumber, catalogNumber);
    assert.equal(edition.barcode, barcode);
    assert.equal(edition.releaseDate, releaseDate);
    assert.deepEqual(edition.packagingLanguages, []);
    assert.deepEqual(edition.ratingSystems, []);
  }

  const ezioSaga = guides.get("assassins-creed-ezio-saga-ps3");
  assert.equal(
    ezioSaga?.editionFamilies.find((family) => family.id === "ubi-the-best")?.representativeCatalogId,
    "ps3-japon-assassin%27s-creed-ezio-saga",
  );
});

test("Assassin's Creed V2 families filter by documented markets and group idempotently", () => {
  const ids = [
    "ps3-assassin%27s-creed-iii",
    "ps3-usa-assassin-s-creed-iii",
    "ps3-japon-assassin%27s-creed-iii",
    "ps3-japon-assassin%27s-creed-iii-ubi-the-best",
  ];
  const source = ids.map((id) => toCatalogListGame(getCatalogGame(id)!));
  const grouped = groupCatalogListGames(source);
  assert.deepEqual(grouped.map((game) => game.id), [
    "ps3-assassin%27s-creed-iii",
    "ps3-japon-assassin%27s-creed-iii-ubi-the-best",
  ]);
  assert.deepEqual(groupCatalogListGames(grouped), grouped);

  const expected = new Map<string, string[]>([
    ["PAL España", ["ps3-assassin%27s-creed-iii"]],
    ["NTSC USA", ["ps3-assassin%27s-creed-iii"]],
    ["NTSC-J Japón", ["ps3-assassin%27s-creed-iii", "ps3-japon-assassin%27s-creed-iii-ubi-the-best"]],
  ]);
  for (const [region, expectedIds] of expected) {
    const filtered = filterCatalogGames(
      grouped,
      { ...defaultFilters, region },
      { platforms: true, regions: true },
    );
    assert.deepEqual(filtered.items.map((game) => game.id).sort(), expectedIds.sort(), region);
  }

  const codexSource = [
    "ps3-assassin%27s-creed-brotherhood",
    "ps3-usa-assassin-s-creed-brotherhood",
    "ps3-assassin%27s-creed-brotherhood-limited-codex-edition",
  ].map((id) => toCatalogListGame(getCatalogGame(id)!));
  const groupedBrotherhood = groupCatalogListGames(codexSource);
  const spanish = filterCatalogGames(
    groupedBrotherhood,
    { ...defaultFilters, region: "PAL España" },
    { platforms: true, regions: true },
  );
  assert.deepEqual(spanish.items.map((game) => game.id), ["ps3-assassin%27s-creed-brotherhood"]);
  const europe = filterCatalogGames(
    groupedBrotherhood,
    { ...defaultFilters, broadRegion: "EUROPE" },
    { platforms: true, regions: true },
  );
  assert.deepEqual(europe.items.map((game) => game.id).sort(), [
    "ps3-assassin%27s-creed-brotherhood",
    "ps3-assassin%27s-creed-brotherhood-limited-codex-edition",
  ]);
});

test("unresolved Assassin's Creed candidates are not promoted into public V2 editions", () => {
  const publicEditionIds = getCatalogEditionGuides().flatMap((guide) =>
    guide.physicalEditions.map((edition) => edition.id.toLowerCase()),
  );
  for (const unresolved of [
    "ubiworkshop",
    "charity",
    "harlequin",
    "doctor",
    "trilingual-unresolved",
    "special-film-unresolved",
  ]) {
    assert.equal(publicEditionIds.some((id) => id.includes(unresolved)), false, unresolved);
  }
});

test("explicit physical variants sharing a technical catalog ID remain independent", () => {
  const game = getCatalogGame("ps5-absolum");
  assert.ok(game);
  const legacy = catalogGameToCollectionItem(game, []);
  const german = catalogGameToCollectionItem(
    game,
    [legacy],
    "complete",
    "absolum-ps5-europe-standard-de",
  );
  const korean = catalogGameToCollectionItem(
    game,
    [legacy, german],
    "complete",
    "absolum-ps5-asia-korea",
  );
  const items = [legacy, german, korean];

  assert.equal(new Set(items.map(collectionPhysicalIdentityKey)).size, 3);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-europe-standard-en-fr-es"), 1);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-europe-standard-de"), 1);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-asia-korea"), 1);
  assert.equal(countOwnedPhysicalVariant(items, "absolum-ps5-asia-japan"), 0);
  assert.equal(collectionItemMatchesPhysicalVariant(german, "absolum-ps5-europe-standard-en-fr-es"), false);
  assert.equal(collectionItemMatchesPhysicalVariant(korean, "absolum-ps5-asia-japan"), false);
  assert.equal(
    resolveCatalogPhysicalVariant("ps5-absolum-special-edition", "absolum-ps5-europe-standard-de"),
    undefined,
  );
});

test("a SIAE marking is a collectible variant with its own price identity, not another game", () => {
  const fixture: RawCatalogEditionGuide = {
    schemaVersion: 2,
    id: "resident-evil-4-ps5-siae-concept",
    title: "Resident Evil 4 PS5 · prueba conceptual SIAE",
    reviewedAt: "2026-09-12",
    note: "Fixture conceptual; no publica una clasificación factual.",
    game: {
      title: "Resident Evil 4 Remake",
      platformSlug: "ps5",
      canonicalCatalogId: "ps5-resident-evil-4-remake",
    },
    physicalEditions: [{
      id: "resident-evil-4-ps5-europe-es-it",
      label: "Edición física ES / IT",
      broadRegion: "EUROPE",
      editionType: "STANDARD",
      packagingLanguages: ["ES", "IT"],
      barcode: "concept-shared-ean",
      sharedDiscId: "resident-evil-4-ps5-europe-disc",
      catalogIds: ["ps5-resident-evil-4-remake"],
      variants: [
        { id: "resident-evil-4-no-siae", label: "Sin SIAE", priceIdentity: "re4-ps5-es-it:no-siae" },
        { id: "resident-evil-4-siae", label: "Con SIAE", stickers: ["SIAE"], priceIdentity: "re4-ps5-es-it:siae" },
      ],
    }],
    sharedDiscs: [{ id: "resident-evil-4-ps5-europe-disc", label: "Disco europeo compartido" }],
    evidence: [],
    sources: [],
    evidenceNote: "Solo valida la capacidad del modelo.",
  };
  const normalized = normalizeCatalogEditionGuide(fixture);
  assert.equal(normalized.physicalEditions.length, 1);
  assert.equal(normalized.physicalEditions[0].variants.length, 2);
  assert.deepEqual(normalized.physicalEditions[0].marketRegions, []);
  assert.equal(new Set(normalized.physicalEditions[0].variants.map((variant) => variant.priceIdentity)).size, 2);
  assert.deepEqual(normalized.physicalEditions[0].variants[1].stickers, ["SIAE"]);
  assert.equal(normalized.physicalEditions[0].sharedDiscId, "resident-evil-4-ps5-europe-disc");
});
