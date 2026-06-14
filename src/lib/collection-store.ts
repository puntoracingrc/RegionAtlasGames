import type { CatalogGame, CollectionItem, CollectionView } from "./types";
import { enrichCollectionItem, getCatalogGame } from "./catalog";
import type { UserPlan } from "./marketplace-types";
import { canViewCollectionValue } from "./plans";
import { slugify } from "./slug";
import { loadUserCollection, saveUserCollectionFile, type UserCollectionFile } from "./collection-storage";
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

export async function writeUserCollection(data: UserCollectionFile): Promise<void> {
  const saved = await saveUserCollectionFile(data);
  if ("error" in saved) throw new Error(saved.error);
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
  return file.items.map((i) => i.catalogId).filter((id): id is string => Boolean(id));
}

export async function isCatalogGameOwned(userId: string, catalogId: string): Promise<boolean> {
  const file = await readUserCollection(userId);
  return file.items.some((i) => i.catalogId === catalogId);
}

export async function countCatalogGameOwned(userId: string, catalogId: string): Promise<number> {
  const file = await readUserCollection(userId);
  return file.items.filter((i) => i.catalogId === catalogId).length;
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

  const file = await readUserCollection(userId);
  if (file.items.some((i) => i.catalogId === catalogId)) {
    return { error: "Ya está en tu colección." };
  }

  const item = catalogGameToCollectionItem(game, file.items);
  file.items.push(item);

  try {
    await writeUserCollection(file);
  } catch (error) {
    console.error("[collection-store] add failed", error);
    return { error: "No se pudo guardar en tu colección. Inténtalo de nuevo." };
  }

  const saved = await readUserCollection(userId);
  if (!saved.items.some((i) => i.catalogId === catalogId)) {
    return { error: "No se pudo guardar en tu colección. Inténtalo de nuevo." };
  }

  return { item: saved.items.find((i) => i.catalogId === catalogId) ?? item };
}

export async function removeCatalogGameFromCollection(
  userId: string,
  catalogId: string,
): Promise<{ removed: number } | { error: string }> {
  const file = await readUserCollection(userId);
  const before = file.items.length;
  file.items = file.items.filter((i) => i.catalogId !== catalogId);
  if (file.items.length === before) {
    return { error: "No está en tu colección." };
  }
  await writeUserCollection(file);
  return { removed: before - file.items.length };
}

export async function linkCollectionItemToCatalog(
  userId: string,
  collectionItemId: string,
): Promise<{ item: CollectionItem } | { error: string }> {
  const file = await readUserCollection(userId);
  const index = file.items.findIndex((i) => i.id === collectionItemId);
  if (index < 0) {
    return { error: "Juego no encontrado en tu colección." };
  }

  const current = file.items[index];
  if (current.catalogMatched && current.catalogId) {
    return { error: "Este juego ya está enlazado al catálogo." };
  }

  const match = findAvailableCatalogLink(current);
  if (!match) {
    return { error: "Este juego aún no tiene ficha disponible en el catálogo." };
  }

  const duplicateIndex = file.items.findIndex(
    (item, itemIndex) => itemIndex !== index && item.catalogId === match.id,
  );

  if (duplicateIndex >= 0) {
    const existing = file.items[duplicateIndex];
    existing.quantity += current.quantity;
    if (current.buyPrice != null) {
      existing.buyPrice = (existing.buyPrice ?? 0) + current.buyPrice;
    }
    file.items.splice(index, 1);
    await writeUserCollection(file);
    return { item: existing };
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

  await writeUserCollection(file);
  return { item: file.items[index] };
}
