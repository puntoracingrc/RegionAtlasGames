import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { collectionPhysicalIdentityKey, resolveCatalogPhysicalVariant } from "./catalog-physical-variant";
import { loadUserCollection, mutateUserCollection } from "./collection-storage";
import { wishlistIdentityKey, type WishlistAchievement, type WishlistEntry } from "./wishlist-model";

export async function readUserWishlist(userId: string) {
  const file = await loadUserCollection(userId);
  return { wishlist: file.wishlist ?? [], achievements: file.wishlistAchievements ?? [] };
}

type WishlistResult =
  | { wished: boolean; wishlist: WishlistEntry[] }
  | { error: string; status: number };

export async function setCatalogGameWished(
  userId: string,
  catalogId: string,
  wished: boolean,
  physicalVariantId?: string,
): Promise<WishlistResult> {
  const game = getCatalogGame(catalogId);
  if (wished && (!game || !isPublicCatalogGame(game))) {
    return { error: "Juego no encontrado en el catálogo.", status: 404 };
  }
  const canonicalId = game?.id ?? catalogId;
  if (physicalVariantId && !resolveCatalogPhysicalVariant(canonicalId, physicalVariantId)) {
    return { error: "La edición física no corresponde a esta ficha.", status: 400 };
  }
  const requested = {
    catalogId: canonicalId,
    ...(physicalVariantId ? { physicalVariantId } : {}),
  };
  const requestedIdentity = wishlistIdentityKey(requested);
  return mutateUserCollection<WishlistResult>(userId, (file) => {
    const wishlist = file.wishlist ?? [];
    if (wished && file.items.some((item) => collectionPhysicalIdentityKey(item) === requestedIdentity)) {
      return { next: file, changed: false, result: { error: "Esta edición ya está en tu colección.", status: 409 } };
    }
    const exists = wishlist.some((entry) => wishlistIdentityKey(entry) === requestedIdentity);
    if (exists === wished) return { next: file, changed: false, result: { wished, wishlist } };
    if (wished && wishlist.length >= 10_000) {
      return { next: file, changed: false, result: { error: "Tu lista ha alcanzado el límite de 10.000 juegos.", status: 400 } };
    }
    file.wishlist = wished
      ? [...wishlist, { ...requested, addedAt: new Date().toISOString() }]
      : wishlist.filter((entry) => wishlistIdentityKey(entry) !== requestedIdentity);
    return { next: file, result: { wished, wishlist: file.wishlist } };
  });
}

export async function acknowledgeWishlistAchievements(userId: string, ids: string[]): Promise<WishlistAchievement[]> {
  const acknowledged = new Set(ids);
  return mutateUserCollection(userId, (file) => {
    const previous = file.wishlistAchievements ?? [];
    const remaining = previous.filter((entry) => !acknowledged.has(entry.id));
    file.wishlistAchievements = remaining;
    return { next: file, result: remaining, changed: previous.length !== remaining.length };
  });
}
