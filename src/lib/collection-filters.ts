import { getPlatform, platforms } from "@/lib/catalog";
import { getGameDetails } from "@/lib/indexes";
import type { CollectionView, GameFilters } from "@/lib/types";

export type CollectionSort = GameFilters["sort"];

export const COLLECTION_SORT_OPTIONS: { value: CollectionSort; label: string }[] = [
  { value: "added-desc", label: "Últimos añadidos" },
  { value: "title-asc", label: "Alfabético (A → Z)" },
  { value: "year-asc", label: "Año de salida (antiguo → reciente)" },
  { value: "year-desc", label: "Año de salida (reciente → antiguo)" },
];

export const DEFAULT_COLLECTION_SORT: CollectionSort = "added-desc";

export type CollectionFilterOption = {
  slug: string;
  name: string;
  count: number;
};

function collectionDetails(item: CollectionView) {
  return item.catalogId ? getGameDetails(item.catalogId) : undefined;
}

export function collectionPlatformOptions(items: CollectionView[]): CollectionFilterOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.platformSlug, (counts.get(item.platformSlug) ?? 0) + 1);
  }

  return platforms
    .filter((p) => counts.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.shortName,
      count: counts.get(p.slug) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function collectionDeveloperOptions(items: CollectionView[]): CollectionFilterOption[] {
  const counts = new Map<string, CollectionFilterOption>();
  for (const item of items) {
    const dev = collectionDetails(item)?.developer;
    if (!dev?.slug) continue;
    const existing = counts.get(dev.slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(dev.slug, { slug: dev.slug, name: dev.name, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

export function collectionPublisherOptions(items: CollectionView[]): CollectionFilterOption[] {
  const counts = new Map<string, CollectionFilterOption>();
  for (const item of items) {
    const pub = collectionDetails(item)?.publisher;
    if (!pub?.slug) continue;
    const existing = counts.get(pub.slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(pub.slug, { slug: pub.slug, name: pub.name, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

function addedAtMs(item: CollectionView, index: number): number {
  if (item.addedAt) {
    const t = Date.parse(item.addedAt);
    if (!Number.isNaN(t)) return t;
  }
  return index;
}

function sortCollectionItems(
  list: { item: CollectionView; index: number }[],
  sort: CollectionSort,
): CollectionView[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sort) {
      case "title-asc":
        return a.item.title.localeCompare(b.item.title, "es");
      case "year-asc": {
        const ya = collectionDetails(a.item)?.year ?? Number.MAX_SAFE_INTEGER;
        const yb = collectionDetails(b.item)?.year ?? Number.MAX_SAFE_INTEGER;
        if (ya !== yb) return ya - yb;
        return a.item.title.localeCompare(b.item.title, "es");
      }
      case "year-desc": {
        const ya = collectionDetails(a.item)?.year ?? -1;
        const yb = collectionDetails(b.item)?.year ?? -1;
        if (ya !== yb) return yb - ya;
        return a.item.title.localeCompare(b.item.title, "es");
      }
      case "added-desc":
      default:
        return addedAtMs(b.item, b.index) - addedAtMs(a.item, a.index);
    }
  });
  return sorted.map(({ item }) => item);
}

export function filterCollection(
  source: CollectionView[],
  filters: GameFilters,
): CollectionView[] {
  const q = filters.q.trim().toLowerCase();
  const indexed = source.map((item, index) => ({ item, index }));

  const filtered = indexed.filter(({ item }) => {
    if (filters.platform !== "all" && item.platformSlug !== filters.platform) {
      return false;
    }
    if (filters.sealed === "yes" && !item.sealed) return false;
    if (filters.sealed === "no" && item.sealed) return false;

    const details = collectionDetails(item);
    if (filters.developer !== "all") {
      if (details?.developer?.slug !== filters.developer) return false;
    }
    if (filters.publisher !== "all") {
      if (details?.publisher?.slug !== filters.publisher) return false;
    }

    if (!q) return true;

    const platform = getPlatform(item.platformSlug);
    const haystack = [
      item.title,
      item.titlePc,
      item.platformSlug,
      platform?.name,
      platform?.shortName,
      item.notes,
      details?.developer?.name,
      details?.publisher?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return sortCollectionItems(filtered, filters.sort);
}
