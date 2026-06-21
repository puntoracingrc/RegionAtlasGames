import { listedCatalog, platforms } from "@/lib/catalog";
import { regionSortRank } from "@/lib/platform-catalog-insights";
import { getRegionDisplay } from "@/lib/region-display";
import { getCompanies } from "@/lib/indexes";
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

export function publicPlatformFilterOptions(): CatalogPlatformFilterOption[] {
  return platforms
    .filter((platform) => platform.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((platform) => ({ slug: platform.slug, name: platform.shortName || platform.name }));
}

export function publicCompanyFilterOptions(): CatalogCompanyFilterOption[] {
  return getCompanies().map((company) => ({ value: company.name, name: company.name }));
}

function sortedRegionOptions(labels: Iterable<string>): CatalogRegionFilterOption[] {
  return [...labels]
    .sort((a, b) => {
      const rankDiff = regionSortRank(a) - regionSortRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .map((label) => ({ value: label, label }));
}

function buildRegionOptionsIndex(): RegionOptionsIndex {
  const labels = new Set<string>();
  const labelsByPlatform = new Map<string, Set<string>>();

  for (const game of listedCatalog) {
    const label = getRegionDisplay(game.region).label;
    labels.add(label);

    const platformLabels = labelsByPlatform.get(game.platformSlug) ?? new Set<string>();
    platformLabels.add(label);
    labelsByPlatform.set(game.platformSlug, platformLabels);
  }

  return {
    all: sortedRegionOptions(labels),
    byPlatform: Object.fromEntries(
      [...labelsByPlatform.entries()].map(([platformSlug, platformLabels]) => [
        platformSlug,
        sortedRegionOptions(platformLabels),
      ]),
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
