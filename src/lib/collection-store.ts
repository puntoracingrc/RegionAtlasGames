import type {
  CatalogGame,
  CollectionCondition,
  CollectionItem,
  CollectionPhoto,
  CollectionPhotoSlot,
  CollectionView,
} from "./types";
import { enrichCollectionItem, getCatalogGame } from "./catalog";
import type { UserPlan } from "./marketplace-types";
import { canViewCollectionValue } from "./plans";
import { slugify } from "./slug";
import {
  loadUserCollection,
  mutateUserCollection,
  normalizeIndividualCollectionItems,
  saveUserCollectionFile,
  type UserCollectionFile,
} from "./collection-storage";
import { findAvailableCatalogLink } from "./import-collection";
import { priceForCollectionCondition } from "./condition-prices";
import { removeCollectionPhoto, upsertCollectionPhoto } from "./collection-photos";
import { deleteCollectionPhotoFile } from "./collection-photo-storage";

export type { UserCollectionFile } from "./collection-storage";

type RemovedCollectionItem = Pick<CollectionItem, "id" | "photos">;

async function deleteRemovedCollectionPhotos(
  userId: string,
  items: RemovedCollectionItem[],
): Promise<void> {
  await Promise.allSettled(
    items.flatMap((item) =>
      (item.photos ?? []).map((photo) =>
        deleteCollectionPhotoFile(userId, item.id, photo.slot),
      ),
    ),
  );
}

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

export async function getUserCollectionItemsForCatalog(
  userId: string,
  catalogId: string,
): Promise<CollectionView[]> {
  const file = await readUserCollection(userId);
  return file.items
    .filter((item) => item.catalogId === catalogId)
    .map(enrichCollectionItem);
}

function collectionTitleKey(item: CollectionItem): string {
  if (item.catalogMatched && item.catalogId) return `catalog:${item.catalogId}`;
  return `title:${item.platformSlug}:${item.region}:${slugify(item.title)}`;
}

