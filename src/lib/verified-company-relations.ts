import companyRelationsData from "../../data/index/verified-company-relations.json";
import type { GameDetailsFieldProvenance } from "./types";

export type VerifiedCompanyRelationshipType =
  | "studio_of"
  | "regional_entity_of"
  | "publishing_division_of"
  | "owned_by";

export type VerifiedCompanyRelation = {
  id: string;
  sourceCompanySlug: string;
  targetCompanySlug: string;
  relationshipType: VerifiedCompanyRelationshipType;
  provenance: GameDetailsFieldProvenance;
};

export type VerifiedCompanyRelationDirection = "source" | "target";

type VerifiedCompanyRelationIndex = {
  schemaVersion: 1;
  batchId: string;
  relationships: VerifiedCompanyRelation[];
};

const index = companyRelationsData as VerifiedCompanyRelationIndex;

export function getVerifiedCompanyRelations(
  companySlug: string,
): Array<VerifiedCompanyRelation & { direction: VerifiedCompanyRelationDirection }> {
  const matches: Array<
    VerifiedCompanyRelation & { direction: VerifiedCompanyRelationDirection }
  > = [];
  for (const relationship of index.relationships) {
    if (relationship.sourceCompanySlug === companySlug) {
      matches.push({ ...relationship, direction: "source" });
    }
    if (relationship.targetCompanySlug === companySlug) {
      matches.push({ ...relationship, direction: "target" });
    }
  }
  return matches;
}

export function verifiedCompanyRelationLabel(
  relationshipType: VerifiedCompanyRelationshipType,
  direction: VerifiedCompanyRelationDirection,
): string {
  const labels: Record<
    VerifiedCompanyRelationshipType,
    Record<VerifiedCompanyRelationDirection, string>
  > = {
    studio_of: { source: "Estudio de", target: "Estudio perteneciente" },
    regional_entity_of: { source: "Entidad regional de", target: "Entidad regional" },
    publishing_division_of: { source: "División editorial de", target: "División editorial" },
    owned_by: { source: "Pertenece a", target: "Propietaria de" },
  };
  return labels[relationshipType][direction];
}
