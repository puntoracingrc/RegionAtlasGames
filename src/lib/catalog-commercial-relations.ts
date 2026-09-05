import commercialRelationsData from "../../data/index/catalog-commercial-relations.json";

export type CatalogCommercialRelationProvenance = {
  source: "research";
  evidenceUrls: string[];
  evidenceSummary: string;
  reviewedAt: string;
  reviewBatch: string;
};

export type CatalogCompilationComponent = {
  position: number;
  title: string;
  developerCredit: string;
  publisherCredit: string;
  notes: string;
  catalogId: string | null;
  provenance: CatalogCommercialRelationProvenance;
};

export type CatalogCompilation = {
  id: string;
  catalogId: string | null;
  title: string;
  status: "verified" | "requires_review";
  componentCount: number;
  components: CatalogCompilationComponent[];
  provenance: CatalogCommercialRelationProvenance;
};

export type CatalogVariantRelationshipType =
  | "edition_of"
  | "bundle_variant_of"
  | "sibling_edition_of"
  | "same_product_candidate";

export type CatalogVariantRelation = {
  variantCatalogId: string;
  canonicalCatalogId: string;
  relationshipType: CatalogVariantRelationshipType;
  status: "verified" | "requires_review";
  provenance: CatalogCommercialRelationProvenance;
};

type CatalogCommercialRelationIndex = {
  schemaVersion: 1;
  batchId: string;
  reviewedAt: string;
  compilations: CatalogCompilation[];
  variants: CatalogVariantRelation[];
};

const index = commercialRelationsData as CatalogCommercialRelationIndex;
const verifiedCompilationsByCatalogId = new Map(
  index.compilations
    .filter(
      (compilation): compilation is CatalogCompilation & { catalogId: string } =>
        compilation.status === "verified" && Boolean(compilation.catalogId),
    )
    .map((compilation) => [compilation.catalogId, compilation]),
);
const verifiedVariantsByCatalogId = new Map(
  index.variants
    .filter((relation) => relation.status === "verified")
    .map((relation) => [relation.variantCatalogId, relation]),
);
const verifiedVariantsByCanonicalId = new Map<string, CatalogVariantRelation[]>();

for (const relation of verifiedVariantsByCatalogId.values()) {
  const relations = verifiedVariantsByCanonicalId.get(relation.canonicalCatalogId) ?? [];
  relations.push(relation);
  verifiedVariantsByCanonicalId.set(relation.canonicalCatalogId, relations);
}

export function getVerifiedCatalogCompilation(
  catalogId: string,
): CatalogCompilation | undefined {
  return verifiedCompilationsByCatalogId.get(catalogId);
}

export function getVerifiedCatalogVariant(
  catalogId: string,
): CatalogVariantRelation | undefined {
  return verifiedVariantsByCatalogId.get(catalogId);
}

export function getVerifiedCatalogVariants(
  canonicalCatalogId: string,
): CatalogVariantRelation[] {
  return verifiedVariantsByCanonicalId.get(canonicalCatalogId) ?? [];
}

export function resolveVerifiedCommercialCanonicalCatalogId(catalogId: string): string {
  const visited = new Set<string>();
  let current = catalogId;

  while (!visited.has(current)) {
    visited.add(current);
    const relation = verifiedVariantsByCatalogId.get(current);
    if (!relation) return current;
    current = relation.canonicalCatalogId;
  }

  return catalogId;
}
