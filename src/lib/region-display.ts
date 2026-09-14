import ps1MarketsData from "../../data/ps1-region-markets.json";
import ps2MarketsData from "../../data/ps2-region-markets.json";
import {
  CATALOG_MARKET_REGION_META,
  CATALOG_MARKET_REGION_VALUES,
} from "./catalog-edition-guide-types";

export type RegionFlagCode = string;

export type RegionDisplay = {
  flagCode: RegionFlagCode;
  label: string;
  shortLabel: string;
};

const REGION_MAP: Record<string, RegionDisplay> = {
  "pal españa": { flagCode: "ES", label: "PAL España", shortLabel: "ES" },
  españa: { flagCode: "ES", label: "PAL España", shortLabel: "ES" },
  "pal europa": { flagCode: "EU", label: "PAL Europa", shortLabel: "EU" },
  "pal uk/eng": { flagCode: "GB", label: "PAL UK", shortLabel: "UK" },
  "pal uk": { flagCode: "GB", label: "PAL UK", shortLabel: "UK" },
  "pal alemania": { flagCode: "DE", label: "PAL Alemania", shortLabel: "DE" },
  "pal italia": { flagCode: "IT", label: "PAL Italia", shortLabel: "IT" },
  usa: { flagCode: "US", label: "NTSC USA", shortLabel: "US" },
  "ntsc usa": { flagCode: "US", label: "NTSC USA", shortLabel: "US" },
  japón: { flagCode: "JP", label: "NTSC-J Japón", shortLabel: "JP" },
  japan: { flagCode: "JP", label: "NTSC-J Japón", shortLabel: "JP" },
  "ntsc-j japón": { flagCode: "JP", label: "NTSC-J Japón", shortLabel: "JP" },
  "ntsc-j hong kong": { flagCode: "HK", label: "NTSC-J Hong Kong", shortLabel: "HK" },
  australia: { flagCode: "AU", label: "Australia", shortLabel: "AU" },
  occidental: { flagCode: "UNKNOWN", label: "Occidental", shortLabel: "OCC" },
  internacional: { flagCode: "UNKNOWN", label: "Internacional", shortLabel: "INT" },
  japonesa: { flagCode: "JP", label: "Japonesa", shortLabel: "JP" },
};

for (const code of CATALOG_MARKET_REGION_VALUES) {
  const entry = CATALOG_MARKET_REGION_META[code];
  const display = {
    flagCode: entry.flagCode,
    label: entry.legacyRegion,
    shortLabel: entry.shortLabel,
  };
  REGION_MAP[code.toLowerCase()] = display;
  REGION_MAP[entry.country.toLowerCase()] = display;
  REGION_MAP[entry.legacyRegion.toLowerCase()] = display;
}

// Legacy PS1/PS2 market labels remain available alongside the stricter V2 registry.
for (const entry of [...Object.values(ps1MarketsData.markets), ...Object.values(ps2MarketsData.markets)]) {
  REGION_MAP[entry.label.toLowerCase()] = {
    flagCode: entry.flagCode, label: entry.label,
    shortLabel: entry.code === "GB" ? "UK" : entry.code,
  };
}
for (const family of ["PAL", "NTSC-U/C", "NTSC-J"]) {
  REGION_MAP[`${family} · mercado por determinar`.toLowerCase()] = {
    flagCode: "UNKNOWN", label: `${family} · Mercado por determinar`, shortLabel: "?",
  };
}

const DEFAULT_REGION: RegionDisplay = {
  flagCode: "UNKNOWN",
  label: "Desconocida",
  shortLabel: "?",
};

function normalizeRegionKey(region: string): string {
  return region.trim().toLowerCase();
}

export function getRegionDisplay(region: string | null | undefined): RegionDisplay {
  if (!region?.trim()) return DEFAULT_REGION;
  return REGION_MAP[normalizeRegionKey(region)] ?? {
    flagCode: "UNKNOWN",
    label: region.trim(),
    shortLabel: region.trim().slice(0, 2).toUpperCase(),
  };
}

export function regionDisplayIdentity(region: string | null | undefined): string {
  const display = getRegionDisplay(region);
  return display.flagCode === "UNKNOWN"
    ? `label:${normalizeRegionKey(display.label)}`
    : `flag:${display.flagCode.toUpperCase()}`;
}

export function sameRegionDisplayIdentity(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return regionDisplayIdentity(left) === regionDisplayIdentity(right);
}

/** @deprecated Usar RegionFlag; solo para `<select>` nativos sin SVG. */
export function regionShortLabel(region: string | null | undefined): string {
  return getRegionDisplay(region).shortLabel;
}

export const DOCUMENTED_REGION_LABELS = [...new Set(Object.values(REGION_MAP).filter((region) => region.shortLabel !== "?").map((region) => region.label))];
