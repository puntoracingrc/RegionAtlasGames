import { randomUUID } from "crypto";
import type { CollectionItem } from "./types";

export type WishlistEntry = { catalogId: string; addedAt: string; seenListingKeys?: string[] };

export type WishlistAchievement = {
  id: string;
  createdAt: string;
  games: { catalogId: string; collectionItemId: string; title: string }[];
};

export type CollectionWishlistState = {
  wishlist?: WishlistEntry[];
  wishlistAchievements?: WishlistAchievement[];
};

/** Runs inside the collection transaction, including imports and automatic catalog links. */
export function reconcileCollectionWishlist(
  data: CollectionWishlistState & { items: CollectionItem[] },
): boolean {
  if (!data.wishlist?.length && !data.wishlistAchievements?.length) return false;
  const owned = new Map(data.items.filter((item) => item.catalogId).map((item) => [item.catalogId!, item]));
  const copyIds = new Set(data.items.map((item) => item.id));
  let changed = false;
  if (data.wishlistAchievements?.length) {
    data.wishlistAchievements = data.wishlistAchievements.flatMap((entry) => {
      const games = entry.games.flatMap((game) => {
        const item = owned.get(game.catalogId);
        if (!item) { changed = true; return []; }
        if (copyIds.has(game.collectionItemId)) return [game];
        changed = true;
        return [{ ...game, collectionItemId: item.id }];
      });
      return games.length ? [{ ...entry, games }] : [];
    });
  }
  const achieved = (data.wishlist ?? []).filter((wish) => owned.has(wish.catalogId));
  if (!achieved.length) return changed;

  data.wishlist = data.wishlist!.filter((wish) => !owned.has(wish.catalogId));
  data.wishlistAchievements = [
    ...(data.wishlistAchievements ?? []),
    {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      games: achieved.map((wish) => {
        const item = owned.get(wish.catalogId)!;
        return { catalogId: wish.catalogId, collectionItemId: item.id, title: item.title };
      }),
    },
  ].slice(-100);
  return true;
}
