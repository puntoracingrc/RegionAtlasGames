import { enrichCollectionItemWithCatalog, getCatalogGame } from "./catalog";
import { resolveCatalogEditionMembership, withResolvedCollectionPhysicalVariant } from "./catalog-physical-variant";
import { loadCatalogPriceGames } from "./catalog-price-games";
import { getPublishedPriceHistory, type PriceHistorySnapshot } from "./price-history";
import type { CatalogGame, CollectionItem } from "./types";

async function resolveCurrentGame(id: string): Promise<CatalogGame | undefined> {
  if (process.env.CATALOG_RUNTIME_OVERLAY_ENABLED !== "1") return getCatalogGame(id);
  const { resolveCatalogGameWithOverlay } = await import("./catalog-runtime-overlay");
  return resolveCatalogGameWithOverlay(id);
}

export function collectionPriceCatalogId(item: CollectionItem): string | undefined {
  if (!item.catalogId) return undefined;
  const membership = resolveCatalogEditionMembership(item.catalogId, item.physicalVariantId);
  const id = membership
    ? membership.edition.catalogIds.find(id => id === item.catalogId) ?? membership.edition.catalogIds[0]
    : item.catalogId;
  return id ? getCatalogGame(id)?.id ?? id : undefined;
}

/** Read-time valuation: publishing never rewrites any user's saved inventory. */
export async function loadCollectionPriceData(
  items: readonly CollectionItem[],
  resolve = resolveCurrentGame,
) {
  const ids = items.map(collectionPriceCatalogId);
  const games = await loadCatalogPriceGames(ids.filter((id): id is string => Boolean(id)), resolve);
  const historyByItemId = new Map<string, PriceHistorySnapshot[]>();
  const views = items.map((item, index) => {
    const game = ids[index] ? games[ids[index]!] : undefined;
    historyByItemId.set(item.id, game ? getPublishedPriceHistory(game) : []);
    return withResolvedCollectionPhysicalVariant(enrichCollectionItemWithCatalog(item, game));
  });
  return { items: views, historyByItemId };
}

export async function enrichCollectionItemsWithCurrentPrices(items: readonly CollectionItem[]) {
  return (await loadCollectionPriceData(items)).items;
}

export async function enrichCollectionItemWithCurrentPrices(item: CollectionItem) {
  return (await enrichCollectionItemsWithCurrentPrices([item]))[0];
}
