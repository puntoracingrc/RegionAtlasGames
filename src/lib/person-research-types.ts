import type { ResearchConfidence } from "./research-types";

export type PersonPublicationLevel = "editorial" | "structured";

export type PersonResearchTerm = {
  qid: string;
  name: string;
  source_urls?: string[];
};

export type PersonPortrait = {
  path: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  artist: string | null;
  credit: string | null;
  attributionRequired: boolean;
  sourceId: string;
};

export type PersonPublicProfile = {
  slug: string;
  name: string;
  qid: string;
  publicationLevel: PersonPublicationLevel;
  aliases: string[];
  nativeNames: string[];
  birthDate: string | null;
  birthYear: number | null;
  birthPrecision: string | null;
  deathDate: string | null;
  deathYear: number | null;
  deathPrecision: string | null;
  lifeStatus: string;
  birthPlace: PersonResearchTerm | null;
  citizenships: PersonResearchTerm[];
  originDisplay: string | null;
  occupations: PersonResearchTerm[];
  fieldsOfWork: PersonResearchTerm[];
  education: PersonResearchTerm[];
  careerStart: string | null;
  careerEnd: string | null;
  officialWebsites: string[];
  biographyEs: string;
  careerSummaryEs: string | null;
  industryImpactEs: string | null;
  publicReceptionEs: string | null;
  portrait: PersonPortrait | null;
  sourceIds: string[];
  lastChecked: string;
};

export type PersonCompanyRelation = {
  id: string;
  personSlug: string;
  companySlug: string;
  companyName: string;
  role: string;
  roleLabelEs: string;
  start: string | null;
  end: string | null;
  pointInTime: string | null;
  confidence: ResearchConfidence;
  sourceId: string;
};

export type PersonWork = {
  id: string;
  personSlug: string;
  workQid: string | null;
  title: string;
  year: string | number | null;
  role: string;
  confidence: ResearchConfidence;
  sourceId: string;
};

export type PersonAward = {
  id: string;
  personSlug: string;
  name: string;
  date: string | number | null;
  confidence: ResearchConfidence;
  sourceId: string;
};

export type PersonPosition = {
  id: string;
  personSlug: string;
  name: string;
  start: string | null;
  end: string | null;
  pointInTime: string | null;
  confidence: ResearchConfidence;
  sourceId: string;
};

export type PersonCuriosity = {
  id: string;
  personSlug: string;
  summaryEs: string;
  confidence: ResearchConfidence;
  sourceId: string;
};

export type PersonPublicSource = {
  id: string;
  url: string;
  title: string;
  kind: string;
  reliability: string;
  language: string | null;
  retrievedAt: string | null;
  verifiedPrimary: boolean;
};

export type PersonPublicData = {
  version: number;
  generatedAt: string;
  profiles: PersonPublicProfile[];
  companyRelations: PersonCompanyRelation[];
  positions: PersonPosition[];
  exactCredits: PersonWork[];
  relatedWorks: PersonWork[];
  awards: PersonAward[];
  curiosities: PersonCuriosity[];
  sources: PersonPublicSource[];
};

export type PersonExpertise =
  | "design"
  | "programming"
  | "direction"
  | "production"
  | "music"
  | "art"
  | "founder"
  | "executive";

export type PersonCardData = {
  slug: string;
  name: string;
  publicationLevel: PersonPublicationLevel;
  portraitPath: string | null;
  lifeLabel: string | null;
  origin: string | null;
  occupations: string[];
  companies: { slug: string; name: string }[];
  works: string[];
  expertise: PersonExpertise[];
  searchHaystack: string;
};

export type PersonTimelineItem = {
  id: string;
  dateLabel: string;
  sortYear: number | null;
  title: string;
  detail: string | null;
  kind: "life" | "company" | "position" | "work" | "award";
  sourceId: string | null;
};

export type PersonPublicView = {
  profile: PersonPublicProfile;
  companyRelations: PersonCompanyRelation[];
  positions: PersonPosition[];
  exactCredits: PersonWork[];
  relatedWorks: PersonWork[];
  awards: PersonAward[];
  curiosities: PersonCuriosity[];
  sources: PersonPublicSource[];
  timeline: PersonTimelineItem[];
};

export type CompanyPersonLink = {
  slug: string;
  name: string;
  portraitPath: string | null;
  roles: string[];
  periods: string[];
};

export type PersonResearchManifest = {
  version: number;
  generatedAt: string;
  sourcePackage: string;
  counts: {
    totalPeople: number;
    publishedPeople: number;
    editorialPeople: number;
    structuredPeople: number;
    stagingPeople: number;
    publicPortraits: number;
    publicCompanyRelations: number;
    publicExactCredits: number;
    publicContextualWorks: number;
    publicAwards: number;
    publicPositions: number;
    publicCuriosities: number;
    unresolvedMentions: number;
    internalSources: number;
    internalProvenanceRows: number;
  };
  policies: {
    identityKey: "qid";
    routeKey: "slug";
    automaticMergeAllowed: false;
    stagingIsPublic: false;
    contextualWorkIsExactCredit: false;
    portraitHotlinkingAllowed: false;
  };
  protectedFileHashes: Record<string, string>;
  portraitHashes: Record<string, string>;
};

export type PersonAdminRecord = {
  slug: string;
  name: string;
  qid: string;
  gate: "editorial" | "structured" | "staging";
  confidence: string;
  birthYear: number | null;
  origin: string | null;
  occupations: string[];
  reasons: string[];
  relations: number;
  exactCredits: number;
  sources: number;
  portrait: boolean;
};

export type PersonAdminFilter = "all" | "published" | "editorial" | "structured" | "staging";

export type PersonAdminOverview = {
  manifest: PersonResearchManifest;
  records: PersonAdminRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filter: PersonAdminFilter;
  query: string;
};
