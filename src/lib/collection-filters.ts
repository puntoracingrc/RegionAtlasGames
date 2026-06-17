import type { CollectionView, GameFilters } from "@/lib/types";

export type CollectionSort = GameFilters["sort"];

export const COLLECTION_SORT_OPTIONS: { value: CollectionSort; label: string }[] = [
  { value: "added-desc", label: "Últimos añadidos" },
  { value: "title-asc", label: "Alfabético (A → Z)" },
  { value: "year-asc", label: "Año de salida (antiguo → reciente)" },
  { value: "year-desc", label: "Año de salida (reciente → antiguo)" },
];

export const DEFAULT_COLLECTION_SORT: CollectionSort = "added-desc";

export const DEFAULT_COLLECTION_FILTERS: GameFilters = {
  q: "",
  platform: "all",
  developer: "all",
  publisher: "all",
  sort: DEFAULT_COLLECTION_SORT,
  sealed: "all",
};

export function hasActiveCollectionFilters(filters: GameFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.platform !== "all" ||
    filters.developer !== "all" ||
    filters.publisher !== "all" ||
    filters.sort !== DEFAULT_COLLECTION_SORT ||
    filters.sealed !== "all"
  );
}

export type CollectionFilterOption = {
  slug: string;
  name: string;
  count: number;
};

export function collectionPlatformOptions(items: CollectionView[]): CollectionFilterOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.platformSlug, (counts.get(item.platformSlug) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      name: slug.toUpperCase(),
      count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function collectionDeveloperOptions(items: CollectionView[]): CollectionFilterOption[] {
  void items;
  return [];
}

export function collectionPublisherOptions(items: CollectionView[]): CollectionFilterOption[] {
  void items;
  return [];
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
        return a.item.title.localeCompare(b.item.title, "es");
      }
      case "year-desc": {
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

    if (filters.developer !== "all" || filters.publisher !== "all") return false;

    if (!q) return true;

    const haystack = [
      item.title,
      item.titlePc,
      item.platformSlug,
      item.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return sortCollectionItems(filtered, filters.sort);
}
