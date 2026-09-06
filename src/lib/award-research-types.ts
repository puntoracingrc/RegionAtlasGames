export type AwardResultType = "winner" | "nominee" | "finalist" | "honorable_mention" | "recipient" | "special_recognition";
export type AwardPrestigeGroup = "major_global" | "major_regional" | "major_specialist" | "major_personal" | "category_award" | "other";
export type AwardEditionStatus = "upcoming" | "nominations_announced" | "voting_open" | "ceremony_in_progress" | "completed" | "corrected";
export type AwardCategoryType = "top_game" | "game_direction" | "game_design" | "narrative" | "art" | "audio" | "music" | "performance" | "technical" | "genre" | "platform" | "indie" | "debut" | "multiplayer" | "audience" | "studio" | "career" | "hall_of_fame" | "innovation" | "special" | "other";
export type AwardSource = {
  id: string; url: string; title: string; retrievedAt: string;
  verifiedPrimary: boolean; evidenceSummary: string;
};
export type AwardSeries = {
  id: string; slug: string; canonicalName: string; shortName: string | null;
  organizer: string | null; foundedYear: number | null; scope: string | null;
  officialUrl: string; descriptionEs: string | null; selectionModel: string | null;
  specialization: string | null; active: boolean; sourceIds: string[];
};
export type AwardEdition = {
  id: string; seriesSlug: string; editionYear: number; editionNumber: number | null;
  ceremonyDate: string | null; eligibilityPeriod: string | null; venue: string | null;
  city: string | null; status: AwardEditionStatus; officialUrl: string | null; sourceIds: string[];
};
export type AwardCategory = {
  id: string; seriesSlug: string; slug: string; canonicalName: string; displayName: string;
  categoryType: AwardCategoryType; prestigeGroup: AwardPrestigeGroup;
  activeFrom: number | null; activeTo: number | null; previousNames: string[];
  successorCategoryId: string | null; sourceIds: string[];
};
export type AwardRecipientRef =
  // An official recipient can exist without a verified physical catalog identity.
  | { type: "game"; workKey: string | null; displayName: string; workQid?: string | null }
  | { type: "person"; personSlug: string | null; displayName: string; personQid?: string | null }
  | { type: "company"; companySlug: string | null; displayName: string }
  | { type: "team" | "other"; key: string; displayName: string };
export type AwardResult = {
  id: string; editionId: string; seriesSlug: string; categoryId: string;
  resultType: AwardResultType; officialLabel: string | null; shared: boolean;
  recipients: AwardRecipientRef[]; sourceIds: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  verificationStatus: "VERIFIED" | "NEEDS_REVIEW";
  publicationStatus: "published" | "internal";
};
export type AwardWorkLink = {
  id: string; workKey: string; displayName: string; catalogIdsVerified: string[];
  sourceIds: string[]; verificationStatus: "VERIFIED" | "NEEDS_REVIEW";
};
export type AwardPersonWorkLink = {
  id: string; personWorkId: string; catalogWorkKey: string;
  sourceIds: string[]; verificationStatus: "VERIFIED" | "NEEDS_REVIEW";
};
export type AwardCompanyWorkLink = {
  id: string; companySlug: string; workKey: string; role: "developer" | "publisher";
  catalogId: string; sourceIds: string[]; verificationStatus: "VERIFIED" | "NEEDS_REVIEW";
};
export type AwardLegacyLink = {
  id: string; legacyAwardId: string;
  classification: "FORMAL_AWARD_LINKED" | "GENERAL_RECOGNITION" | "NEEDS_REVIEW";
  resultId: string | null;
};
export type AwardResearchData = {
  version: 1; reviewedAt: string; series: AwardSeries[]; editions: AwardEdition[];
  categories: AwardCategory[]; results: AwardResult[]; workLinks: AwardWorkLink[];
  personWorkLinks: AwardPersonWorkLink[]; companyWorkLinks: AwardCompanyWorkLink[];
  legacyLinks: AwardLegacyLink[]; sources: AwardSource[];
};
export type AwardPublicResult = Omit<AwardResult, "confidence" | "verificationStatus" | "publicationStatus">;
export type AwardPublicData = {
  version: 1; generatedAt: string; series: AwardSeries[]; editions: AwardEdition[];
  categories: AwardCategory[]; results: AwardPublicResult[]; sources: AwardSource[];
  workLinks: Omit<AwardWorkLink, "verificationStatus">[];
  personWorkLinks: { id: string; personWorkId: string; personSlug: string; workKey: string; role: string; sourceIds: string[] }[];
  companyWorkLinks: Omit<AwardCompanyWorkLink, "verificationStatus">[];
  legacyLinks: AwardLegacyLink[];
};
