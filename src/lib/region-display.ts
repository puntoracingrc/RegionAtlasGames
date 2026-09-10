import ps1MarketsData from "../../data/ps1-region-markets.json";

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
  australia: { flagCode: "AU", label: "Australia", shortLabel: "AU" },
  occidental: { flagCode: "UNKNOWN", label: "Occidental", shortLabel: "OCC" },
  internacional: { flagCode: "UNKNOWN", label: "Internacional", shortLabel: "INT" },
  japonesa: { flagCode: "JP", label: "Japonesa", shortLabel: "JP" },
};

// Markets are data, not an enum: a new territory needs no schema change.
for (const entry of Object.values(ps1MarketsData.markets)) {
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

/** @deprecated Usar RegionFlag; solo para `<select>` nativos sin SVG. */
export function regionShortLabel(region: string | null | undefined): string {
  return getRegionDisplay(region).shortLabel;
}
