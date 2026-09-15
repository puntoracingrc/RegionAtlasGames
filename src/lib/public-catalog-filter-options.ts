import { hasPublicCatalogGames, platforms, publicListedCatalog } from "@/lib/catalog";
import { regionSortRank } from "@/lib/platform-catalog-insights";
import { getRegionDisplay, regionDisplayIdentity } from "@/lib/region-display";
import { getCompanies } from "@/lib/indexes";
import { getCatalogEditionGuides } from "@/lib/catalog-edition-guides";
import {
  CATALOG_MARKET_REGION_META,
  catalogMarketRegionToLegacyRegion,
} from "@/lib/catalog-edition-guide-types";
import {
  publicRegionLabelForPlatform,
  publicRegionLabelsForPlatform,
} from "@/lib/platform-region-policy";
import type {
  CatalogCompanyFilterOption,
  CatalogPlatformFilterOption,
  CatalogRegionFilterOption,
} from "@/lib/catalog-filters";

type RegionOptionsIndex = {
  all: CatalogRegionFilterOption[];
  byPlatform: Record<string, CatalogRegionFilterOption[]>;
};

let regionOptionsIndexCache: RegionOptionsIndex | null = null;

const REGISTERED_MARKET_LABELS = new Set(
  Object.values(CATALOG_MARKET_REGION_META).map((market) => market.legacyRegion),
);

export function publicPlatformFilterOptions(): CatalogPlatformFilterOption[] {
  return platforms
    .filter((platform) => platform.active !== false && hasPublicCatalogGames(platform.slug))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((platform) => ({ slug: platform.slug, name: platform.shortName || platform.name }));
}

export function publicCompanyFilterOptions(): CatalogCompanyFilterOption[] {
  return getCompanies().map((company) => ({ value: company.name, name: company.name }));
}

function sortedRegionOptions(
  labels: Iterable<string>,
  flagRegions?: ReadonlyMap<string, string>,
): CatalogRegionFilterOption[] {
  return [...labels]
    .sort((a, b) => {
      const rankDiff = regionSortRank(a) - regionSortRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .map((label) => ({
      value: label,
      label,
      ...(flagRegions?.get(label) && flagRegions.get(label) !== label
        ? { flagRegion: flagRegions.get(label) }
        : {}),
    }));
}

function buildRegionOptionsIndex(): RegionOptionsIndex {
  const labels = new Map<string, string>();
  const labelsByPlatform = new Map<string, Map<string, string>>();

  const addGlobalLabel = (label: string) => {
    const identity = regionDisplayIdentity(label);
    const current = labels.get(identity);
    if (!current || (!REGISTERED_MARKET_LABELS.has(current) && REGISTERED_MARKET_LABELS.has(label))) {
      labels.set(identity, label);
    }
  };

  for (const game of publicListedCatalog) {
    const label = getRegionDisplay(game.region).label;
    addGlobalLabel(label);

    const platformLabels = labelsByPlatform.get(game.platformSlug) ?? new Map<string, string>();
    platformLabels.set(publicRegionLabelForPlatform(game.platformSlug, game.region), label);
    labelsByPlatform.set(game.platformSlug, platformLabels);
  }

  // Derived guides only restate regions already present in catalog rows. Rich
  // documented guides are the only source of additional exact market codes.
  for (const guide of getCatalogEditionGuides()) {
    const platformLabels = labelsByPlatform.get(guide.game.platformSlug) ?? new Map<string, string>();
    for (const marketRegion of guide.physicalEditions.flatMap((edition) => edition.marketRegions)) {
      const legacyRegion = catalogMarketRegionToLegacyRegion(marketRegion);
      const label = getRegionDisplay(legacyRegion).label;
      addGlobalLabel(label);
      platformLabels.set(publicRegionLabelForPlatform(guide.game.platformSlug, legacyRegion), label);
    }
    labelsByPlatform.set(guide.game.platformSlug, platformLabels);
  }

  return {
    all: sortedRegionOptions(labels.values()),
    byPlatform: Object.fromEntries(
      [...labelsByPlatform.entries()].map(([platformSlug, platformLabels]) => {
        const policyLabels = publicRegionLabelsForPlatform(platformSlug);
        const visibleLabels = policyLabels
          ? policyLabels.filter((label) => platformLabels.has(label))
          : platformLabels.keys();
        return [platformSlug, sortedRegionOptions(visibleLabels, platformLabels)];
      }),
    ),
  };
}

function regionOptionsIndex(): RegionOptionsIndex {
  regionOptionsIndexCache ??= buildRegionOptionsIndex();
  return regionOptionsIndexCache;
}

export function publicCatalogRegionFilterOptions(): CatalogRegionFilterOption[] {
  return regionOptionsIndex().all;
}

export function publicCatalogRegionFilterOptionsForPlatform(platformSlug: string): CatalogRegionFilterOption[] {
  return regionOptionsIndex().byPlatform[platformSlug] ?? [];
}

export function publicCatalogRegionFilterOptionsByPlatform(): Record<string, CatalogRegionFilterOption[]> {
  return regionOptionsIndex().byPlatform;
}
