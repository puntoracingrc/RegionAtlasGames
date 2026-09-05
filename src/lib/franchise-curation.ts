import editorialOverridesData from "../../data/franchise-system/editorial-overrides.json";
import membershipExclusionsData from "../../data/franchise-system/membership-exclusions.json";
import type {
  FranchiseEditorialOverride,
  MembershipExclusion,
  MembershipExclusionEntityType,
} from "./franchise-types";

type MembershipExclusionFile = {
  schemaVersion: number;
  reviewBatch: string;
  exclusions: MembershipExclusion[];
};

type EditorialOverrideFile = {
  schemaVersion: number;
  reviewBatch: string;
  franchises: Record<string, FranchiseEditorialOverride>;
};

const membershipFile = membershipExclusionsData as MembershipExclusionFile;
const editorialFile = editorialOverridesData as EditorialOverrideFile;
const exclusions = membershipFile.exclusions;
const exclusionByKey = new Map(
  exclusions.map((entry) => [
    `${entry.catalogId}\0${entry.entityType}\0${entry.entityId}`,
    entry,
  ]),
);

export function getMembershipExclusions(): MembershipExclusion[] {
  return exclusions.map((entry) => ({ ...entry, sourceUrls: [...entry.sourceUrls] }));
}

export function getMembershipExclusion(
  catalogId: string,
  entityType: MembershipExclusionEntityType,
  entityId: string,
): MembershipExclusion | undefined {
  return exclusionByKey.get(`${catalogId}\0${entityType}\0${entityId}`);
}

export function filterEffectiveSeriesCatalogIds(seriesSlug: string, catalogIds: string[]): string[] {
  return catalogIds.filter((catalogId) => !getMembershipExclusion(catalogId, "series", seriesSlug));
}

export function getFranchiseEditorialOverride(
  franchiseSlug: string,
): FranchiseEditorialOverride | undefined {
  const override = editorialFile.franchises[franchiseSlug];
  return override ? { ...override, sourceUrls: [...override.sourceUrls] } : undefined;
}

export function getFranchiseEditorialOverrides(): Record<string, FranchiseEditorialOverride> {
  return Object.fromEntries(
    Object.entries(editorialFile.franchises).map(([slug, entry]) => [
      slug,
      { ...entry, sourceUrls: [...entry.sourceUrls] },
    ]),
  );
}

export function getFranchiseCurationMetadata() {
  return {
    membershipReviewBatch: membershipFile.reviewBatch,
    editorialReviewBatch: editorialFile.reviewBatch,
  };
}
