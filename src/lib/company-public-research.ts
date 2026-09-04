import publicResearchData from "../../data/research/company-study/public.json";
import type {
  CompanyResearchAchievement,
  CompanyResearchPublicData,
  CompanyResearchPublicProfile,
  CompanyResearchPublicSource,
} from "./company-research-types";
import type { CompanyProfile, CompanyProfileSources } from "./types";

const publicData = publicResearchData as CompanyResearchPublicData;
const profiles = new Map(publicData.profiles.map((profile) => [profile.slug, profile]));
const sources = new Map(publicData.sources.map((source) => [source.id, source]));

function sourceForId(sourceId: string): CompanyResearchPublicSource | undefined {
  const source = sources.get(sourceId);
  if (!source) return undefined;
  return {
    id: source.id,
    url: source.url,
    title: source.title,
    verifiedPrimary: source.verifiedPrimary,
    reliability: source.reliability,
  };
}

function applyIdentityCorrection(
  profile: CompanyProfile,
  research: CompanyResearchPublicProfile,
): CompanyProfile {
  const correction = research.identityCorrection;
  if (!correction) return profile;
  if (
    profile.wikidataId != null &&
    profile.wikidataId !== correction.previousValue &&
    profile.wikidataId !== correction.value
  ) {
    return profile;
  }

  const identitySource = sourceForId(correction.sourceId);
  const nextSources: CompanyProfileSources = correction.replaceLegacyIdentitySources
    ? {}
    : { ...(profile.sources ?? {}) };
  if (identitySource) {
    nextSources.wikidata = {
      wikidataId: correction.value,
      fetchedAt: research.reviewedAt,
      url: identitySource.url,
    };
  }
  return {
    ...profile,
    wikidataId: correction.value,
    sources: nextSources,
  };
}

export function applyPublicCompanyResearch(
  profile: CompanyProfile | undefined,
  slug: string,
): CompanyProfile | undefined {
  const research = profiles.get(slug);
  if (!profile || !research || research.publicationStatus !== "published") return profile;

  let next = applyIdentityCorrection(profile, research);
  if (!research.history) return next;

  const historySource = research.history.sourceIds
    .map(sourceForId)
    .find((source) => source?.verifiedPrimary);
  const currentGenerated = next.method === "template" || next.method === "wikidata";
  next = {
    ...next,
    history: research.history.textEs,
    method: research.history.method,
    generatedAt: research.reviewedAt,
    seoMeta: currentGenerated ? null : next.seoMeta,
    sources: {
      ...(next.sources ?? {}),
      ...(historySource
        ? {
            officialWebsite: {
              url: historySource.url,
              fetchedAt: research.reviewedAt,
            },
          }
        : {}),
    },
  };
  return next;
}

export function getPublicCompanyResearchSources(
  slug: string,
): CompanyResearchPublicSource[] {
  const research = profiles.get(slug);
  if (!research || research.publicationStatus !== "published") return [];
  return research.sourceIds
    .map(sourceForId)
    .filter((source): source is CompanyResearchPublicSource => Boolean(source));
}

export function getPublicCompanyAchievements(slug: string): CompanyResearchAchievement[] {
  return publicData.achievements.filter(
    (achievement) =>
      achievement.companySlug === slug && achievement.publicationStatus === "published",
  );
}

export function getPublicCompanyResearchProfileSlugs(): string[] {
  return [...profiles.keys()].sort();
}
