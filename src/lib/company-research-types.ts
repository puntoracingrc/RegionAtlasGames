import type {
  ResearchConfidence,
  ResearchFieldProvenance,
  ResearchPublicationStatus,
  ResearchSource,
} from "./research-types";

export type CompanyResearchCore = {
  slug: string;
  researchConfidence: ResearchConfidence;
  researchRequiresReview: false;
  researchLastChecked: string;
  wikidataId: string;
  foundedYear?: number;
  closedYear?: number;
  countries?: string[];
  status?: "active" | "defunct" | "subsidiary" | "unknown";
  currentStructureYear?: number;
  dateContextEs?: string;
  industryImpactEs?: string;
  provenanceIds: string[];
  visibility: "admin_only";
};

export type CompanyResearchBlockedRecord = {
  slug: string;
  name: string;
  qid: string | null;
  confidence: ResearchConfidence | string;
  identityStatus: string;
  entityKind: string;
  reasons: string[];
  visibility: "blocked";
};

export type CompanyResearchEditorial = {
  slug: string;
  historyEs: string;
  industryImpactEs: string;
  publicationStatus: "draft" | "published";
  historyEvidenceReady: boolean;
  impactEvidenceReady: boolean;
  sourceIds: string[];
};

export type CompanyResearchAchievement = {
  id: string;
  companySlug: string;
  type: string;
  title: string;
  summaryEs: string;
  yearLabel: string | null;
  relatedGamesOrSeries: string[];
  confidence: ResearchConfidence;
  sourceId: string;
  publicationStatus: "published";
};

export type CompanyResearchPublicProfile = {
  slug: string;
  publicationStatus: "published";
  reviewedAt: string;
  sourceIds: string[];
  identityCorrection?: {
    field: "wikidataId";
    previousValue: string;
    value: string;
    sourceId: string;
    replaceLegacyIdentitySources: boolean;
  };
  history?: {
    textEs: string;
    method: "research";
    sourceIds: string[];
  };
};

export type CompanyResearchPublicData = {
  version: number;
  profiles: CompanyResearchPublicProfile[];
  achievements: CompanyResearchAchievement[];
  sources: ResearchSource[];
};

export type CompanyResearchManifest = {
  version: number;
  generatedAt: string;
  baseCommit: string;
  counts: {
    totalCompanies: number;
    internalCore: number;
    blocked: number;
    publishedHistories: number;
    publishedAchievements: number;
    publishedQidCorrections: number;
    qidCollisionGroups: number;
    qidCollisionSlugs: number;
    blockedIndividuals: number;
    blockedCompositeProfiles: number;
    publishedRelationships: number;
  };
  protectedFileHashes: Record<string, string>;
};

export type CompanyResearchAdminRecord = {
  slug: string;
  name: string;
  gate: "accepted" | "blocked";
  qid: string | null;
  confidence: string;
  status: string | null;
  foundedYear: number | null;
  closedYear: number | null;
  countries: string[];
  provenanceCount: number;
  reasons: string[];
  publicChanges: string[];
};

export type CompanyResearchAdminOverview = {
  manifest: CompanyResearchManifest;
  records: CompanyResearchAdminRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filter: "all" | "accepted" | "blocked" | "published" | "qid-collision";
  query: string;
  relationshipExclusions: {
    companySlug: string;
    reason: string;
    sourceId: string;
    sourceUrl: string | null;
  }[];
};

export type CompanyResearchDataFiles = {
  core: { version: number; records: CompanyResearchCore[] };
  provenance: { version: number; records: ResearchFieldProvenance[] };
  sources: { version: number; records: ResearchSource[] };
  editorial: { version: number; records: CompanyResearchEditorial[] };
};

export type CompanyResearchPublicSource = Pick<
  ResearchSource,
  "id" | "url" | "title" | "verifiedPrimary" | "reliability"
>;

export type CompanyResearchPublication = {
  status: ResearchPublicationStatus;
};
