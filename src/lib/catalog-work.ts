import catalogWorkIdentitiesData from "../../data/index/catalog-work-identities.json";
import { resolveVerifiedCommercialCanonicalCatalogId } from "./catalog-commercial-relations";
import { getCatalogRedirectTargetIdForCatalogId } from "./catalog-route-redirects";

type CatalogWorkIdentityIndex = {
  schemaVersion: 1;
  sourceBatch: string;
  catalogIdToWorkKey: Record<string, string>;
};

const catalogWorkIdentities = catalogWorkIdentitiesData as CatalogWorkIdentityIndex;

/** Identidad editorial explícita; fuera de los lotes auditados cada ficha conserva identidad propia. */
export function getCatalogWorkKey(catalogId: string): string {
  const redirectedCatalogId = getCatalogRedirectTargetIdForCatalogId(catalogId) ?? catalogId;
  const canonicalCatalogId = resolveVerifiedCommercialCanonicalCatalogId(redirectedCatalogId);
  return (
    catalogWorkIdentities.catalogIdToWorkKey[canonicalCatalogId] ??
    `catalog-entry:${canonicalCatalogId}`
  );
}
