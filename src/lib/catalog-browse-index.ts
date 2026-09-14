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
  catalogBroadRegionLabel,
  catalogPhysicalEditionTypeLabel,
  type CatalogPhysicalFilterOptions,
} from "./catalog-edition-guide-types";
import { isDefaultCatalogGame } from "./catalog-review-policy";
import { regionSortRank } from "./platform-catalog-insights";
import { getRegionDisplay, regionDisplayIdentity } from "./region-display";
import type { CatalogListGame } from "./types";
import {
  catalogBrowseFingerprint,
  decodeCatalogBrowseGame,
  type CatalogBrowseGameTuple,
} from "./catalog-browse-index-codec";
import { getCatalogOverlayLiteSnapshot } from "./catalog-overlay-lite";

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
  source: "compact" | "live";
};

let payloadCache: CatalogBrowseIndexPayload | null = null;
let decodedCache: CatalogListGame[] | null = null;
const liveCache = new Map<string, Promise<{ games: CatalogListGame[]; catalogCount: number }>>();

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

async function liveData(revision: string): Promise<{ games: CatalogListGame[]; catalogCount: number }> {
  let current = liveCache.get(revision);
  if (!current) {
    current = Promise.all([
      import("./catalog-runtime-overlay"),
      import("./catalog-list-game"),
      import("./catalog-physical-edition-browse"),
    ]).then(async ([runtime, rows, groups]) => {
      const catalog = await runtime.getPublicCatalogWithOverlay();
      return {
        games: groups.groupCatalogListGames(catalog.map(rows.toCatalogListGame)),
        catalogCount: catalog.filter(isDefaultCatalogGame).length,
      };
    });
    liveCache.clear();
    liveCache.set(revision, current);
  }
  return current;
}

function sortedRegionOptions(options: CatalogRegionFilterOption[]): CatalogRegionFilterOption[] {
  return [...options].sort((left, right) =>
    regionSortRank(left.label) - regionSortRank(right.label) ||
    left.label.localeCompare(right.label, "es", { sensitivity: "base" }),
  );
}

/** Keep hot worker additions selectable while the exact live catalog path is active. */
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
  const overlayMatchesBuild = overlay.games.every(
    (game) => index.fingerprints[game.id] === catalogBrowseFingerprint(game),
  );
  if (overlayMatchesBuild) {
    return {
      catalogCount: index.catalogCount,
      games: decodedGames(),
      filterOptions: index.filterOptions,
      revision: overlay.revision,
      source: "compact",
    };
  }
  const live = await liveData(overlay.revision);
  return {
    catalogCount: live.catalogCount,
    games: live.games,
    filterOptions: augmentCatalogBrowseFilterOptions(index.filterOptions, live.games),
    revision: overlay.revision,
    source: "live",
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
