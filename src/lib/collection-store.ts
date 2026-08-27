import type { CatalogGame, CollectionItem, CollectionView } from "./types";
import { enrichCollectionItem, getCatalogGame } from "./catalog";
import type { UserPlan } from "./marketplace-types";
import { canViewCollectionValue } from "./plans";
import { slugify } from "./slug";
import {
  loadUserCollection,
  mutateUserCollection,
  saveUserCollectionFile,
  type UserCollectionFile,
} from "./collection-storage";
import { findAvailableCatalogLink } from "./import-collection";

export type { UserCollectionFile } from "./collection-storage";

export type CollectionSummary = {
  totalItems: number;
  retroItems: number;
  outOfScopeItems: number;
  pendingCatalog: number;
  totalUnits: number;
  withEsPrice: number;
  pendingEsPrice: number;
  totalRecommendedValue: number;
  totalBuyValue: number;
};

export async function readUserCollection(userId: string): Promise<UserCollectionFile> {
  return loadUserCollection(userId);
}

export async function updateUserCollection<R>(
  userId: string,
  mutation: (current: UserCollectionFile) => { next: UserCollectionFile; result: R; changed?: boolean },
): Promise<R> {
  return mutateUserCollection(userId, mutation);
}

export async function getUserCollectionViews(userId: string): Promise<CollectionView[]> {
  const file = await readUserCollection(userId);
  return file.items.map(enrichCollectionItem);
}

export async function getUserCollectionItem(
  userId: string,
  itemId: string,
): Promise<CollectionView | undefined> {
  const file = await readUserCollection(userId);
  const item = file.items.find((i) => i.id === itemId);
  return item ? enrichCollectionItem(item) : undefined;
}

export function summarizeCollection(items: CollectionItem[]): CollectionSummary {
  const retroItems = items.filter((i) => i.inRetroCatalog);
  const withEs = items.filter((i) => i.hasEsPrice);
  const pendingCatalog = items.filter((i) => i.inRetroCatalog && !i.catalogMatched).length;

  return {
    totalItems: items.length,
    retroItems: retroItems.length,
    outOfScopeItems: items.length - retroItems.length,
    pendingCatalog,
    totalUnits: items.reduce((s, i) => s + i.quantity, 0),
    withEsPrice: withEs.length,
    pendingEsPrice: items.length - withEs.length,
    totalRecommendedValue: Math.round(
      withEs.reduce((s, i) => s + (i.totalValue ?? 0), 0) * 100,
    ) / 100,
    totalBuyValue: Math.round(
      items.reduce((s, i) => s + (i.buyPrice ?? 0) * i.quantity, 0) * 100,
    ) / 100,
  };
}

export function summarizeCollectionForPlan(
  items: CollectionItem[],
  plan: UserPlan,
): CollectionSummary {
  const summary = summarizeCollection(items);
  if (canViewCollectionValue(plan)) return summary;
  return {
    ...summary,
    totalRecommendedValue: 0,
    totalBuyValue: 0,
  };
}

export function redactCollectionViewsForPlan(
  views: CollectionView[],
  plan: UserPlan,
): CollectionView[] {
  if (canViewCollectionValue(plan)) return views;
  return views.map((view) => ({ ...view, totalValue: null }));
}

/** Juegos ya enlazados a ficha oficial — los que van en el grid principal. */
export function filterMainCollectionExplorerItems(items: CollectionView[]): CollectionView[] {
  return items.filter((item) => item.inRetroCatalog && item.catalogMatched);
}

export async function saveUserCollectionItems(
  userId: string,
  items: CollectionItem[],
  meta: { source: string | null },
): Promise<UserCollectionFile | { error: string }> {
  const data: UserCollectionFile = {
    userId,
    importedAt: new Date().toISOString(),
    source: meta.source,
    items,
  };
  const saved = await saveUserCollectionFile(data);
  if ("error" in saved) return saved;
  return data;
}

export async function getOwnedCatalogIds(userId: string): Promise<string[]> {
  const file = await readUserCollection(userId);
  return [
    ...new Set(file.items.map((i) => i.catalogId).filter((id): id is string => Boolean(id))),
  ];
}

export async function isCatalogGameOwned(userId: string, catalogId: string): Promise<boolean> {
  const file = await readUserCollection(userId);
  return file.items.some((i) => i.catalogId === catalogId);
}

