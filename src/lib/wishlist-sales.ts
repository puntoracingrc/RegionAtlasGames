import type { WishlistEntry } from "./wishlist-model";
import type { MarketplaceListing } from "./marketplace-types";

export type WishlistSaleUpdate = { catalogId: string; listingCount: number; unseenListingKeys: string[] };
export type WishlistSales = { games: WishlistSaleUpdate[]; unreadGameCount: number };
export const wishlistListingKey = (listing: Pick<MarketplaceListing, "id" | "publishedAt">) => `${listing.id}:${listing.publishedAt}`;

/** An edition is identified by its catalog ID; other regions and external offers never qualify. */
export function buildWishlistSales(userId: string, wishlist: WishlistEntry[], listings: Pick<MarketplaceListing, "id" | "catalogId" | "sellerId" | "status" | "publishedAt">[]): WishlistSales {
  const wishes = new Map(wishlist.map((wish) => [wish.catalogId, wish]));
  const games = new Map<string, WishlistSaleUpdate>();
  const seenByGame = new Map(wishlist.map((wish) => [wish.catalogId, new Set(wish.seenListingKeys)]));
  for (const listing of listings) {
    const wish = wishes.get(listing.catalogId);
    if (!wish || listing.status !== "active" || listing.sellerId === userId) continue;
    const game = games.get(wish.catalogId) ?? { catalogId: wish.catalogId, listingCount: 0, unseenListingKeys: [] };
    game.listingCount += 1;
    // Older offers remain visible, but only newly published offers raise a notification.
    if (listing.publishedAt && Date.parse(listing.publishedAt) >= Date.parse(wish.addedAt) && !seenByGame.get(wish.catalogId)!.has(wishlistListingKey(listing))) {
      game.unseenListingKeys.push(wishlistListingKey(listing));
    }
    games.set(wish.catalogId, game);
  }
  const updates = [...games.values()];
  return { games: updates, unreadGameCount: updates.filter((game) => game.unseenListingKeys.length > 0).length };
}
