import { normalizeImportedPlatformSlug } from "./collection-platform-slugs";
import { enrichCollectionGapItem } from "./collection-gap";
import { readUserCollection } from "./collection-store";
import { outOfScopeCollectionItems, pendingCatalogItems } from "./import-collection";
import type { CollectionView } from "./types";

export type GapPageVariant = "pending" | "outOfScope";

export async function loadGapPlatformItems(
  userId: string,
  variant: GapPageVariant,
  platformSlug: string,
): Promise<{ items: CollectionView[]; normalizedSlug: string }> {
  const file = await readUserCollection(userId);
  const normalizedSlug = normalizeImportedPlatformSlug(platformSlug);
  const source =
    variant === "pending"
      ? pendingCatalogItems(file.items)
      : outOfScopeCollectionItems(file.items);

  const items = source
    .filter((item) => normalizeImportedPlatformSlug(item.platformSlug) === normalizedSlug)
    .map(enrichCollectionGapItem);

  return { items, normalizedSlug };
}
