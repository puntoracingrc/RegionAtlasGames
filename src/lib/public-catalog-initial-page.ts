import { CATALOG_PAGE_SIZE } from "@/lib/catalog-filters";
import { publicListedCatalog } from "@/lib/catalog";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import type { CatalogListGame } from "@/lib/types";
import { catalogReviewCounts, isDefaultCatalogGame, type CatalogReviewCounts } from "@/lib/catalog-review-policy";

type InitialCatalogPage = {
  items: CatalogListGame[];
  total: number;
  reviewCounts: CatalogReviewCounts;
};

let defaultCatalogPageCache: InitialCatalogPage | null = null;

function sortCatalogByTitle<T extends { title: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
}

export function getDefaultCatalogInitialPage(): InitialCatalogPage {
  if (defaultCatalogPageCache) return defaultCatalogPageCache;

  const visible = publicListedCatalog.filter(isDefaultCatalogGame);
  defaultCatalogPageCache = {
    items: sortCatalogByTitle(visible)
      .slice(0, CATALOG_PAGE_SIZE)
      .map(toCatalogListGame)
      .map(toCatalogCardGame),
    total: visible.length,
    reviewCounts: catalogReviewCounts(publicListedCatalog),
  };
  return defaultCatalogPageCache;
}
