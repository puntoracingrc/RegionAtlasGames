const PUBLIC_REGION_LABELS_BY_PLATFORM: Record<string, readonly string[]> = {
  neogeo: ["Occidental", "Japonesa"],
};

export function publicRegionLabelsForPlatform(platformSlug: string): readonly string[] | null {
  return PUBLIC_REGION_LABELS_BY_PLATFORM[platformSlug] ?? null;
}
