import {
  availableCollectionConditions,
  isPricedCollectionCondition,
  normalizeLegacyCollectionCondition,
  type PricedCollectionCondition,
} from "./collection-condition-policy";
import {
  readUserCollection,
  updateUserCollectionItemsCondition,
} from "./collection-store";
import {
  getSellerListings,
  syncDraftListingConditionsForCollectionItems,
} from "./listings";

export type BulkCollectionConditionResult =
  | {
      updatedCount: number;
      draftListingsSynced: number;
      updatedItemIds: string[];
    }
  | { error: string; status: 400 | 404 | 409 };

function selectedItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map((itemId) => String(itemId ?? "").trim()).filter(Boolean))];
  return ids.length > 0 && ids.length <= 2_000 ? ids : null;
}

export async function updateCollectionConditionBulk(input: {
  userId: string;
  itemIds: unknown;
  collectionCondition: unknown;
}): Promise<BulkCollectionConditionResult> {
  const itemIds = selectedItemIds(input.itemIds);
  if (!itemIds) {
    return { error: "Selecciona entre 1 y 2.000 copias.", status: 400 };
  }
  if (!isPricedCollectionCondition(input.collectionCondition)) {
    return { error: "Elige un estado válido.", status: 400 };
  }
  const collectionCondition: PricedCollectionCondition = input.collectionCondition;

  const collection = await readUserCollection(input.userId);
  const itemsById = new Map(collection.items.map((item) => [item.id, item]));
  const missing = itemIds.find((itemId) => !itemsById.has(itemId));
  if (missing) {
    return { error: "Alguna copia seleccionada ya no existe en tu colección.", status: 404 };
  }

  const changedItemIds = itemIds.filter((itemId) => {
    const item = itemsById.get(itemId)!;
    return normalizeLegacyCollectionCondition(item.collectionCondition, item.sealed) !== collectionCondition;
  });
  const incompatible = changedItemIds
    .map((itemId) => itemsById.get(itemId)!)
    .find((item) => !availableCollectionConditions(item.platformSlug).includes(collectionCondition));
  if (incompatible) {
    return {
      error: `El estado elegido no está disponible para ${incompatible.platformSlug.toUpperCase()}.`,
      status: 400,
    };
  }
  if (changedItemIds.length === 0) {
    return { updatedCount: 0, draftListingsSynced: 0, updatedItemIds: [] };
  }

  const changedIds = new Set(changedItemIds);
  const sellerListings = await getSellerListings(input.userId);
  const blockedListings = sellerListings.filter(
    (listing) =>
      changedIds.has(listing.collectionItemId) &&
      (listing.status === "active" ||
        (listing.status === "sold" && listing.buyerConfirmedAt == null)),
  );
  if (blockedListings.length > 0) {
    return {
      error:
        blockedListings.length === 1
          ? "Una copia tiene una venta activa o pendiente. Retírala de la selección."
          : `${blockedListings.length} copias tienen una venta activa o pendiente. Retíralas de la selección.`,
      status: 409,
    };
  }

  const updated = await updateUserCollectionItemsCondition(
    input.userId,
    changedItemIds,
    collectionCondition,
  );
  if ("error" in updated) return { error: updated.error, status: 400 };

  const draftListingsSynced = await syncDraftListingConditionsForCollectionItems({
    sellerId: input.userId,
    collectionItemIds: updated.updatedItemIds,
    collectionCondition,
  });
  return {
    updatedCount: updated.updatedItemIds.length,
    draftListingsSynced,
    updatedItemIds: updated.updatedItemIds,
  };
}
