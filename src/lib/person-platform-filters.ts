import { platforms } from "./catalog";
import { getPlatformHistoryData } from "./platform-history";
import { getPlatformHistoryPresentation } from "./platform-history-presentation";
import type { Platform } from "./types";

export type PersonPlatformBrand = Platform["manufacturer"];

export type PersonPlatformFilterOption = {
  slug: string;
  label: string;
};

export type PersonPlatformFilterGroup = {
  brand: PersonPlatformBrand;
  label: string;
  platforms: PersonPlatformFilterOption[];
};

const BRAND_ORDER: Array<{ brand: PersonPlatformBrand; label: string }> = [
  { brand: "sony", label: "PlayStation" },
  { brand: "nintendo", label: "Nintendo" },
  { brand: "microsoft", label: "Xbox" },
  { brand: "sega", label: "SEGA" },
  { brand: "snk", label: "Neo Geo" },
];

type PlatformFilterRecord = PersonPlatformFilterOption & {
  brand: PersonPlatformBrand;
  sortOrder: number;
  releaseYear: number;
};

export function getPersonPlatformFilterGroups(): PersonPlatformFilterGroup[] {
  const records = new Map<string, PlatformFilterRecord>();

  for (const platform of platforms) {
    const announcedYear = Number(platform.announcedReleaseDate?.slice(0, 4));
    records.set(platform.slug, {
      slug: platform.slug,
      label: platform.shortName,
      brand: platform.manufacturer,
      sortOrder: platform.sortOrder,
      releaseYear:
        platform.releaseYear ??
        platform.spainReleaseYear ??
        (Number.isFinite(announcedYear) ? announcedYear : Number.MAX_SAFE_INTEGER),
    });
  }

  for (const history of getPlatformHistoryData().platforms) {
    if (records.has(history.platformSlug)) continue;
    const platform = getPlatformHistoryPresentation(history);
    if (!platform) continue;
    records.set(platform.slug, {
      slug: platform.slug,
      label: platform.shortName,
      brand: platform.manufacturer,
      sortOrder: platform.sortOrder,
      releaseYear:
        platform.releaseYear ?? platform.spainReleaseYear ?? Number.MAX_SAFE_INTEGER,
    });
  }

  return BRAND_ORDER.map(({ brand, label }) => ({
    brand,
    label,
    platforms: [...records.values()]
      .filter((platform) => platform.brand === brand)
      .sort(
        (a, b) =>
          a.releaseYear - b.releaseYear ||
          a.sortOrder - b.sortOrder ||
          a.label.localeCompare(b.label, "es"),
      )
      .map(({ slug, label: platformLabel }) => ({ slug, label: platformLabel })),
  }));
}
