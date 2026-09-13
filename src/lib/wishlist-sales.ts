import { collectionPhysicalIdentityKey } from "./catalog-physical-variant";
import type { WishlistEntry } from "./wishlist-model";
import { wishlistIdentityKey } from "./wishlist-model";
import type { MarketplaceListing } from "./marketplace-types";

export type WishlistSaleUpdate = {
  catalogId: string;
  physicalVariantId?: string;
  listingCount: number;
  unseenListingKeys: string[];
};
export type WishlistSales = { games: WishlistSaleUpdate[]; unreadGameCount: number };
export const wishlistListingKey = (listing: Pick<MarketplaceListing, "id" | "publishedAt">) => `${listing.id}:${listing.publishedAt}`;

/** Only listings for the same catalog or explicit physical edition qualify. */
export function buildWishlistSales(userId: string, wishlist: WishlistEntry[], listings: Pick<MarketplaceListing, "id" | "catalogId" | "physicalVariantId" | "sellerId" | "status" | "publishedAt">[]): WishlistSales {
  const wishes = new Map(wishlist.map((wish) => [wishlistIdentityKey(wish), wish]));
  const games = new Map<string, WishlistSaleUpdate>();
  const seenByGame = new Map(wishlist.map((wish) => [wishlistIdentityKey(wish), new Set(wish.seenListingKeys)]));
  for (const listing of listings) {
    const identityKey = collectionPhysicalIdentityKey(listing);
    const wish = wishes.get(identityKey);
    if (!wish || listing.status !== "active" || listing.sellerId === userId) continue;
    const game = games.get(identityKey) ?? {
      catalogId: wish.catalogId,
      ...(wish.physicalVariantId ? { physicalVariantId: wish.physicalVariantId } : {}),
      listingCount: 0,
      unseenListingKeys: [],
    };
    game.listingCount += 1;
    // Older offers remain visible, but only newly published offers raise a notification.
    if (listing.publishedAt && Date.parse(listing.publishedAt) >= Date.parse(wish.addedAt) && !seenByGame.get(identityKey)!.has(wishlistListingKey(listing))) {
      game.unseenListingKeys.push(wishlistListingKey(listing));
    }
    games.set(identityKey, game);
  }
  const updates = [...games.values()];
  return { games: updates, unreadGameCount: updates.filter((game) => game.unseenListingKeys.length > 0).length };
}
