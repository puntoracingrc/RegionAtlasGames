import { CATALOG_PAGE_SIZE } from "@/lib/catalog-filters";
import { publicListedCatalog } from "@/lib/catalog";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import type { CatalogListGame } from "@/lib/types";

type InitialCatalogPage = {
  items: CatalogListGame[];
  total: number;
};

let defaultCatalogPageCache: InitialCatalogPage | null = null;

function sortCatalogByTitle<T extends { title: string }>(games: T[]): T[] {
  return [...games].sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
}

export function getDefaultCatalogInitialPage(): InitialCatalogPage {
  if (defaultCatalogPageCache) return defaultCatalogPageCache;

  defaultCatalogPageCache = {
    items: sortCatalogByTitle(publicListedCatalog)
      .slice(0, CATALOG_PAGE_SIZE)
      .map(toCatalogListGame)
      .map(toCatalogCardGame),
    total: publicListedCatalog.length,
  };
  return defaultCatalogPageCache;
}
