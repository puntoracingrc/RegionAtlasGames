import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import guideDocument from "../../data/catalog-edition-guides.json";
import scanAssets from "../../data/research/owned-scans/2026-09-12-absolum-special-edition-assets.json";
import schemaDocument from "../../data/schemas/catalog-edition-guides-v2.schema.json";
import { catalog, getCatalogGame, getPlatform } from "./catalog";
import {
  getCatalogEditionGuides,
  normalizeCatalogEditionGuide,
  type RawCatalogEditionGuide,
} from "./catalog-edition-guides";
import {
  BROAD_REGION_VALUES,
  CATALOG_MARKET_REGION_VALUES,
  CATALOG_PHYSICAL_PRICE_CONDITION_VALUES,
  PHYSICAL_EDITION_TYPE_VALUES,
  PHYSICAL_EVIDENCE_TYPE_VALUES,
  canEvidenceDefinePhysicalVariant,
  catalogEditionFamilyCountLabel,
  catalogEditionFamilyHasVariants,
  catalogMarketRegionToLegacyRegion,
  isStrongPhysicalEvidence,
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
  getCatalogPhysicalEditionPublicIdentity,
  groupCatalogListGames,
} from "./catalog-physical-edition-browse";
import { buildGameFaq, buildGameJsonLd, buildGameMetadata } from "./catalog-seo";
import { resolveCatalogGameDetailsCatalogId } from "./catalog-runtime-overlay";
import { getCompany, getGameDetails } from "./indexes";
import { publicCatalogRegionFilterOptionsForPlatform } from "./public-catalog-filter-options";
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
    ["ES", ["ps5-absolum", "ps5-absolum-special-edition"]],
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

  const ps5RegionOptions = publicCatalogRegionFilterOptionsForPlatform("ps5").map((option) => option.value);
  for (const marketCode of CATALOG_MARKET_REGION_VALUES) {
    const market = catalogMarketRegionToLegacyRegion(marketCode);
    assert.ok(ps5RegionOptions.includes(market), `missing PS5 region filter: ${market}`);
  }
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

test("only Absolum opts into edition families and legacy catalog IDs retain exact variant meaning", () => {
  const guidesWithFamilies = getCatalogEditionGuides().filter((guide) => guide.editionFamilies.length > 0);
  assert.deepEqual(guidesWithFamilies.map((guide) => guide.id), ["absolum-ps5"]);

  for (const id of [
    "gameboy-es-solomon-s-club",
    "ps1-2xtreme",
    "ps4-sekiro-shadows-die-twice",
    "ps5-clair-obscur-expedition-33-lumiere-edition",
  ]) {
    const game = getCatalogGame(id);
    assert.ok(game, `missing legacy fixture ${id}`);
    assert.equal(resolveCatalogGameDetailsCatalogId(game), id);
  }

  const legacyGuide = getCatalogEditionGuides().find((guide) => guide.id === "resident-evil-requiem-ps5");
  assert.ok(legacyGuide);
  const legacyIds = legacyGuide.physicalEditions.flatMap((edition) => edition.catalogIds);
  const legacyGames = legacyIds.map((id) => toCatalogListGame(getCatalogGame(id)!));
  assert.deepEqual(groupCatalogListGames(legacyGames).map((game) => game.id), legacyIds);

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
