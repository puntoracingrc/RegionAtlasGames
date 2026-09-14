import { CATALOG_PAGE_SIZE, sortCatalogListGames } from "@/lib/catalog-filters";
import { getCatalogGame, publicListedCatalog } from "@/lib/catalog";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
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

async function enrichInitialCards(games: CatalogListGame[]): Promise<CatalogListGame[]> {
  const { toCatalogListGame } = await import("@/lib/catalog-list-game");
  return games.flatMap((game) => {
    const source = game.sourceCatalogGame ?? getCatalogGame(game.id);
    if (!source) return [];
    const richGame = toCatalogListGame(source);
    return [toCatalogCardGame({
      ...richGame,
      title: game.title,
      physicalEditionGroup: game.physicalEditionGroup,
      isGrail: game.isGrail,
      isTopSegment: game.isTopSegment,
    })];
  });
}

async function buildDefaultCatalogInitialPage(): Promise<InitialCatalogPage> {
  const visible = groupCatalogListGames(
    publicListedCatalog.filter(isDefaultCatalogGame).map(toCatalogListGameShell),
    { mergeSearchMetadata: false },
  );
  const firstPage = sortCatalogListGames(visible, "title-asc").slice(0, CATALOG_PAGE_SIZE);
  return {
    items: await enrichInitialCards(firstPage),
    total: visible.length,
    reviewCounts: catalogReviewCounts(publicListedCatalog),
  };
}

export function getDefaultCatalogInitialPage(): Promise<InitialCatalogPage> {
  defaultCatalogPageCache ??= buildDefaultCatalogInitialPage();
  return defaultCatalogPageCache;
}

async function buildDefaultPlatformInitialPage(platformSlug: string): Promise<InitialCatalogPage> {
  const platformGames = publicListedCatalog.filter((game) => game.platformSlug === platformSlug);
  const grouped = groupCatalogListGames(platformGames.map(toCatalogListGameShell), {
    mergeSearchMetadata: false,
  });
  const visible = grouped.filter(isDefaultCatalogGame);
  const firstPage = sortCatalogListGames(visible, "title-asc").slice(0, CATALOG_PAGE_SIZE);
  return {
    items: await enrichInitialCards(firstPage),
    total: visible.length,
    reviewCounts: catalogReviewCounts(platformGames),
  };
}

export function getDefaultPlatformInitialPage(platformSlug: string): Promise<InitialCatalogPage> {
  const cached = defaultPlatformPageCache.get(platformSlug);
  if (cached) return cached;
  const page = buildDefaultPlatformInitialPage(platformSlug);
  defaultPlatformPageCache.set(platformSlug, page);
  return page;
}
