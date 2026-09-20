import {
  catalogBroadRegionLabel,
  catalogMarketRegionToLegacyRegion,
  catalogPhysicalEditionTypeLabel,
  isReleasedPhysicalEdition,
  isCatalogMarketRegion,
  type CatalogPhysicalEditionGroupSummary,
  type CatalogEditionGuideModel,
  type CatalogEditionFamily,
  type CatalogPhysicalEdition,
  type CatalogPhysicalFilterOptions,
  type CatalogPhysicalEditionPublicIdentity,
  type CatalogPriceRange,
} from "./catalog-edition-guide-types";
import {
  getCatalogEditionGuide,
  getCatalogEditionGuideModel,
  getCatalogEditionGuides,
} from "./catalog-edition-guides";
import {
  buildRuntimeCatalogEditionGuide,
  catalogDerivedBroadRegion,
  catalogDerivedEditionType,
} from "./catalog-derived-edition-guides";
import { getCatalogGame, publicListedCatalog } from "./catalog";
import type { CatalogGame, CatalogListGame } from "./types";
import { platformPriceMedia } from "./platform-price-condition-policy";

const catalogPhysicalFilterOptionsCache = new Map<string, CatalogPhysicalFilterOptions>();

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function priceRange(values: Array<number | null | undefined>): CatalogPriceRange | undefined {
  const prices = values.filter((value): value is number => typeof value === "number" && value > 0);
  if (!prices.length) return undefined;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function mergeSearchText(games: CatalogListGame[], additions: string[]): string {
  return unique([
    ...games.flatMap((game) => [game.searchText, game.gameSearchText].filter((value): value is string => Boolean(value))),
    ...additions,
  ]).join(" ").toLowerCase();
}

export function catalogPhysicalEditionOverviewRegions(editions: CatalogPhysicalEdition[]): string[] {
  return catalogPhysicalEditionOverviewRegionLinks(editions).map((entry) => entry.region);
}

export function catalogPhysicalEditionBroadRegionAnchorId(
  broadRegion: CatalogPhysicalEdition["broadRegion"],
): string {
  return `physical-editions-${broadRegion.toLowerCase().replaceAll("_", "-")}`;
}

export function catalogPhysicalEditionOverviewRegionLinks(
  editions: CatalogPhysicalEdition[],
): Array<{ region: string; targetId: string }> {
  const editionsByBroadRegion = new Map<CatalogPhysicalEdition["broadRegion"], CatalogPhysicalEdition[]>();
  for (const edition of editions.filter(isReleasedPhysicalEdition)) {
    editionsByBroadRegion.set(edition.broadRegion, [...(editionsByBroadRegion.get(edition.broadRegion) ?? []), edition]);
  }

  return [...editionsByBroadRegion.entries()].flatMap(([broadRegion, regionalEditions]) => {
    const broadRegionTargetId = catalogPhysicalEditionBroadRegionAnchorId(broadRegion);
    const exactMarkets = unique(regionalEditions.flatMap((edition) => edition.marketRegions));
    if (broadRegion === "EUROPE" && (regionalEditions.length > 1 || exactMarkets.length > 1)) {
      return [{ region: "PAL Europa", targetId: broadRegionTargetId }];
    }
    if (exactMarkets.length) {
      return exactMarkets.map((marketRegion) => ({
        region: catalogMarketRegionToLegacyRegion(marketRegion),
        targetId: regionalEditions.find((edition) => edition.marketRegions.includes(marketRegion))?.id
          ?? broadRegionTargetId,
      }));
    }
    if (broadRegion === "EUROPE") return [{ region: "PAL Europa", targetId: broadRegionTargetId }];
    if (broadRegion === "NORTH_AMERICA") return [{ region: "Norteamérica", targetId: broadRegionTargetId }];
    if (broadRegion === "ASIA") return [{ region: "Asia", targetId: broadRegionTargetId }];
    return [{ region: "Internacional", targetId: broadRegionTargetId }];
  });
}

function spanishList(values: string[]): string {
  if (values.length < 2) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}

function normalizedIdentityText(value: string): string {
  return value.toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Public identity for V2 edition families; never inherits the representative legacy region. */
export function getCatalogPhysicalEditionPublicIdentity(
  game: CatalogGame,
  platformName: string,
  providedGuide?: CatalogEditionGuideModel,
): CatalogPhysicalEditionPublicIdentity | undefined {
  const guide = providedGuide ?? getCatalogEditionGuide(game);
  if (guide?.schemaVersion !== 2 || !guide.currentEditionFamilyId) return undefined;

  const family = guide.editionFamilies.find((entry) => entry.id === guide.currentEditionFamilyId);
  const currentEdition = guide.physicalEditions.find((entry) => entry.id === guide.currentEditionId);
  if (!family || !currentEdition) return undefined;

  const familyEditions = guide.physicalEditions.filter((entry) => family.physicalEditionIds.includes(entry.id));
  const editions = familyEditions.filter(isReleasedPhysicalEdition);
  const hasReleasedDocumentedProduct = familyEditions.some((entry) => entry.releaseStatus === "RELEASED");
  const identityEditions = editions.length ? editions : familyEditions;
  const broadRegions = unique(identityEditions.map((entry) => entry.broadRegion));
  const broadRegionLabel = spanishList(broadRegions.map(catalogBroadRegionLabel));
  const marketRegions = unique(editions.flatMap((entry) => entry.marketRegions).filter(isCatalogMarketRegion));
  const currentMarketRegions = unique(currentEdition.marketRegions.filter(isCatalogMarketRegion));
  const titleContainsFamily = normalizedIdentityText(game.title).includes(normalizedIdentityText(family.label));
  const publicName = titleContainsFamily ? game.title : `${game.title} — ${family.label}`;
  const metadataTitle = titleContainsFamily
    ? `${game.title} — ${platformName} · ${broadRegionLabel}`
    : `${game.title} — ${family.label} · ${platformName}`;
  const documentedMarkets = spanishList(marketRegions);
  const description = editions.length === 0
    ? hasReleasedDocumentedProduct
      ? `${publicName} para ${platformName}. Producto físico documentado en ${broadRegionLabel}, sin soporte nativo verificado para el recuento de ${platformName}.`
      : `${publicName} para ${platformName}. Lanzamiento físico cancelado; no se contabiliza como edición publicada.`
    : editions.length === 1
      ? `${publicName} para ${platformName}. Edición física documentada en ${broadRegionLabel}.`
      : `${publicName} para ${platformName}. Familia de ${editions.length} ediciones físicas nativas documentadas en ${broadRegionLabel}${documentedMarkets ? ` (${documentedMarkets})` : ""}.`;
  const coverScope = currentMarketRegions.length
    ? currentMarketRegions.join(" / ")
    : catalogBroadRegionLabel(currentEdition.broadRegion);
  const coverName = titleContainsFamily ? game.title : `${game.title} ${family.label}`;

  return {
    familyLabel: family.label,
    metadataTitle,
    description,
    coverAlt: `Portada de ${coverName} para ${platformName} (${coverScope})`,
    broadRegions,
    broadRegionLabel,
    marketRegions,
    currentMarketRegions,
  };
}

function buildSummary(
  guide: CatalogEditionGuideModel,
  editions: CatalogPhysicalEdition[],
  games: CatalogListGame[],
  family?: CatalogEditionFamily,
): CatalogPhysicalEditionGroupSummary {
  const releasedEditions = editions.filter(isReleasedPhysicalEdition);
  const releasedCatalogIds = new Set(releasedEditions.flatMap((edition) => edition.catalogIds));
  const pricedGames = games.filter((game) => releasedCatalogIds.has(game.id));
  const regionCounts = new Map<CatalogPhysicalEditionGroupSummary["broadRegions"][number]["value"], number>();
  for (const edition of releasedEditions) {
    regionCounts.set(edition.broadRegion, (regionCounts.get(edition.broadRegion) ?? 0) + 1);
  }
  const complete = priceRange(pricedGames.map((game) => game.estimatedPriceComplete));
  const loose = platformPriceMedia(games[0]?.platformSlug) === "cartridge"
    ? priceRange(pricedGames.map((game) => game.estimatedPriceLoose ?? game.estimatedPriceGameManual))
    : undefined;
  const sealed = priceRange(pricedGames.map((game) => game.estimatedPriceSealed ?? game.estimatedPriceNewRetail));
  const marketRegions = unique(releasedEditions.flatMap((edition) => edition.marketRegions));
  const legacyMarketRegions = marketRegions.map(catalogMarketRegionToLegacyRegion);
  return {
    guideId: guide.id,
    canonicalCatalogId: family?.representativeCatalogId ?? guide.game.canonicalCatalogId,
    ...(family ? { editionFamilyId: family.id, editionFamilyLabel: family.label } : {}),
    catalogIds: unique(games.map((game) => game.id)),
    legacyRegions: unique([...games.map((game) => game.region), ...legacyMarketRegions]),
    marketRegions,
    overviewRegions: catalogPhysicalEditionOverviewRegions(releasedEditions),
    physicalEditionCount: releasedEditions.length,
    collectibleVariantCount: releasedEditions.reduce((total, edition) => total + edition.variants.length, 0),
    broadRegions: [...regionCounts.entries()].map(([value, editionCount]) => ({
      value,
      label: catalogBroadRegionLabel(value),
      editionCount,
    })),
    editionTypes: unique(releasedEditions.map((edition) => edition.editionType)),
    ratingSystems: unique(releasedEditions.flatMap((edition) => edition.ratingSystems)),
    packagingLanguages: unique(releasedEditions.flatMap((edition) => edition.packagingLanguages)),
    priceRanges: {
      ...(loose ? { loose } : {}),
      ...(complete ? { complete } : {}),
      ...(sealed ? { sealed } : {}),
    },
  };
}

type GroupCatalogListGamesOptions = {
  mergeSearchMetadata?: boolean;
  mergeSearchText?: boolean;
  /** Resume solo las ediciones representadas en `games`, por ejemplo en una ficha de compañía. */
  scopePhysicalEditionsToInput?: boolean;
};

/** Agrupa solo familias declaradas como v2; nunca borra ni modifica el catálogo legacy. */
export function groupCatalogListGames(
  games: CatalogListGame[],
  options: GroupCatalogListGamesOptions = {},
): CatalogListGame[] {
  const uniqueGames = [...new Map(games.map((game) => [game.id, game])).values()];
  const byId = new Map(uniqueGames.map((game) => [game.id, game]));
  const suppressed = new Set<string>();
  const replacementById = new Map<string, CatalogListGame>();
  const guidesById = new Map<string, CatalogEditionGuideModel>();
  const runtimeGames: CatalogGame[] = [];

  for (const game of uniqueGames) {
    const staticGame = getCatalogGame(game.id);
    if (staticGame) {
      const guide = getCatalogEditionGuideModel(staticGame);
      if (guide) guidesById.set(guide.id, guide);
    } else if (game.sourceCatalogGame) {
      runtimeGames.push(game.sourceCatalogGame);
    }
  }

  const groupedRuntimeCatalogIds = new Set<string>();
  for (const runtimeGame of runtimeGames) {
    if (groupedRuntimeCatalogIds.has(runtimeGame.id)) continue;
    const guide = buildRuntimeCatalogEditionGuide(runtimeGame, getCatalogEditionGuides(), runtimeGames);
    guidesById.set(guide.id, guide);
    for (const catalogId of guide.physicalEditions.flatMap((edition) => edition.catalogIds)) {
      if (byId.has(catalogId)) groupedRuntimeCatalogIds.add(catalogId);
    }
  }

  for (const guide of guidesById.values()) {
    const groupings = guide.editionFamilies.length
      ? guide.editionFamilies.map((family) => ({
          family,
          representativeCatalogId: family.representativeCatalogId,
          editions: guide.physicalEditions.filter((edition) => family.physicalEditionIds.includes(edition.id)),
        }))
      : [{ family: undefined, representativeCatalogId: guide.game.canonicalCatalogId, editions: guide.physicalEditions }];

    for (const grouping of groupings) {
      const catalogIds = unique(grouping.editions.flatMap((edition) => edition.catalogIds));
      const existingRepresentative = byId.get(grouping.representativeCatalogId);
      if (
        existingRepresentative?.physicalEditionGroup?.guideId === guide.id &&
        existingRepresentative.physicalEditionGroup.editionFamilyId === grouping.family?.id
      ) {
        replacementById.set(grouping.representativeCatalogId, existingRepresentative);
        for (const catalogId of catalogIds) {
          if (catalogId !== grouping.representativeCatalogId && byId.has(catalogId)) suppressed.add(catalogId);
        }
        continue;
      }
      const members = catalogIds.flatMap((id) => {
        const game = byId.get(id);
        return game ? [game] : [];
      });
      if (!members.length) continue;

      const summaryEditions = options.scopePhysicalEditionsToInput
        ? grouping.editions.filter((edition) => edition.catalogIds.some((catalogId) => byId.has(catalogId)))
        : grouping.editions;

      const representative = byId.get(grouping.representativeCatalogId) ?? members[0];
      const summary = buildSummary(guide, summaryEditions, members, grouping.family);
      const sharedFields = {
        ...representative,
        title: grouping.family ? representative.title : guide.game.title,
        physicalEditionGroup: summary,
        isGrail: members.some((game) => game.isGrail),
        isTopSegment: members.some((game) => game.isTopSegment),
      };
      if (options.mergeSearchMetadata === false) {
        replacementById.set(representative.id, sharedFields);
        for (const member of members) {
          if (member.id !== representative.id) suppressed.add(member.id);
        }
        continue;
      }
      const searchAdditions = summaryEditions.flatMap((edition) => [
        edition.label,
        edition.broadRegion,
        edition.editionType,
        edition.barcode,
        edition.catalogNumber,
        edition.serial,
        edition.boxCode,
        ...edition.softwareFamilyCodes,
        ...edition.productCodes,
        ...edition.marketRegions,
        ...edition.marketRegions.map(catalogMarketRegionToLegacyRegion),
        ...edition.packagingLanguages,
        ...edition.softwareLanguages,
        ...edition.componentLanguageEvidence.flatMap((languageEvidence) => languageEvidence.languages),
        ...edition.ratingSystems,
        ...edition.variants.flatMap((variant) => [variant.label, variant.barcode, variant.boxCode, ...variant.stickers, ...variant.markings]),
      ]).filter((value): value is string => Boolean(value));
      searchAdditions.push(
        ...(guide.game.aliases ?? []),
        ...(guide.game.regionalTitles ?? []).map((regionalTitle) => regionalTitle.title),
      );
      if (grouping.family) searchAdditions.push(grouping.family.label);
      const grouped: CatalogListGame = {
        ...sharedFields,
        ...(options.mergeSearchText === false ? {} : {
          searchText: mergeSearchText(members, searchAdditions),
          gameSearchText: mergeSearchText(members, [guide.game.title, ...searchAdditions]),
        }),
        companySearchText: unique(members.map((game) => game.companySearchText).filter((value): value is string => Boolean(value))).join(" "),
        companies: unique(members.flatMap((game) => game.companies ?? [])),
        genreSlugs: unique(members.flatMap((game) => game.genreSlugs ?? [])),
        subgenreSlugs: unique(members.flatMap((game) => game.subgenreSlugs ?? [])),
        facetSlugs: unique(members.flatMap((game) => game.facetSlugs ?? [])),
      };
      replacementById.set(representative.id, grouped);
      for (const member of members) {
        if (member.id !== representative.id) suppressed.add(member.id);
      }
    }
  }

  return uniqueGames.flatMap((game) => {
    if (suppressed.has(game.id)) return [];
    return [replacementById.get(game.id) ?? game];
  });
}

export function catalogPhysicalFilterOptions(platformSlug?: string): CatalogPhysicalFilterOptions {
  const cacheKey = platformSlug ?? "*";
  const cached = catalogPhysicalFilterOptionsCache.get(cacheKey);
  if (cached) return cached;

  const broadRegions = new Set<CatalogPhysicalEdition["broadRegion"]>();
  const editionTypes = new Set<CatalogPhysicalEdition["editionType"]>();
  const ratingSystems = new Set<string>();
  const documentedGuides = getCatalogEditionGuides();
  const documentedCatalogIds = new Set(documentedGuides.flatMap((guide) =>
    [
      ...guide.physicalEditions.flatMap((edition) => edition.catalogIds),
      ...guide.physicalBonusItems.flatMap((item) => item.catalogIds),
    ]));
  for (const guide of documentedGuides) {
    if (platformSlug && guide.game.platformSlug !== platformSlug) continue;
    for (const edition of guide.physicalEditions) {
      if (!isReleasedPhysicalEdition(edition)) continue;
      broadRegions.add(edition.broadRegion);
      editionTypes.add(edition.editionType);
      for (const ratingSystem of edition.ratingSystems) ratingSystems.add(ratingSystem);
    }
  }
  for (const game of publicListedCatalog) {
    if (documentedCatalogIds.has(game.id) || (platformSlug && game.platformSlug !== platformSlug)) continue;
    broadRegions.add(catalogDerivedBroadRegion(game));
    editionTypes.add(catalogDerivedEditionType(game));
  }

  const options = {
    broadRegions: [...broadRegions].map((value) => ({ value, label: catalogBroadRegionLabel(value) })),
    editionTypes: [...editionTypes].map((value) => ({ value, label: catalogPhysicalEditionTypeLabel(value) })),
    ratingSystems: [...ratingSystems].sort(),
  };
  catalogPhysicalFilterOptionsCache.set(cacheKey, options);
  return options;
}
