export type CollectionIdentityFields = {
  catalogId?: string | null;
  physicalVariantId?: string | null;
};

/** Client-safe storage identity. Server adapters backfill legacy variant IDs first. */
export function collectionStorageIdentityKey(item: CollectionIdentityFields): string {
  if (item.physicalVariantId) return `physical:${item.physicalVariantId}`;
  return item.catalogId ? `catalog:${item.catalogId}` : "catalog:none";
}