export async function countCatalogGameOwned(userId: string, catalogId: string): Promise<number> {
  const file = await readUserCollection(userId);
  return file.items
    .filter((i) => i.catalogId === catalogId)
    .reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);
}

export async function getFirstCollectionItemForCatalog(
  userId: string,
  catalogId: string,
): Promise<CollectionView | undefined> {
  const file = await readUserCollection(userId);
  const item = file.items.find((i) => i.catalogId === catalogId);
  return item ? enrichCollectionItem(item) : undefined;
}

function uniqueItemId(items: CollectionItem[], title: string): string {
  const base = slugify(title);
  if (!items.some((i) => i.id === base)) return base;
  let n = 2;
  while (items.some((i) => i.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function catalogGameToCollectionItem(
  game: CatalogGame,
  items: CollectionItem[],
): CollectionItem {
  const rec = game.recommendedPrice;
  return {
    id: uniqueItemId(items, game.title),
    catalogId: game.id,
    catalogMatched: true,
    inRetroCatalog: true,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    sealed: false,
    quantity: 1,
    quantityPc: null,
    buyPrice: null,
    previousSalePrice: null,
    totalValue: rec,
    notes: null,
    marketMin: game.marketMin,
    marketMax: game.marketMax,
    recommendedPrice: game.recommendedPrice,
    estimatedPriceLoose: game.estimatedPriceLoose ?? null,
    estimatedPriceGameManual: game.estimatedPriceGameManual ?? null,
    estimatedPriceComplete: game.estimatedPriceComplete ?? null,
    estimatedPriceSealed: game.estimatedPriceSealed ?? null,
    priceDataSources: game.priceDataSources ?? null,
    pcRefPrice: game.pcRefPrice,
    deltaEsVsPc: game.deltaEsVsPc,
    priceSource: game.priceSource,
    updatedAt: game.updatedAt,
    addedAt: new Date().toISOString(),
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    cexSellPrice: game.cexSellPrice ?? null,
    cexCashPrice: game.cexCashPrice ?? null,
    cexProductUrl: game.cexProductUrl ?? null,
    cexMatchedAt: game.cexMatchedAt ?? null,
    cexRegionVerified: game.cexRegionVerified,
    jgoRetailPrice: game.jgoRetailPrice ?? null,
    jgoProductUrl: game.jgoProductUrl ?? null,
    jgoMatchedAt: game.jgoMatchedAt ?? null,
    jgoCondition: game.jgoCondition ?? null,
    jgoInStock: game.jgoInStock,
    cholloRetailPrice: game.cholloRetailPrice ?? null,
    cholloProductUrl: game.cholloProductUrl ?? null,
    cholloMatchedAt: game.cholloMatchedAt ?? null,
    cholloCondition: game.cholloCondition ?? null,
    cholloInStock: game.cholloInStock,
    kaotoRetailPrice: game.kaotoRetailPrice ?? null,
    kaotoProductUrl: game.kaotoProductUrl ?? null,
    kaotoMatchedAt: game.kaotoMatchedAt ?? null,
    kaotoCondition: game.kaotoCondition ?? null,
    kaotoInStock: game.kaotoInStock,
    tcListingPrice: game.tcListingPrice ?? null,
    tcProductUrl: game.tcProductUrl ?? null,
    tcMatchedAt: game.tcMatchedAt ?? null,
    tcnsRetailPrice: game.tcnsRetailPrice ?? null,
    tcnsProductUrl: game.tcnsProductUrl ?? null,
    tcnsMatchedAt: game.tcnsMatchedAt ?? null,
    tcnsCondition: game.tcnsCondition ?? null,
    tcnsInStock: game.tcnsInStock,
  };
}

export async function addCatalogGameToCollection(
  userId: string,
  catalogId: string,
): Promise<{ item: CollectionItem } | { error: string }> {
  const game = getCatalogGame(catalogId);
  if (!game || game.listingStatus === "excluded") {
    return { error: "Juego no encontrado en el catálogo." };
  }

  try {
    return await mutateUserCollection<{ item: CollectionItem }>(userId, (file) => {
      const item = catalogGameToCollectionItem(game, file.items);
      file.items.push(item);
      return { next: file, result: { item } };
    });
  } catch (error) {
    console.error("[collection-store] add failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return { error: detail || "No se pudo guardar en tu colección. Inténtalo de nuevo." };
  }
}

export async function removeCatalogGameFromCollection(
  userId: string,
  catalogId: string,
): Promise<{ removed: number } | { error: string }> {
  try {
    return await mutateUserCollection<{ removed: number } | { error: string }>(userId, (file) => {
      const before = file.items.length;
      file.items = file.items.filter((item) => item.catalogId !== catalogId);
      if (file.items.length === before) {
        return {
          next: file,
          result: { error: "No está en tu colección." } as const,
          changed: false,
        };
      }
      return { next: file, result: { removed: before - file.items.length } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la colección." };
  }
}

export async function removeOneCatalogGameFromCollection(
  userId: string,
  catalogId: string,
  protectedItemIds: string[] = [],
): Promise<{ removed: number; remaining: number } | { error: string }> {
  const protectedIds = new Set(protectedItemIds);
  try {
    return await mutateUserCollection<
      { removed: number; remaining: number } | { error: string }
    >(userId, (file) => {
      const matchingIndexes = file.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.catalogId === catalogId);

      if (matchingIndexes.length === 0) {
        return {
          next: file,
          result: { error: "No está en tu colección." } as const,
          changed: false,
        };
      }

      const removable = matchingIndexes.filter(({ item }) => !protectedIds.has(item.id));
      if (removable.length === 0) {
        return {
          next: file,
          result: {
            error: "No puedes quitar esta copia mientras tenga un anuncio abierto.",
          } as const,
          changed: false,
        };
      }

      const target = removable.sort((a, b) => {
        const aTime = Date.parse(a.item.addedAt ?? "");
        const bTime = Date.parse(b.item.addedAt ?? "");
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })[0];

      if (target.item.quantity > 1) {
        target.item.quantity -= 1;
        if (target.item.recommendedPrice != null) {
          target.item.totalValue =
            Math.round(target.item.recommendedPrice * target.item.quantity * 100) / 100;
        }
      } else {
        file.items.splice(target.index, 1);
      }

      const remaining = file.items
        .filter((item) => item.catalogId === catalogId)
        .reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);
      return { next: file, result: { removed: 1, remaining } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la colección." };
  }
}

export async function linkCollectionItemToCatalog(
  userId: string,
  collectionItemId: string,
): Promise<{ item: CollectionItem } | { error: string }> {
  try {
    return await mutateUserCollection<{ item: CollectionItem } | { error: string }>(userId, (file) => {
      const index = file.items.findIndex((item) => item.id === collectionItemId);
      if (index < 0) {
        return {
          next: file,
          result: { error: "Juego no encontrado en tu colección." } as const,
          changed: false,
        };
      }

      const current = file.items[index];
      if (current.catalogMatched && current.catalogId) {
        return {
          next: file,
          result: { error: "Este juego ya está enlazado al catálogo." } as const,
          changed: false,
        };
      }

      const match = findAvailableCatalogLink(current);
      if (!match) {
        return {
          next: file,
          result: { error: "Este juego aún no tiene ficha disponible en el catálogo." } as const,
          changed: false,
        };
      }

      const others = file.items.filter((_, itemIndex) => itemIndex !== index);
      const fromCatalog = catalogGameToCollectionItem(match, others);
      const recommendedPrice = current.recommendedPrice ?? fromCatalog.recommendedPrice;
      const totalValue =
        current.totalValue ??
        (recommendedPrice != null
          ? Math.round(recommendedPrice * current.quantity * 100) / 100
          : null);

      file.items[index] = {
        ...fromCatalog,
        id: current.id,
        quantity: current.quantity,
        buyPrice: current.buyPrice ?? fromCatalog.buyPrice,
        previousSalePrice: current.previousSalePrice ?? fromCatalog.previousSalePrice,
        notes: current.notes ?? fromCatalog.notes,
        sealed: current.sealed,
        quantityPc: current.quantityPc ?? fromCatalog.quantityPc,
        recommendedPrice,
        totalValue,
        hasEsPrice: fromCatalog.hasEsPrice || current.hasEsPrice,
        priceSource: current.priceSource ?? fromCatalog.priceSource,
        pcRefPrice: current.pcRefPrice ?? fromCatalog.pcRefPrice,
        addedAt: current.addedAt ?? new Date().toISOString(),
      };

      return { next: file, result: { item: file.items[index] } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la colección." };
  }
}
