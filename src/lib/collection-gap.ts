import { enrichCollectionItem } from "./catalog";
import { findAvailableCatalogLink } from "./import-collection";
import type { CollectionItem, CollectionView } from "./types";

export function enrichCollectionGapItem(item: CollectionItem): CollectionView {
  const view = enrichCollectionItem(item);
  if (item.catalogMatched && item.catalogId) {
    return { ...view, availableCatalogId: null };
  }
  const match = findAvailableCatalogLink(item);
  return {
    ...view,
    availableCatalogId: match?.id ?? null,
    coverUrl: match?.coverUrl ?? view.coverUrl,
    titlePc: match?.titlePc ?? view.titlePc,
    pcId: match?.pcId ?? view.pcId,
  };
}

export function countLinkableGapItems(items: CollectionView[]): number {
  return items.filter((item) => Boolean(item.availableCatalogId)).length;
}
