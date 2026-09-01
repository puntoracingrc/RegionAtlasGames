import {
  getUserCollectionItem,
  updateUserCollectionItemDetails,
  type CollectionItemDetailsPatch,
} from "./collection-store";
import {
  getSellerOpenListingForCollectionItem,
  syncDraftListingConditionForCollectionItem,
} from "./listings";
import type { CollectionItem } from "./types";
import {
  availableCollectionConditions,
  isPricedCollectionCondition,
  normalizeLegacyCollectionCondition,
} from "./collection-condition-policy";

export type CollectionCopyDetailsUpdateResult =
  | { item: CollectionItem; draftSynced: boolean }
  | { error: string; status: 400 | 404 | 409 };

export async function updateCollectionCopyDetails(
  userId: string,
  itemId: string,
  patch: CollectionItemDetailsPatch,
): Promise<CollectionCopyDetailsUpdateResult> {
  const current = await getUserCollectionItem(userId, itemId);
  if (!current) {
    return { error: "Copia no encontrada en tu colección.", status: 404 };
  }

  const currentCondition = normalizeLegacyCollectionCondition(
    current.collectionCondition,
    current.sealed,
  );
  const conditionChanged = patch.collectionCondition !== currentCondition;
  if (!isPricedCollectionCondition(patch.collectionCondition)) {
    return { error: "Elige un estado válido.", status: 400 };
  }
  if (
    conditionChanged &&
    !availableCollectionConditions(current.platformSlug).includes(patch.collectionCondition)
  ) {
    return { error: "Ese estado no está disponible para esta plataforma.", status: 400 };
  }
  const openListing = await getSellerOpenListingForCollectionItem(userId, itemId);

  if (openListing?.status === "active" && conditionChanged) {
    return {
      error: "Retira el anuncio de la venta antes de cambiar el estado de esta copia.",
      status: 409,
    };
  }

  const result = await updateUserCollectionItemDetails(userId, itemId, patch);
  if ("error" in result) {
    return { error: result.error, status: 400 };
  }

  let draftSynced = false;
  if (openListing?.status === "draft" && conditionChanged) {
    draftSynced = await syncDraftListingConditionForCollectionItem({
      sellerId: userId,
      collectionItemId: itemId,
      collectionCondition: patch.collectionCondition,
    });
  }

  return { item: result.item, draftSynced };
}
