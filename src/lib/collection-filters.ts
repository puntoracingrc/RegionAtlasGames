import {
  collectionCondition,
  type CollectionDisplayItem,
} from "@/lib/collection-display";
import type {
  CollectionListingState,
  CollectionView,
  GameFilters,
} from "@/lib/types";

export type CollectionSort = GameFilters["sort"];

export const COLLECTION_SORT_OPTIONS: { value: CollectionSort; label: string }[] = [
  { value: "added-desc", label: "Últimos añadidos" },
  { value: "added-asc", label: "Primeros añadidos" },
  { value: "purchased-desc", label: "Compra más reciente" },
  { value: "purchased-asc", label: "Compra más antigua" },
  { value: "price-desc", label: "Precio (mayor → menor)" },
  { value: "price-asc", label: "Precio (menor → mayor)" },
  { value: "quantity-desc", label: "Cantidad (mayor → menor)" },
  { value: "quantity-asc", label: "Cantidad (menor → mayor)" },
  { value: "title-asc", label: "Alfabético (A → Z)" },
];

export const DEFAULT_COLLECTION_SORT: CollectionSort = "added-desc";

export const DEFAULT_COLLECTION_FILTERS: GameFilters = {
  q: "",
  platform: "all",
  developer: "all",
  publisher: "all",
  sort: DEFAULT_COLLECTION_SORT,
  condition: "all",
  sale: "all",
};

export function hasActiveCollectionFilters(filters: GameFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.platform !== "all" ||
    filters.developer !== "all" ||
    filters.publisher !== "all" ||
    filters.sort !== DEFAULT_COLLECTION_SORT ||
    filters.condition !== "all" ||
    filters.sale !== "all"
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

export function filterCollection(
  source: CollectionView[],
  filters: GameFilters,
  listingStateByItemId: Record<string, CollectionListingState> = {},
): CollectionView[] {
  const q = filters.q.trim().toLowerCase();

  return source.filter((item) => {
    if (filters.platform !== "all" && item.platformSlug !== filters.platform) {
      return false;
    }
    if (filters.condition !== "all" && collectionCondition(item) !== filters.condition) {
      return false;
    }

    const listingState = listingStateByItemId[item.id] ?? null;
    if (filters.sale === "not-listed" && listingState !== null) return false;
    if (
      filters.sale !== "all" &&
      filters.sale !== "not-listed" &&
      listingState !== filters.sale
    ) {
      return false;
    }

    if (filters.developer !== "all" || filters.publisher !== "all") return false;
    if (!q) return true;

    const haystack = [item.title, item.titlePc, item.platformSlug, item.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function dateMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function unitPrice(item: CollectionDisplayItem): number | null {
  if (item.game.recommendedPrice != null) return item.game.recommendedPrice;
  if (item.game.totalValue == null || item.units <= 0) return null;
  return item.game.totalValue / item.units;
}

export function sortCollectionDisplayItems(
  source: CollectionDisplayItem[],
  sort: CollectionSort,
): CollectionDisplayItem[] {
  const indexed = source.map((item, index) => ({ item, index }));
  indexed.sort((left, right) => {
    let compared = 0;
    switch (sort) {
      case "title-asc":
        return left.item.game.title.localeCompare(right.item.game.title, "es");
      case "price-desc":
        compared = compareNullableNumber(unitPrice(left.item), unitPrice(right.item), "desc");
        break;
      case "price-asc":
        compared = compareNullableNumber(unitPrice(left.item), unitPrice(right.item), "asc");
        break;
      case "purchased-desc":
        compared = compareNullableNumber(
          dateMs(left.item.latestPurchasedAt),
          dateMs(right.item.latestPurchasedAt),
          "desc",
        );
        break;
      case "purchased-asc":
        compared = compareNullableNumber(
          dateMs(left.item.earliestPurchasedAt),
          dateMs(right.item.earliestPurchasedAt),
          "asc",
        );
        break;
      case "quantity-desc":
        compared = right.item.units - left.item.units;
        break;
      case "quantity-asc":
        compared = left.item.units - right.item.units;
        break;
      case "added-asc":
        compared = compareNullableNumber(
          dateMs(left.item.earliestAddedAt),
          dateMs(right.item.earliestAddedAt),
          "asc",
        );
        break;
      case "added-desc":
      default:
        compared = compareNullableNumber(
          dateMs(left.item.latestAddedAt),
          dateMs(right.item.latestAddedAt),
          "desc",
        );
        if (compared === 0 && !left.item.latestAddedAt && !right.item.latestAddedAt) {
          compared = right.index - left.index;
        }
        break;
    }

    return compared || left.item.game.title.localeCompare(right.item.game.title, "es");
  });
  return indexed.map(({ item }) => item);
}
