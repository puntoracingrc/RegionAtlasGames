import type { CatalogBroadRegion } from "@/lib/catalog-edition-guide-types";

export const CATALOG_REGION_RAIL_CODES = [
  "AT",
  "AU",
  "BE",
  "CA",
  "CN",
  "DE",
  "DK",
  "ES",
  "EU",
  "FI",
  "FR",
  "GB",
  "GR",
  "HK",
  "IE",
  "IL",
  "IT",
  "JP",
  "KR",
  "NL",
  "NO",
  "PL",
  "PT",
  "RU",
  "SE",
  "TW",
  "US",
] as const;

export type CatalogRegionRailCode = (typeof CATALOG_REGION_RAIL_CODES)[number];
export type CatalogRegionRailIdentity = CatalogBroadRegion | CatalogRegionRailCode | "UNKNOWN";

const CATALOG_REGION_RAIL_SEGMENTS: Record<CatalogRegionRailIdentity, readonly string[]> = {
  EUROPE: ["#003399"],
  NORTH_AMERICA: ["#3c3b6e", "#ffffff", "#b22234"],
  ASIA: ["#bc002d", "#f2c94c"],
  OTHER: ["#64748b"],
  UNKNOWN: ["#64748b"],
  AT: ["#ed2939", "#ffffff", "#ed2939"],
  AU: ["#012169", "#ffffff", "#e4002b"],
  BE: ["#2d2926", "#fdda24", "#ef3340"],
  CA: ["#d80621", "#ffffff", "#d80621"],
  CN: ["#de2910", "#ffde00"],
  DE: ["#000000", "#dd0000", "#ffcc00"],
  DK: ["#c60c30", "#ffffff", "#c60c30"],
  ES: ["#aa151b", "#f1bf00", "#aa151b"],
  EU: ["#003399", "#ffcc00"],
  FI: ["#ffffff", "#003580", "#ffffff"],
  FR: ["#0055a4", "#ffffff", "#ef4135"],
  GB: ["#012169", "#ffffff", "#c8102e"],
  GR: ["#0d5eaf", "#ffffff", "#0d5eaf"],
  HK: ["#de2910", "#ffffff", "#de2910"],
  IE: ["#169b62", "#ffffff", "#ff883e"],
  IL: ["#ffffff", "#0038b8", "#ffffff"],
  IT: ["#009246", "#ffffff", "#ce2b37"],
  JP: ["#ffffff", "#bc002d", "#ffffff"],
  KR: ["#ffffff", "#cd2e3a", "#0047a0", "#111111"],
  NL: ["#ae1c28", "#ffffff", "#21468b"],
  NO: ["#ba0c2f", "#ffffff", "#00205b"],
  PL: ["#ffffff", "#dc143c"],
  PT: ["#046a38", "#da291c"],
  RU: ["#ffffff", "#0039a6", "#d52b1e"],
  SE: ["#006aa7", "#fecc02", "#006aa7"],
  TW: ["#000095", "#ffffff", "#fe0000"],
  US: ["#3c3b6e", "#ffffff", "#b22234"],
};

export function catalogRegionRailSegments(
  identity: CatalogRegionRailIdentity,
): readonly string[] {
  return CATALOG_REGION_RAIL_SEGMENTS[identity];
}
