import { getRegionDisplay } from "@/lib/region-display";

const PUBLIC_REGION_LABELS_BY_PLATFORM: Record<string, readonly string[]> = {
  neogeo: ["Occidental", "Japonesa"],
  neogeocd: ["Occidental", "Japonesa"],
  "neogeo-aes-plus": ["Internacional", "Japonesa"],
  neogeopocket: ["USA", "Europea", "Japonesa"],
};

const REGION_LABEL_ALIASES_BY_PLATFORM: Record<string, Readonly<Record<string, string>>> = {
  neogeopocket: {
    "NTSC USA": "USA",
    "PAL Europa": "Europea",
    "NTSC-J Japón": "Japonesa",
  },
};

export function publicRegionLabelsForPlatform(platformSlug: string): readonly string[] | null {
  return PUBLIC_REGION_LABELS_BY_PLATFORM[platformSlug] ?? null;
}

export function publicRegionLabelForPlatform(platformSlug: string, region: string): string {
  const standardLabel = getRegionDisplay(region).label;
  return REGION_LABEL_ALIASES_BY_PLATFORM[platformSlug]?.[standardLabel] ?? standardLabel;
}