export function summarizeCollection(items: CollectionItem[]): CollectionSummary {
  const titleGroups = new Map<string, CollectionItem[]>();
  for (const item of items) {
    const key = collectionTitleKey(item);
    const group = titleGroups.get(key);
    if (group) group.push(item);
    else titleGroups.set(key, [item]);
  }
  const groups = [...titleGroups.values()];
  const retroItems = groups.filter((group) => group.some((item) => item.inRetroCatalog));
  const withEs = groups.filter((group) => group.some((item) => item.hasEsPrice));
  const pricedCopies = items.filter((item) => item.hasEsPrice);
  const pendingCatalog = groups.filter(
    (group) =>
      group.some((item) => item.inRetroCatalog) &&
      !group.some((item) => item.catalogMatched),
  ).length;

  return {
    totalItems: groups.length,
    retroItems: retroItems.length,
    outOfScopeItems: groups.length - retroItems.length,
    pendingCatalog,
    totalUnits: items.reduce((s, i) => s + i.quantity, 0),
    withEsPrice: withEs.length,
    pendingEsPrice: groups.length - withEs.length,
    totalRecommendedValue: Math.round(
      pricedCopies.reduce((s, item) => s + (item.totalValue ?? 0), 0) * 100,
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
  const current = await readUserCollection(userId).catch(() => null);
  const individualItems = normalizeIndividualCollectionItems(items).items;
  const data: UserCollectionFile = {
    userId,
    importedAt: new Date().toISOString(),
    source: meta.source,
    items: individualItems,
    completedSaleIds: current?.completedSaleIds ?? [],
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
    collectionCondition: "unknown",
    quantity: 1,
    quantityPc: null,
    buyPrice: null,
    ownerEstimatedPrice: null,
    previousSalePrice: null,
    totalValue: rec,
    notes: null,
    photos: [],
    marketMin: game.marketMin,
    marketMax: game.marketMax,
    recommendedPrice: game.recommendedPrice,
    estimatedPriceLoose: game.estimatedPriceLoose ?? null,
    estimatedPriceGameManual: game.estimatedPriceGameManual ?? null,
    estimatedPriceComplete: game.estimatedPriceComplete ?? null,
    estimatedPriceSealed: game.estimatedPriceSealed ?? null,
    estimatedPriceNewRetail: game.estimatedPriceNewRetail ?? null,
    priceDataSources: game.priceDataSources ?? null,
    pcRefPrice: game.pcRefPrice,
    deltaEsVsPc: game.deltaEsVsPc,
    priceSource: game.priceSource,
    updatedAt: game.updatedAt,
    addedAt: new Date().toISOString(),
    purchasedAt: null,
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    gameRetailPrice: game.gameRetailPrice ?? null,
    gameCondition: game.gameCondition ?? null,
    gameMatchedAt: game.gameMatchedAt ?? null,
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

function linkCollectionItemWithCatalog(
  current: CollectionItem,
  match: CatalogGame,
  others: CollectionItem[],
): CollectionItem {
  const fromCatalog = catalogGameToCollectionItem(match, others);
  const recommendedPrice = current.recommendedPrice ?? fromCatalog.recommendedPrice;
  const totalValue =
    current.totalValue ??
    (recommendedPrice != null
      ? Math.round(recommendedPrice * current.quantity * 100) / 100
      : null);

  return {
    ...fromCatalog,
    id: current.id,
    quantity: current.quantity,
    buyPrice: current.buyPrice ?? fromCatalog.buyPrice,
    ownerEstimatedPrice: current.ownerEstimatedPrice ?? null,
    previousSalePrice: current.previousSalePrice ?? fromCatalog.previousSalePrice,
    notes: current.notes ?? fromCatalog.notes,
    sealed: current.sealed,
    collectionCondition: current.collectionCondition ?? (current.sealed ? "sealed" : "unknown"),
    quantityPc: current.quantityPc ?? fromCatalog.quantityPc,
    recommendedPrice,
    totalValue,
    hasEsPrice: fromCatalog.hasEsPrice || current.hasEsPrice,
    priceSource: current.priceSource ?? fromCatalog.priceSource,
    pcRefPrice: current.pcRefPrice ?? fromCatalog.pcRefPrice,
    addedAt: current.addedAt ?? new Date().toISOString(),
    purchasedAt: current.purchasedAt ?? null,
  };
}

export type CollectionItemDetailsPatch = {
  collectionCondition: CollectionCondition;
  buyPrice: number | null;
  ownerEstimatedPrice: number | null;
  purchasedAt: string | null;
  addedAt: string;
  notes: string | null;
};

const COLLECTION_CONDITIONS = new Set<CollectionCondition>([
  "sealed",
  "complete",
  "game-manual",
  "loose",
  "unknown",
]);

function validIsoDate(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function validateCollectionItemPatch(
  patch: CollectionItemDetailsPatch,
): string | null {
  if (!COLLECTION_CONDITIONS.has(patch.collectionCondition)) {
    return "El estado indicado no es válido.";
  }
  if (
    patch.buyPrice != null &&
    (!Number.isFinite(patch.buyPrice) || patch.buyPrice < 0 || patch.buyPrice > 1_000_000)
  ) {
    return "El precio de compra no es válido.";
  }
  if (
    patch.ownerEstimatedPrice != null &&
    (!Number.isFinite(patch.ownerEstimatedPrice) ||
      patch.ownerEstimatedPrice < 0 ||
      patch.ownerEstimatedPrice > 1_000_000)
  ) {
    return "Tu estimación de precio no es válida.";
  }
  if (patch.purchasedAt != null && !validIsoDate(patch.purchasedAt)) {
    return "La fecha de compra no es válida.";
  }
  if (!validIsoDate(patch.addedAt)) {
    return "La fecha de alta no es válida.";
  }
  if ((patch.notes?.length ?? 0) > 1_000) {
    return "Las notas no pueden superar 1.000 caracteres.";
  }
  return null;
}

export async function addCatalogCopy(
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
    return { error: error instanceof Error ? error.message : "No se pudo añadir la copia." };
  }
}

export async function updateUserCollectionItemDetails(
  userId: string,
  itemId: string,
  patch: CollectionItemDetailsPatch,
): Promise<{ item: CollectionItem } | { error: string }> {
  const validationError = validateCollectionItemPatch(patch);
  if (validationError) return { error: validationError };

  try {
    return await mutateUserCollection<{ item: CollectionItem } | { error: string }>(userId, (file) => {
      const index = file.items.findIndex((item) => item.id === itemId);
      if (index < 0) {
        return {
          next: file,
          result: { error: "Copia no encontrada en tu colección." } as const,
          changed: false,
        };
      }

      const current = file.items[index];
      const unitPrice = priceForCollectionCondition(current, patch.collectionCondition);
      const item: CollectionItem = {
        ...current,
        quantity: 1,
        quantityPc: null,
        sealed: patch.collectionCondition === "sealed",
        collectionCondition: patch.collectionCondition,
        buyPrice: patch.buyPrice == null ? null : Math.round(patch.buyPrice * 100) / 100,
        ownerEstimatedPrice:
          patch.ownerEstimatedPrice == null
            ? null
            : Math.round(patch.ownerEstimatedPrice * 100) / 100,
        purchasedAt: patch.purchasedAt,
        addedAt: patch.addedAt,
        notes: patch.notes?.trim() || null,
        totalValue:
          unitPrice == null
            ? current.totalValue
            : Math.round(unitPrice * 100) / 100,
      };
      file.items[index] = item;
      return { next: file, result: { item } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la copia." };
  }
}

export async function upsertUserCollectionPhoto(
  userId: string,
  itemId: string,
  photo: CollectionPhoto,
): Promise<{ item: CollectionItem } | { error: string }> {
  try {
    return await mutateUserCollection<{ item: CollectionItem } | { error: string }>(userId, (file) => {
      const index = file.items.findIndex((item) => item.id === itemId);
      if (index < 0) {
        return {
          next: file,
          result: { error: "Copia no encontrada en tu colección." } as const,
          changed: false,
        };
      }
      const item = {
        ...file.items[index],
        photos: upsertCollectionPhoto(file.items[index].photos, photo),
      };
      file.items[index] = item;
      return { next: file, result: { item } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la foto." };
  }
}

export async function removeUserCollectionPhoto(
  userId: string,
  itemId: string,
  slot: CollectionPhotoSlot,
): Promise<{ item: CollectionItem } | { error: string }> {
  try {
    return await mutateUserCollection<{ item: CollectionItem } | { error: string }>(userId, (file) => {
      const index = file.items.findIndex((item) => item.id === itemId);
      if (index < 0) {
        return {
          next: file,
          result: { error: "Copia no encontrada en tu colección." } as const,
          changed: false,
        };
      }
      const current = file.items[index];
      if (!(current.photos ?? []).some((photo) => photo.slot === slot)) {
        return {
          next: file,
          result: { error: "Foto no encontrada." } as const,
          changed: false,
        };
      }
      const item = {
        ...current,
        photos: removeCollectionPhoto(current.photos, slot),
      };
      file.items[index] = item;
      return { next: file, result: { item } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo eliminar la foto." };
  }
}

export async function removeUserCollectionItem(
  userId: string,
  itemId: string,
  protectedItemIds: string[] = [],
): Promise<{ removed: true } | { error: string }> {
  const protectedIds = new Set(protectedItemIds);
  try {
    const result = await mutateUserCollection<
      { removed: true; removedItem: RemovedCollectionItem } | { error: string }
    >(userId, (file) => {
      const index = file.items.findIndex((item) => item.id === itemId);
      if (index < 0) {
        return {
          next: file,
          result: { error: "Copia no encontrada en tu colección." } as const,
          changed: false,
        };
      }
      if (protectedIds.has(itemId)) {
        return {
          next: file,
          result: { error: "Retira el anuncio antes de eliminar esta copia." } as const,
          changed: false,
        };
      }
      const removedItem = file.items[index];
      file.items.splice(index, 1);
      return { next: file, result: { removed: true, removedItem } as const };
    });
    if ("error" in result) return result;
    await deleteRemovedCollectionPhotos(userId, [result.removedItem]);
    return { removed: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo eliminar la copia." };
  }
}

export async function recordCompletedCollectionSale(
  userId: string,
  itemId: string,
  saleId: string,
): Promise<{ adjusted: boolean; remaining: number }> {
  const result = await mutateUserCollection<{
    adjusted: boolean;
    remaining: number;
    removedItem: RemovedCollectionItem | null;
  }>(userId, (file) => {
    const completedSaleIds = file.completedSaleIds ?? [];
    if (completedSaleIds.includes(saleId)) {
      const remaining = file.items.find((item) => item.id === itemId)?.quantity ?? 0;
      return {
        next: file,
        result: { adjusted: false, remaining, removedItem: null },
        changed: false,
      };
    }

    const index = file.items.findIndex((item) => item.id === itemId);
    let remaining = 0;
    let removedItem: RemovedCollectionItem | null = null;
    if (index >= 0) {
      const item = file.items[index];
      if (item.quantity > 1) {
        const unitValue =
          item.totalValue != null ? item.totalValue / item.quantity : item.recommendedPrice;
        item.quantity -= 1;
        remaining = item.quantity;
        if (unitValue != null) {
          item.totalValue = Math.round(unitValue * item.quantity * 100) / 100;
        }
      } else {
        removedItem = item;
        file.items.splice(index, 1);
      }
    }

    file.completedSaleIds = [...completedSaleIds, saleId].slice(-1_000);
    return {
      next: file,
      result: { adjusted: index >= 0, remaining, removedItem },
    };
  });
  if (result.removedItem) {
    await deleteRemovedCollectionPhotos(userId, [result.removedItem]);
  }
  return { adjusted: result.adjusted, remaining: result.remaining };
}

export async function addCatalogGameToCollection(
  userId: string,
  catalogId: string,
): Promise<{ item: CollectionItem; linkedExisting: boolean } | { error: string }> {
  const game = getCatalogGame(catalogId);
  if (!game || game.listingStatus === "excluded") {
    return { error: "Juego no encontrado en el catálogo." };
  }

  try {
    return await mutateUserCollection<{ item: CollectionItem; linkedExisting: boolean }>(userId, (file) => {
      const existingIndex = file.items.findIndex((item) => {
        if (item.catalogMatched && item.catalogId) return false;
        return findAvailableCatalogLink(item)?.id === catalogId;
      });

      if (existingIndex >= 0) {
        const current = file.items[existingIndex];
        const others = file.items.filter((_, index) => index !== existingIndex);
        const linked = linkCollectionItemWithCatalog(current, game, others);
        file.items[existingIndex] = linked;
        return { next: file, result: { item: linked, linkedExisting: true } };
      }

      const item = catalogGameToCollectionItem(game, file.items);
      file.items.push(item);
      return { next: file, result: { item, linkedExisting: false } };
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
    const result = await mutateUserCollection<
      { removed: number; removedItems: RemovedCollectionItem[] } | { error: string }
    >(userId, (file) => {
      const before = file.items.length;
      const removedItems = file.items.filter((item) => item.catalogId === catalogId);
      file.items = file.items.filter((item) => item.catalogId !== catalogId);
      if (file.items.length === before) {
        return {
          next: file,
          result: { error: "No está en tu colección." } as const,
          changed: false,
        };
      }
      return {
        next: file,
        result: { removed: before - file.items.length, removedItems },
      };
    });
    if ("error" in result) return result;
    await deleteRemovedCollectionPhotos(userId, result.removedItems);
    return { removed: result.removed };
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
    const result = await mutateUserCollection<
      | { removed: number; remaining: number; removedItem: RemovedCollectionItem | null }
      | { error: string }
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
      let removedItem: RemovedCollectionItem | null = null;

      if (target.item.quantity > 1) {
        const unitValue =
          target.item.totalValue != null
            ? target.item.totalValue / target.item.quantity
            : target.item.recommendedPrice;
        target.item.quantity -= 1;
        if (unitValue != null) {
          target.item.totalValue =
            Math.round(unitValue * target.item.quantity * 100) / 100;
        }
      } else {
        removedItem = target.item;
        file.items.splice(target.index, 1);
      }

      const remaining = file.items
        .filter((item) => item.catalogId === catalogId)
        .reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);
      return {
        next: file,
        result: {
          removed: 1,
          remaining,
          removedItem,
        },
      };
    });
    if ("error" in result) return result;
    if (result.removedItem) {
      await deleteRemovedCollectionPhotos(userId, [result.removedItem]);
    }
    return { removed: result.removed, remaining: result.remaining };
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
      file.items[index] = linkCollectionItemWithCatalog(current, match, others);

      return { next: file, result: { item: file.items[index] } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la colección." };
  }
}
