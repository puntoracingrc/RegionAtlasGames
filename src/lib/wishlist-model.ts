import { randomUUID } from "crypto";
import { canonicalCatalogLink } from "./catalog-id-aliases";
import { collectionPhysicalIdentityKey } from "./catalog-physical-variant";
import type { CollectionItem } from "./types";

export type WishlistEntry = {
  catalogId: string;
  physicalVariantId?: string;
  addedAt: string;
  seenListingKeys?: string[];
};

export type WishlistAchievement = {
  id: string;
  createdAt: string;
  games: {
    catalogId: string;
    physicalVariantId?: string;
    collectionItemId: string;
    title: string;
  }[];
};

export type CollectionWishlistState = {
  wishlist?: WishlistEntry[];
  wishlistAchievements?: WishlistAchievement[];
};

export function wishlistIdentityKey(
  entry: Pick<WishlistEntry, "catalogId" | "physicalVariantId">,
): string {
  return collectionPhysicalIdentityKey(entry);
}

/** Runs inside the collection transaction, including imports and automatic catalog links. */
export function reconcileCollectionWishlist(
  data: CollectionWishlistState & { items: CollectionItem[] },
): boolean {
  if (!data.wishlist?.length && !data.wishlistAchievements?.length) return false;
  let changed = false;
  const wishes = new Map<string, WishlistEntry>();
  for (const previous of data.wishlist ?? []) {
    const wish = canonicalCatalogLink(previous);
    if (wish !== previous) changed = true;
    const identityKey = wishlistIdentityKey(wish);
    const existing = wishes.get(identityKey);
    if (existing) {
      changed = true;
      wishes.set(identityKey, {
        ...existing,
        addedAt: existing.addedAt < wish.addedAt ? existing.addedAt : wish.addedAt,
        seenListingKeys: [...new Set([...(existing.seenListingKeys ?? []), ...(wish.seenListingKeys ?? [])])],
      });
    } else wishes.set(identityKey, wish);
  }
  if (changed) data.wishlist = [...wishes.values()];
  for (const achievement of data.wishlistAchievements ?? []) {
    achievement.games = achievement.games.map(game => {
      const canonical = canonicalCatalogLink(game);
      if (canonical !== game) changed = true;
      return canonical;
    });
  }
  const owned = new Map(
    data.items
      .filter((item) => item.catalogId)
      .map((item) => [collectionPhysicalIdentityKey(item), item]),
  );
  const copyIds = new Set(data.items.map((item) => item.id));
  if (data.wishlistAchievements?.length) {
    data.wishlistAchievements = data.wishlistAchievements.flatMap((entry) => {
      const games = entry.games.flatMap((game) => {
        const item = owned.get(wishlistIdentityKey(game));
        if (!item) { changed = true; return []; }
        if (copyIds.has(game.collectionItemId)) return [game];
        changed = true;
        return [{ ...game, collectionItemId: item.id }];
      });
      return games.length ? [{ ...entry, games }] : [];
    });
  }
  const achieved = (data.wishlist ?? []).filter((wish) => owned.has(wishlistIdentityKey(wish)));
  if (!achieved.length) return changed;

  data.wishlist = data.wishlist!.filter((wish) => !owned.has(wishlistIdentityKey(wish)));
  data.wishlistAchievements = [
    ...(data.wishlistAchievements ?? []),
    {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      games: achieved.map((wish) => {
        const item = owned.get(wishlistIdentityKey(wish))!;
        return {
          catalogId: wish.catalogId,
          ...(wish.physicalVariantId ? { physicalVariantId: wish.physicalVariantId } : {}),
          collectionItemId: item.id,
          title: item.title,
        };
      }),
    },
  ].slice(-100);
  return true;
}
