import { loadUserCollection, mutateUserCollection } from "./collection-storage";
import { getActiveMarketplaceListings } from "./listings";
import type { WishlistEntry } from "./wishlist-model";
import { wishlistIdentityKey } from "./wishlist-model";
import { buildWishlistSales } from "./wishlist-sales";

export type WishlistSeenView = {
  catalogId: string;
  physicalVariantId?: string;
  listingKeys: string[];
};

export async function readWishlistSales(userId: string, wishes?: WishlistEntry[]) {
  const wishlist = wishes ?? (await loadUserCollection(userId)).wishlist ?? [];
  if (!wishlist.length) return { games: [], unreadGameCount: 0 };
  return buildWishlistSales(userId, wishlist, await getActiveMarketplaceListings());
}

export async function markWishlistSalesSeen(userId: string, views: WishlistSeenView[]) {
  const listings = await getActiveMarketplaceListings();
  return mutateUserCollection(userId, (file) => {
    const wishlist = file.wishlist ?? [];
    const sales = buildWishlistSales(userId, wishlist, listings);
    const visible = new Map(sales.games.map((game) => [wishlistIdentityKey(game), new Set(game.unseenListingKeys)]));
    const requested = new Map(views.map((view) => [wishlistIdentityKey(view), view.listingKeys]));
    let changed = false;
    for (const wish of wishlist) {
      const identityKey = wishlistIdentityKey(wish);
      const keys = (requested.get(identityKey) ?? []).filter((key) => visible.get(identityKey)?.has(key));
      if (!keys.length) continue;
      changed = true;
      wish.seenListingKeys = [...new Set([...(wish.seenListingKeys ?? []), ...keys])];
    }
    return { next: file, changed, result: buildWishlistSales(userId, wishlist, listings) };
  });
}
