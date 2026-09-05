import catalogWorkIdentitiesData from "../../data/index/catalog-work-identities.json";

type CatalogWorkIdentityIndex = {
  schemaVersion: 1;
  sourceBatch: string;
  catalogIdToWorkKey: Record<string, string>;
};

const catalogWorkIdentities = catalogWorkIdentitiesData as CatalogWorkIdentityIndex;

/** Identidad editorial explícita; fuera de los lotes auditados cada ficha conserva identidad propia. */
export function getCatalogWorkKey(catalogId: string): string {
  return catalogWorkIdentities.catalogIdToWorkKey[catalogId] ?? `catalog-entry:${catalogId}`;
}
