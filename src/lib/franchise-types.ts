export type FranchiseStatus = "draft" | "published";
export type SeriesClassification = "franchise" | "series" | "ambiguous";
export type FranchiseConfidence = "high" | "medium" | "low";
export type FranchiseRole = "mainline" | "spin_off" | "side_story" | "crossover";
export type FranchiseMembership = "direct" | "inherited" | "direct_and_inherited";
export type MembershipExclusionEntityType = "series" | "franchise";
export type MembershipExclusionClassification =
  | "false_positive"
  | "historical_branding"
  | "regional_rebranding";

export const ENTITY_TYPES = ["game", "series", "franchise"] as const;
export type RelationshipEntityType = (typeof ENTITY_TYPES)[number];

export const RELATIONSHIP_TYPES = [
  "sequel_to",
  "prequel_to",
  "spin_off_of",
  "remake_of",
  "remaster_of",
  "reboot_of",
  "crossover_with",
  "derived_from",
  "expansion_of",
  "standalone_expansion_of",
  "successor_of",
  "parent_of",
  "subseries_of",
  "compilation_of",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export type FranchiseEntity = {
  id: string;
  slug: string;
  name: string;
  status: FranchiseStatus;
  legacySeriesSlug: string | null;
  description: string | null;
  backgroundImageUrl: string | null;
  backgroundImageOpacity: number | null;
  backgroundReadability: "soft" | "normal" | "strong" | null;
  source: string;
  confidence: FranchiseConfidence;
  reviewedAt: string;
};

export type SeriesClassificationEntry = {
  slug: string;
  name: string;
  classification: SeriesClassification;
  catalogEntryCount: number;
  proposedFranchise: string | null;
  relatedFranchises: string[];
  primaryFranchise: string | null;
  confidence: FranchiseConfidence;
  source: string;
  notes: string;
};

export type SeriesFranchiseRelation = {
  seriesSlug: string;
  franchiseId: string;
  franchiseSlug: string;
  primary: boolean;
  source: string;
  confidence: FranchiseConfidence;
  reviewedAt: string;
};

export type GameFranchiseRelation = {
  /**
   * Compatibility name for migration v1. This is an existing CatalogGame.id
   * (catalog_id for one catalogued edition), never a logical game-work ID.
   */
  gameId: string;
  franchiseId: string;
  franchiseSlug: string;
  primary: boolean;
  membership: FranchiseMembership;
  inheritedFromSeriesSlugs: string[];
  source: string;
  reviewedAt: string;
  role: FranchiseRole | null;
};

export type RelationshipEntityRef = {
  /** `game` identifies one regional catalog entry (`catalog_id`), not a logical game work. */
  type: RelationshipEntityType;
  id: string;
};

export type EntityRelationship = {
  id: string;
  /** When this is `game`, `sourceId` is an existing regional `catalog_id`. */
  sourceType: RelationshipEntityType;
  sourceId: string;
  /** When this is `game`, `targetId` is an existing regional `catalog_id`. */
  targetType: RelationshipEntityType;
  targetId: string;
  relationshipType: RelationshipType;
  source: string;
  confidence: FranchiseConfidence;
  reviewedAt: string;
};

export type MembershipExclusion = {
  catalogId: string;
  entityType: MembershipExclusionEntityType;
  entityId: string;
  entitySlug: string;
  classification: MembershipExclusionClassification;
  confidence: FranchiseConfidence;
  reason: string;
  sourceUrls: string[];
  reviewedAt: string;
};

export type FranchiseEditorialOverride = {
  description: string | null;
  classification: "wrong_entity_content";
  confidence: FranchiseConfidence;
  reason: string;
  sourceUrls: string[];
  reviewedAt: string;
};

export type LegacySeriesRedirect = {
  source: string;
  destination: string;
  permanent: true;
  legacySeriesSlug: string;
  franchiseId: string;
};

export type FranchiseSystemState = {
  franchises: Record<string, FranchiseEntity>;
  seriesFranchiseRelations: SeriesFranchiseRelation[];
  gameFranchiseRelations: GameFranchiseRelation[];
  entityRelationships: EntityRelationship[];
};

export type FranchiseReference = {
  id: string;
  slug: string;
  name: string;
  primary: boolean;
  role: FranchiseRole | null;
  membership: FranchiseMembership;
};
