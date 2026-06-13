import { getPlatform, platforms } from "./catalog";
import type { CollectionView, Platform } from "./types";

export type CollectionPlatformGroup = {
  slug: string;
  shortName: string;
  manufacturer: Platform["manufacturer"] | "other";
  sortOrder: number;
  items: CollectionView[];
};

const EXTENDED_PLATFORMS: Record<
  string,
  { shortName: string; manufacturer: Platform["manufacturer"] | "other"; sortOrder: number }
> = {
  ps5: { shortName: "PS5", manufacturer: "sony", sortOrder: 23 },
  xbox360: { shortName: "Xbox 360", manufacturer: "other", sortOrder: 24 },
  "pal-playstation-5": { shortName: "PS5", manufacturer: "sony", sortOrder: 23 },
  "jp-playstation-4": { shortName: "PS4 (JP)", manufacturer: "sony", sortOrder: 22 },
  "pal-xbox-360": { shortName: "Xbox 360", manufacturer: "other", sortOrder: 24 },
};

export const MANUFACTURER_PANEL_STYLE: Record<
  Platform["manufacturer"] | "other",
  string
> = {
  nintendo: "from-red-500/15 to-red-500/5 border-red-400/25",
  sony: "from-blue-500/15 to-blue-500/5 border-blue-400/25",
  sega: "from-indigo-500/15 to-indigo-500/5 border-indigo-400/25",
  other: "from-zinc-500/15 to-zinc-500/5 border-zinc-400/25",
};

function platformMeta(slug: string): {
  shortName: string;
  manufacturer: Platform["manufacturer"] | "other";
  sortOrder: number;
} {
  const known = getPlatform(slug);
  if (known) {
    return {
      shortName: known.shortName,
      manufacturer: known.manufacturer,
      sortOrder: known.sortOrder ?? 99,
    };
  }
  return EXTENDED_PLATFORMS[slug] ?? {
    shortName: slug.toUpperCase(),
    manufacturer: "other",
    sortOrder: 99,
  };
}

export function groupCollectionByPlatform(items: CollectionView[]): CollectionPlatformGroup[] {
  const buckets = new Map<string, CollectionView[]>();

  for (const item of items) {
    const list = buckets.get(item.platformSlug) ?? [];
    list.push(item);
    buckets.set(item.platformSlug, list);
  }

  return [...buckets.entries()]
    .map(([slug, groupItems]) => {
      const meta = platformMeta(slug);
      return {
        slug,
        shortName: meta.shortName,
        manufacturer: meta.manufacturer,
        sortOrder: meta.sortOrder,
        items: groupItems.sort((a, b) => a.title.localeCompare(b.title, "es")),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.shortName.localeCompare(b.shortName, "es"));
}

export function platformSortIndex(slug: string): number {
  return platformMeta(slug).sortOrder;
}

export const retroPlatformSlugs = new Set(platforms.map((p) => p.slug));
