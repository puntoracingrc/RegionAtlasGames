import { getRegionDisplay } from "@/lib/region-display";

// Navigation groups never replace the market stored on a catalog entry.
export const REGION_NAVIGATION_GROUPS = [
  { id: "europe", label: "Europa" },
  { id: "america", label: "América" },
  { id: "asia", label: "Asia" },
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

const EUROPE_CODES = new Set([
  "ES", "EU", "GB", "UK", "DE", "FR", "IT", "AT", "BE", "DK", "SCAND",
  "FI", "GR", "IE", "NO", "NL", "PL", "PT", "RU", "SE",
]);
const AMERICA_CODES = new Set(["US", "CA", "US-CA"]);
const ASIA_CODES = new Set(["JP", "KR", "CN", "IL", "ASIA", "JP-ASIA"]);

export function regionNavigationGroup(region: string): RegionNavigationGroupId {
  const display = getRegionDisplay(region);
  if (display.shortLabel === "?" || /mercado por determinar/i.test(region)) return "pending";
  if (EUROPE_CODES.has(display.shortLabel) || region === "Europea") return "europe";
  if (AMERICA_CODES.has(display.shortLabel)) return "america";
  if (ASIA_CODES.has(display.shortLabel)) return "asia";
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
