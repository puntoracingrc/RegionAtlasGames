import { CATALOG_PAGE_SIZE, sortCatalogListGames } from "@/lib/catalog-filters";
import { publicListedCatalog } from "@/lib/catalog";
import { enrichCatalogCards } from "@/lib/catalog-card-enrichment";
import { toCatalogListGameShell } from "@/lib/catalog-list-game-shell";
import type { CatalogListGame } from "@/lib/types";
import { catalogReviewCounts, isDefaultCatalogGame, type CatalogReviewCounts } from "@/lib/catalog-review-policy";
import { groupCatalogListGames } from "@/lib/catalog-physical-edition-browse";

type InitialCatalogPage = {
  items: CatalogListGame[];
  total: number;
  reviewCounts: CatalogReviewCounts;
};

let defaultCatalogPageCache: Promise<InitialCatalogPage> | null = null;
const defaultPlatformPageCache = new Map<string, Promise<InitialCatalogPage>>();

async function buildDefaultCatalogInitialPage(): Promise<InitialCatalogPage> {
  const reviewGames = groupCatalogListGames(publicListedCatalog.map(toCatalogListGameShell), {
    mergeSearchMetadata: false,
  });
  const visible = groupCatalogListGames(
    publicListedCatalog.filter(isDefaultCatalogGame).map(toCatalogListGameShell),
    { mergeSearchMetadata: false },
  );
  const firstPage = sortCatalogListGames(visible, "title-asc").slice(0, CATALOG_PAGE_SIZE);
  return {
    items: await enrichCatalogCards(firstPage),
    total: visible.length,
    reviewCounts: {
      ...catalogReviewCounts(reviewGames),
      documented: visible.length,
    },
  };
}

export function getDefaultCatalogInitialPage(): Promise<InitialCatalogPage> {
  defaultCatalogPageCache ??= buildDefaultCatalogInitialPage();
  return defaultCatalogPageCache;
}

async function buildDefaultPlatformInitialPage(platformSlug: string): Promise<InitialCatalogPage> {
  const platformGames = publicListedCatalog.filter((game) => game.platformSlug === platformSlug);
  const reviewGames = groupCatalogListGames(platformGames.map(toCatalogListGameShell), {
    mergeSearchMetadata: false,
  });
  const visible = groupCatalogListGames(
    platformGames.filter(isDefaultCatalogGame).map(toCatalogListGameShell),
    { mergeSearchMetadata: false },
  );
  const firstPage = sortCatalogListGames(visible, "title-asc").slice(0, CATALOG_PAGE_SIZE);
  return {
    items: await enrichCatalogCards(firstPage),
    total: visible.length,
    reviewCounts: {
      ...catalogReviewCounts(reviewGames),
      documented: visible.length,
    },
  };
}

export function getDefaultPlatformInitialPage(platformSlug: string): Promise<InitialCatalogPage> {
  const cached = defaultPlatformPageCache.get(platformSlug);
  if (cached) return cached;
  const page = buildDefaultPlatformInitialPage(platformSlug);
  defaultPlatformPageCache.set(platformSlug, page);
  return page;
}
