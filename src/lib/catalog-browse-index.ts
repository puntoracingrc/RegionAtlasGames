import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type {
  CatalogCompanyFilterOption,
  CatalogPlatformFilterOption,
  CatalogRegionFilterOption,
  CatalogTaxonomyFilterOption,
} from "./catalog-filters";
import {
  catalogBroadRegionFromLegacyRegion,
  catalogBroadRegionLabel,
  catalogPhysicalEditionTypeLabel,
  isCatalogMarketRegion,
  type CatalogPhysicalFilterOptions,
} from "./catalog-edition-guide-types";
import { isDefaultCatalogGame } from "./catalog-review-policy";
import { normalizeCatalogSearchParts } from "./catalog-search-normalize";
import { regionSortRank } from "./platform-catalog-insights";
import { getRegionDisplay, regionDisplayIdentity } from "./region-display";
import type { CatalogGame, CatalogListGame } from "./types";
import {
  catalogBrowseFingerprint,
  decodeCatalogBrowseGame,
  type CatalogBrowseGameTuple,
} from "./catalog-browse-index-codec";
import { getCatalogOverlayLiteSnapshot } from "./catalog-overlay-lite";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";

const INDEX_VERSION = 2;
const INDEX_FILE = "catalog-browse-index.json.gz";

export type CatalogBrowseFilterOptions = {
  regions: CatalogRegionFilterOption[];
  regionsByPlatform: Record<string, CatalogRegionFilterOption[]>;
  platforms: CatalogPlatformFilterOption[];
  companies: CatalogCompanyFilterOption[];
  genres: CatalogTaxonomyFilterOption[];
  subgenres: CatalogTaxonomyFilterOption[];
  facets: CatalogTaxonomyFilterOption[];
  physicalEditions: CatalogPhysicalFilterOptions;
};

export type CatalogBrowseIndexPayload = {
  version: number;
  catalogCount: number;
  groupedCount: number;
  fingerprints: Record<string, string>;
  games: CatalogBrowseGameTuple[];
  filterOptions: CatalogBrowseFilterOptions;
};

type CatalogBrowseData = {
  catalogCount: number;
  games: CatalogListGame[];
  filterOptions: CatalogBrowseFilterOptions;
  revision: string;
  source: "compact" | "compact-overlay";
};

let payloadCache: CatalogBrowseIndexPayload | null = null;
let decodedCache: CatalogListGame[] | null = null;
const overlayCache = new Map<string, { games: CatalogListGame[]; catalogCount: number }>();

function payload(): CatalogBrowseIndexPayload {
  if (payloadCache) return payloadCache;
  const compressed = readFileSync(path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "index",
    INDEX_FILE,
  ));
  const parsed = JSON.parse(gunzipSync(compressed).toString("utf8")) as CatalogBrowseIndexPayload;
  if (parsed.version !== INDEX_VERSION || !Array.isArray(parsed.games)) {
    throw new Error(`Índice de catálogo incompatible: ${INDEX_FILE}`);
  }
  payloadCache = parsed;
  return parsed;
}

function decodedGames(): CatalogListGame[] {
  decodedCache ??= payload().games.map(decodeCatalogBrowseGame);
  return decodedCache;
}

