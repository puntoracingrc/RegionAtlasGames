import { getRegionDisplay } from "@/lib/region-display";
import {
  CATALOG_MARKET_REGION_META,
  CATALOG_MARKET_REGION_VALUES,
  type CatalogMarketNavigationGroup,
} from "@/lib/catalog-edition-guide-types";

// Navigation groups never replace the market stored on a catalog entry.
export const REGION_NAVIGATION_GROUPS = [
  { id: "europe", label: "Europa" },
  { id: "america", label: "América" },
  { id: "asia", label: "Asia" },
  { id: "oceania", label: "Oceanía" },
  { id: "middle-east", label: "Oriente Medio" },
  { id: "africa", label: "África" },
  { id: "other", label: "Otros mercados y combinaciones" },
  { id: "pending", label: "Mercado pendiente de identificar" },
] as const;

export type RegionNavigationGroupId = (typeof REGION_NAVIGATION_GROUPS)[number]["id"];
export type RegionNavigationOption = {
  value: string;
  label: string;
  count?: number;
  flagRegion?: string;
};

const MARKET_NAVIGATION_GROUP_BY_SHORT_LABEL = new Map<string, CatalogMarketNavigationGroup>(
  CATALOG_MARKET_REGION_VALUES.flatMap((code) => {
    const market = CATALOG_MARKET_REGION_META[code];
    return [[market.shortLabel, market.navigationGroup], [code, market.navigationGroup]];
  }),
);

const LEGACY_GROUP_CODES: Record<CatalogMarketNavigationGroup, Set<string>> = {
  europe: new Set(["EU", "UK", "SCAND"]),
  america: new Set(["US-CA"]),
  asia: new Set(["ASIA", "JP-ASIA", "IL"]),
  oceania: new Set(),
  "middle-east": new Set(),
  africa: new Set(),
};

export function regionNavigationGroup(region: string): RegionNavigationGroupId {
  const display = getRegionDisplay(region);
  if (display.shortLabel === "?" || /mercado por determinar/i.test(region)) return "pending";
  const registeredGroup = MARKET_NAVIGATION_GROUP_BY_SHORT_LABEL.get(display.shortLabel);
  if (registeredGroup) return registeredGroup;
  if (LEGACY_GROUP_CODES.europe.has(display.shortLabel) || region === "Europea") return "europe";
  for (const [group, codes] of Object.entries(LEGACY_GROUP_CODES)) {
    if (codes.has(display.shortLabel)) return group as CatalogMarketNavigationGroup;
  }
  const parts = display.shortLabel.split("-");
  for (const group of Object.keys(LEGACY_GROUP_CODES) as CatalogMarketNavigationGroup[]) {
    if (parts.every((part) => (
      MARKET_NAVIGATION_GROUP_BY_SHORT_LABEL.get(part) === group ||
      LEGACY_GROUP_CODES[group].has(part)
    ))) return group;
  }
  return "other";
}

export function regionGroupFilterValue(id: RegionNavigationGroupId): string {
  return `region-group:${id}`;
}

export function selectedRegionGroup(value: string) {
  return REGION_NAVIGATION_GROUPS.find((group) => regionGroupFilterValue(group.id) === value);
}

export function groupRegionOptions(options: readonly RegionNavigationOption[]) {
  const unique = [...new Map(options.map((option) => [option.value, option])).values()];
  return REGION_NAVIGATION_GROUPS.map((group) => {
    const entries = unique.filter((option) => regionNavigationGroup(option.flagRegion ?? option.label) === group.id);
    return {
      ...group,
      value: regionGroupFilterValue(group.id),
      options: entries,
      count: entries.every((option) => option.count != null)
        ? entries.reduce((sum, option) => sum + (option.count ?? 0), 0)
        : undefined,
    };
  }).filter((group) => group.options.length > 0);
}

export function isRegionSelectionAvailable(value: string, options: readonly RegionNavigationOption[]): boolean {
  if (value === "all" || options.some((option) => option.value === value)) return true;
  const group = selectedRegionGroup(value);
  return Boolean(group && options.some((option) => regionNavigationGroup(option.flagRegion ?? option.label) === group.id));
}

export function compactPlatformRegions(regions: readonly string[]) {
  const unique = [...new Set(regions)];
  const priority = ["ES", "EU", "US", "JP"];
  const eligible = unique.filter((region) => regionNavigationGroup(region) !== "pending");
  const visible = (eligible.length <= 4 ? eligible : eligible.sort((a, b) => {
      const aIndex = priority.indexOf(getRegionDisplay(a).shortLabel);
      const bIndex = priority.indexOf(getRegionDisplay(b).shortLabel);
      return (aIndex < 0 ? priority.length : aIndex) - (bIndex < 0 ? priority.length : bIndex);
    })).slice(0, 4);
  return { visible, remaining: unique.length - visible.length };
}
