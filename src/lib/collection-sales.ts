import type { MarketplaceListing } from "./marketplace-types";
import type { CollectionListingState } from "./types";

const STATE_PRIORITY: Record<CollectionListingState, number> = {
  active: 3,
  draft: 2,
  "pending-sale": 1,
};

export function collectionListingStates(
  listings: readonly MarketplaceListing[],
): Record<string, CollectionListingState> {
  const states: Record<string, CollectionListingState> = {};

  for (const listing of listings) {
    const nextState: CollectionListingState | null =
      listing.status === "active" || listing.status === "draft"
        ? listing.status
        : listing.status === "sold" && !listing.buyerConfirmedAt
          ? "pending-sale"
          : null;
    if (!nextState) continue;

    const current = states[listing.collectionItemId];
    if (!current || STATE_PRIORITY[nextState] > STATE_PRIORITY[current]) {
      states[listing.collectionItemId] = nextState;
    }
  }

  return states;
}

export function completedCollectionSales(
  listings: readonly MarketplaceListing[],
): MarketplaceListing[] {
  return listings
    .filter(
      (listing) =>
        listing.status === "sold" &&
        listing.buyerConfirmedAt != null &&
        listing.recordedSalePriceEur != null,
    )
    .sort((left, right) => right.buyerConfirmedAt!.localeCompare(left.buyerConfirmedAt!));
}

export function completedCollectionPurchases(
  listings: readonly MarketplaceListing[],
  buyerId: string,
): MarketplaceListing[] {
  return listings
    .filter(
      (listing) =>
        listing.soldToUserId === buyerId &&
        listing.status === "sold" &&
        listing.buyerConfirmedAt != null &&
        listing.recordedSalePriceEur != null,
    )
    .sort((left, right) => right.buyerConfirmedAt!.localeCompare(left.buyerConfirmedAt!));
}
