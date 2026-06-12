export type RegionFlagCode = "ES" | "EU" | "US" | "JP" | "GB" | "DE" | "AU" | "UNKNOWN";

export type RegionDisplay = {
  flagCode: RegionFlagCode;
  label: string;
  shortLabel: string;
};

const REGION_MAP: Record<string, RegionDisplay> = {
  "pal españa": { flagCode: "ES", label: "PAL España", shortLabel: "ES" },
  españa: { flagCode: "ES", label: "España", shortLabel: "ES" },
  "pal europa": { flagCode: "EU", label: "PAL Europa", shortLabel: "EU" },
  "pal uk/eng": { flagCode: "GB", label: "PAL UK", shortLabel: "UK" },
  "pal alemania": { flagCode: "DE", label: "PAL Alemania", shortLabel: "DE" },
  usa: { flagCode: "US", label: "USA", shortLabel: "US" },
  japón: { flagCode: "JP", label: "Japón", shortLabel: "JP" },
  japan: { flagCode: "JP", label: "Japón", shortLabel: "JP" },
  australia: { flagCode: "AU", label: "Australia", shortLabel: "AU" },
};

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

/** @deprecated Usar RegionFlag; solo para `<select>` nativos sin SVG. */
export function regionShortLabel(region: string | null | undefined): string {
  return getRegionDisplay(region).shortLabel;
}
