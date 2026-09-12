import {
  catalogBroadRegionLabel,
  catalogPhysicalEditionTypeLabel,
  type CatalogPhysicalEditionGroupSummary,
  type CatalogPhysicalFilterOptions,
  type CatalogPriceRange,
} from "./catalog-edition-guide-types";
import { getGroupableCatalogEditionGuides } from "./catalog-edition-guides";
import type { CatalogListGame } from "./types";

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

function buildSummary(
  guide: ReturnType<typeof getGroupableCatalogEditionGuides>[number],
  games: CatalogListGame[],
): CatalogPhysicalEditionGroupSummary {
  const regionCounts = new Map<CatalogPhysicalEditionGroupSummary["broadRegions"][number]["value"], number>();
  for (const edition of guide.physicalEditions) {
    regionCounts.set(edition.broadRegion, (regionCounts.get(edition.broadRegion) ?? 0) + 1);
  }
  const complete = priceRange(games.map((game) => game.estimatedPriceComplete));
  const sealed = priceRange(games.map((game) => game.estimatedPriceSealed ?? game.estimatedPriceNewRetail));
  return {
    guideId: guide.id,
    canonicalCatalogId: guide.game.canonicalCatalogId,
    catalogIds: unique(games.map((game) => game.id)),
    legacyRegions: unique(games.map((game) => game.region)),
    physicalEditionCount: guide.physicalEditions.length,
    collectibleVariantCount: guide.physicalEditions.reduce((total, edition) => total + edition.variants.length, 0),
    broadRegions: [...regionCounts.entries()].map(([value, editionCount]) => ({
      value,
      label: catalogBroadRegionLabel(value),
      editionCount,
    })),
    editionTypes: unique(guide.physicalEditions.map((edition) => edition.editionType)),
    ratingSystems: unique(guide.physicalEditions.flatMap((edition) => edition.ratingSystems)),
    packagingLanguages: unique(guide.physicalEditions.flatMap((edition) => edition.packagingLanguages)),
    priceRanges: {
      ...(complete ? { complete } : {}),
      ...(sealed ? { sealed } : {}),
    },
  };
}

/** Agrupa solo familias declaradas como v2; nunca borra ni modifica el catálogo legacy. */
export function groupCatalogListGames(games: CatalogListGame[]): CatalogListGame[] {
  const byId = new Map(games.map((game) => [game.id, game]));
  const suppressed = new Set<string>();
  const replacementById = new Map<string, CatalogListGame>();

  for (const guide of getGroupableCatalogEditionGuides()) {
    const catalogIds = unique(guide.physicalEditions.flatMap((edition) => edition.catalogIds));
    const members = catalogIds.flatMap((id) => {
      const game = byId.get(id);
      return game ? [game] : [];
    });
    if (!members.length) continue;

    const representative = byId.get(guide.game.canonicalCatalogId) ?? members[0];
    const summary = buildSummary(guide, members);
    const searchAdditions = guide.physicalEditions.flatMap((edition) => [
      edition.label,
      edition.broadRegion,
      edition.editionType,
      edition.barcode,
      edition.catalogNumber,
      edition.serial,
      edition.boxCode,
      ...edition.packagingLanguages,
      ...edition.ratingSystems,
      ...edition.variants.flatMap((variant) => [variant.label, variant.barcode, variant.boxCode, ...variant.stickers, ...variant.markings]),
    ]).filter((value): value is string => Boolean(value));
    const grouped: CatalogListGame = {
      ...representative,
      title: guide.game.title,
      physicalEditionGroup: summary,
      searchText: mergeSearchText(members, searchAdditions),
      gameSearchText: mergeSearchText(members, [guide.game.title, ...searchAdditions]),
      companySearchText: unique(members.map((game) => game.companySearchText).filter((value): value is string => Boolean(value))).join(" "),
      companies: unique(members.flatMap((game) => game.companies ?? [])),
      genreSlugs: unique(members.flatMap((game) => game.genreSlugs ?? [])),
      subgenreSlugs: unique(members.flatMap((game) => game.subgenreSlugs ?? [])),
      facetSlugs: unique(members.flatMap((game) => game.facetSlugs ?? [])),
      isGrail: members.some((game) => game.isGrail),
      isTopSegment: members.some((game) => game.isTopSegment),
    };
    replacementById.set(representative.id, grouped);
    for (const member of members) {
      if (member.id !== representative.id) suppressed.add(member.id);
    }
  }

  return games.flatMap((game) => {
    if (suppressed.has(game.id)) return [];
    return [replacementById.get(game.id) ?? game];
  });
}

export function catalogPhysicalFilterOptions(platformSlug?: string): CatalogPhysicalFilterOptions {
  const guides = getGroupableCatalogEditionGuides().filter((guide) => !platformSlug || guide.game.platformSlug === platformSlug);
  const regions = unique(guides.flatMap((guide) => guide.physicalEditions.map((edition) => edition.broadRegion)));
  const editionTypes = unique(guides.flatMap((guide) => guide.physicalEditions.map((edition) => edition.editionType)));
  return {
    broadRegions: regions.map((value) => ({ value, label: catalogBroadRegionLabel(value) })),
    editionTypes: editionTypes.map((value) => ({ value, label: catalogPhysicalEditionTypeLabel(value) })),
    ratingSystems: unique(guides.flatMap((guide) => guide.physicalEditions.flatMap((edition) => edition.ratingSystems))).sort(),
  };
}