function sortedRegionOptions(options: CatalogRegionFilterOption[]): CatalogRegionFilterOption[] {
  return [...options].sort((left, right) =>
    regionSortRank(left.label) - regionSortRank(right.label) ||
    left.label.localeCompare(right.label, "es", { sensitivity: "base" }),
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function overlaySearchText(game: CatalogGame): string {
  return normalizeCatalogSearchParts([
    game.id,
    game.slug,
    game.title,
    game.titlePc,
    game.platformSlug,
    game.region,
    game.regionFamily,
    game.marketRegion,
    game.edition,
    game.physicalVariant,
    game.museumSlug,
    game.museumRegion,
    game.pcPath,
    game.pcRegion,
    game.pcCondition,
    ...(game.languages ?? []),
    ...(game.canonicalSerials ?? []),
    ...(game.resolutionSerials ?? []),
  ]);
}

function appendSearchText(current: string | undefined, addition: string): string {
  return normalizeCatalogSearchParts([current, addition]);
}

function extendPriceRange(
  current: { min: number; max: number } | undefined,
  values: Array<number | null | undefined>,
): { min: number; max: number } | undefined {
  const prices = values.filter((value): value is number => typeof value === "number" && value > 0);
  if (current) prices.push(current.min, current.max);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : undefined;
}

function patchPhysicalEditionGroup(
  group: NonNullable<CatalogListGame["physicalEditionGroup"]>,
  overlay: CatalogGame,
): NonNullable<CatalogListGame["physicalEditionGroup"]> {
  const broadRegion = catalogBroadRegionFromLegacyRegion(overlay.regionFamily ?? overlay.region);
  const broadRegions = group.broadRegions.some((entry) => entry.value === broadRegion)
    ? group.broadRegions
    : [...group.broadRegions, {
        value: broadRegion,
        label: catalogBroadRegionLabel(broadRegion),
        editionCount: 1,
      }];
  const complete = extendPriceRange(group.priceRanges.complete, [overlay.estimatedPriceComplete]);
  const sealed = extendPriceRange(group.priceRanges.sealed, [
    overlay.estimatedPriceSealed,
    overlay.estimatedPriceNewRetail,
  ]);
  return {
    ...group,
    legacyRegions: unique([...group.legacyRegions, overlay.region]),
    marketRegions: isCatalogMarketRegion(overlay.marketRegion ?? "")
      ? unique([...group.marketRegions, overlay.marketRegion!])
      : group.marketRegions,
    overviewRegions: unique([...group.overviewRegions, overlay.region]),
    broadRegions,
    priceRanges: {
      ...(complete ? { complete } : {}),
      ...(sealed ? { sealed } : {}),
    },
  };
}

function overlayListGame(
  overlay: CatalogGame,
  displayPlatform: string,
  current?: CatalogListGame,
): CatalogListGame {
  const searchText = overlaySearchText(overlay);
  const optional = <K extends keyof CatalogListGame>(key: K): Pick<CatalogListGame, K> | object => (
    overlay[key as keyof CatalogGame] !== undefined
      ? { [key]: overlay[key as keyof CatalogGame] } as Pick<CatalogListGame, K>
      : {}
  );
  return {
    ...current,
    sourceCatalogGame: overlay,
    id: overlay.id,
    slug: overlay.slug,
    title: overlay.title,
    platformSlug: overlay.platformSlug,
    region: overlay.region,
    ...optional("regionalStatus"),
    ...optional("canonicalSeoSlug"),
    ...optional("physicalVariant"),
    coverUrl: overlay.coverUrl,
    recommendedPrice: overlay.recommendedPrice,
    ...optional("estimatedPriceLoose"),
    ...optional("estimatedPriceGameManual"),
    ...optional("estimatedPriceComplete"),
    ...optional("estimatedPriceSealed"),
    ...optional("estimatedPriceNewRetail"),
    pcRefPrice: overlay.pcRefPrice,
    hasEsPrice: overlay.hasEsPrice,
    ...optional("priceRegionVerified"),
    displayPlatform,
    displayYear: current?.displayYear ?? null,
    ...(current?.physicalEditionGroup
      ? { physicalEditionGroup: patchPhysicalEditionGroup(current.physicalEditionGroup, overlay) }
      : {}),
    isGrail: current?.isGrail ?? false,
    isTopSegment: current?.isTopSegment ?? false,
    searchText: appendSearchText(current?.searchText, searchText),
    gameSearchText: appendSearchText(current?.gameSearchText, searchText),
    companySearchText: current?.companySearchText ?? "",
    companies: current?.companies ?? [],
    sortGenre: current?.sortGenre ?? "\uffff",
    sortReference: overlay.canonicalSerials?.[0]
      ?? overlay.resolutionSerials?.[0]
      ?? current?.sortReference
      ?? overlay.slug
      ?? overlay.id,
    genreSlugs: current?.genreSlugs ?? [],
    subgenreSlugs: current?.subgenreSlugs ?? [],
    facetSlugs: current?.facetSlugs ?? [],
  };
}

/** Apply hot worker rows without loading and regrouping the full source catalog. */
export function mergeCatalogBrowseOverlay(
  games: CatalogListGame[],
  overlays: CatalogGame[],
  platforms: CatalogPlatformFilterOption[],
): CatalogListGame[] {
  const activePlatforms = new Map(platforms.map((platform) => [platform.slug, platform.name]));
  const result = [...games];
  const newOverlays: Array<{ game: CatalogGame; displayPlatform: string }> = [];
  const indexByCatalogId = new Map<string, number>();
  result.forEach((game, index) => {
    indexByCatalogId.set(game.id, index);
    for (const catalogId of game.physicalEditionGroup?.catalogIds ?? []) {
      indexByCatalogId.set(catalogId, index);
    }
  });

  for (const overlay of overlays) {
    const displayPlatform = activePlatforms.get(overlay.platformSlug);
    if (!displayPlatform || overlay.listingStatus === "excluded" || (overlay.catalogKind && overlay.catalogKind !== "game")) {
      continue;
    }
    const currentIndex = indexByCatalogId.get(overlay.id);
    if (currentIndex == null) {
      newOverlays.push({ game: overlay, displayPlatform });
      continue;
    }
    const current = result[currentIndex];
    if (current.id === overlay.id) {
      result[currentIndex] = overlayListGame(overlay, displayPlatform, current);
      continue;
    }
    const addition = overlaySearchText(overlay);
    result[currentIndex] = {
      ...current,
      searchText: appendSearchText(current.searchText, addition),
      gameSearchText: appendSearchText(current.gameSearchText, addition),
      ...(current.physicalEditionGroup
        ? { physicalEditionGroup: patchPhysicalEditionGroup(current.physicalEditionGroup, overlay) }
        : {}),
    };
  }

  const groupedNewGames = groupCatalogListGames(
    newOverlays.map(({ game, displayPlatform }) => overlayListGame(game, displayPlatform)),
    { mergeSearchMetadata: false },
  );
  for (const game of groupedNewGames) {
    const index = result.length;
    result.push(game);
    indexByCatalogId.set(game.id, index);
    for (const catalogId of game.physicalEditionGroup?.catalogIds ?? []) {
      indexByCatalogId.set(catalogId, index);
    }
  }
  return result;
}

/** Keep hot worker additions selectable in the compact catalog path. */
export function augmentCatalogBrowseFilterOptions(
  base: CatalogBrowseFilterOptions,
  games: CatalogListGame[],
): CatalogBrowseFilterOptions {
  const regions = new Map(base.regions.map((option) => [regionDisplayIdentity(option.label), option]));
  const regionsByPlatform = new Map<string, Map<string, CatalogRegionFilterOption>>(
    Object.entries(base.regionsByPlatform).map(([platformSlug, options]) => [
      platformSlug,
      new Map(options.map((option) => [regionDisplayIdentity(option.label), option])),
    ]),
  );
  const platforms = new Map(base.platforms.map((option) => [option.slug, option]));
  const companies = new Map(base.companies.map((option) => [option.value, option]));
  const broadRegions = new Map(base.physicalEditions.broadRegions.map((option) => [option.value, option]));
  const editionTypes = new Map(base.physicalEditions.editionTypes.map((option) => [option.value, option]));
  const ratingSystems = new Set(base.physicalEditions.ratingSystems);

  for (const game of games) {
    const regionLabel = getRegionDisplay(game.region).label;
    const regionIdentity = regionDisplayIdentity(regionLabel);
    if (!regions.has(regionIdentity)) {
      regions.set(regionIdentity, { value: regionLabel, label: regionLabel });
    }
    const platformRegions = regionsByPlatform.get(game.platformSlug) ?? new Map();
    if (!platformRegions.has(regionIdentity)) {
      platformRegions.set(regionIdentity, { value: regionLabel, label: regionLabel });
    }
    regionsByPlatform.set(game.platformSlug, platformRegions);
    if (!platforms.has(game.platformSlug)) {
      platforms.set(game.platformSlug, {
        slug: game.platformSlug,
        name: game.displayPlatform || game.platformSlug.toUpperCase(),
      });
    }
    for (const company of game.companies ?? []) {
      if (!companies.has(company)) companies.set(company, { value: company, name: company });
    }
    for (const broadRegion of game.physicalEditionGroup?.broadRegions ?? []) {
      if (!broadRegions.has(broadRegion.value)) {
        broadRegions.set(broadRegion.value, {
          value: broadRegion.value,
          label: catalogBroadRegionLabel(broadRegion.value),
        });
      }
    }
    for (const editionType of game.physicalEditionGroup?.editionTypes ?? []) {
      if (!editionTypes.has(editionType)) {
        editionTypes.set(editionType, {
          value: editionType,
          label: catalogPhysicalEditionTypeLabel(editionType),
        });
      }
    }
    for (const ratingSystem of game.physicalEditionGroup?.ratingSystems ?? []) {
      ratingSystems.add(ratingSystem);
    }
  }

  return {
    ...base,
    regions: sortedRegionOptions([...regions.values()]),
    regionsByPlatform: Object.fromEntries(
      [...regionsByPlatform].map(([platformSlug, options]) => [
        platformSlug,
        sortedRegionOptions([...options.values()]),
      ]),
    ),
    platforms: [...platforms.values()],
    companies: [...companies.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
    ),
    physicalEditions: {
      broadRegions: [...broadRegions.values()],
      editionTypes: [...editionTypes.values()],
      ratingSystems: [...ratingSystems].sort((left, right) => left.localeCompare(right, "es")),
    },
  };
}

export async function getCatalogBrowseData(): Promise<CatalogBrowseData> {
  const index = payload();
  const overlay = await getCatalogOverlayLiteSnapshot();
  const changedOverlayGames = overlay.games.filter(
    (game) => index.fingerprints[game.id] !== catalogBrowseFingerprint(game),
  );
  const overlayMatchesBuild = changedOverlayGames.length === 0;
  if (overlayMatchesBuild) {
    return {
      catalogCount: index.catalogCount,
      games: decodedGames(),
      filterOptions: index.filterOptions,
      revision: overlay.revision,
      source: "compact",
    };
  }

  let current = overlayCache.get(overlay.revision);
  if (!current) {
    const games = mergeCatalogBrowseOverlay(
      decodedGames(),
      changedOverlayGames,
      index.filterOptions.platforms,
    );
    const newDefaultGames = changedOverlayGames.filter(
      (game) => index.fingerprints[game.id] == null && isDefaultCatalogGame(game),
    ).length;
    current = {
      games,
      catalogCount: index.catalogCount + newDefaultGames,
    };
    overlayCache.clear();
    overlayCache.set(overlay.revision, current);
  }
  return {
    catalogCount: current.catalogCount,
    games: current.games,
    filterOptions: augmentCatalogBrowseFilterOptions(index.filterOptions, current.games),
    revision: overlay.revision,
    source: "compact-overlay",
  };
}

export function getCatalogBrowseIndexStats(): Pick<
  CatalogBrowseIndexPayload,
  "catalogCount" | "groupedCount" | "version"
> {
  const index = payload();
  return {
    catalogCount: index.catalogCount,
    groupedCount: index.groupedCount,
    version: index.version,
  };
}
