export type ResearchPriority = "P0" | "P1" | "P2";

export type ResearchSubjectKind =
  | "catalog-entry"
  | "physical-edition"
  | "bonus-item"
  | "related-release";

export type ResearchClaimField =
  | "physicalExistence"
  | "physicalContentStatus"
  | "releaseStatus"
  | "platform"
  | "edition"
  | "barcode"
  | "productCode"
  | "market"
  | "packagingLanguages"
  | "softwareLanguages"
  | "contents";

export type ResearchEvidenceKind =
  | "OWN_SCAN"
  | "PHYSICAL_SCAN"
  | "PUBLISHER"
  | "PLATFORM_HOLDER"
  | "TECHNICAL_DATABASE"
  | "RETAILER"
  | "COLLECTOR_DATABASE"
  | "MARKETPLACE"
  | "SEARCH_RESULT"
  | "UNKNOWN";

export type ResearchRiskCode =
  | "PLATFORM_IDENTIFIER_CONFLICT"
  | "PHYSICAL_STATUS_CONFLICT"
  | "CANCELED_RELEASE_COUNTED_AS_PHYSICAL"
  | "DOWNLOAD_CODE_COUNTED_AS_DISC"
  | "STEELBOOK_WITHOUT_GAME_COUNTED_AS_EDITION"
  | "MISSING_BARCODE"
  | "MISSING_MARKET_MAPPING"
  | "GENERIC_REGION"
  | "MISSING_PACKAGING_LANGUAGES"
  | "WEAK_OR_MISSING_EVIDENCE"
  | "PENDING_IDENTIFIER"
  | "UNCONFIRMED_PHYSICAL_VARIANT"
  | "CATALOG_PENDING_REVIEW";

export type ResearchRisk = {
  code: ResearchRiskCode;
  priority: ResearchPriority;
  weight: number;
  reason: string;
  targetField?: ResearchClaimField;
};

export type ResearchSubject = {
  id: string;
  kind: ResearchSubjectKind;
  catalogId: string | null;
  guideId: string | null;
  physicalEditionId: string | null;
  title: string;
  platformSlug: string;
  edition: string;
  region: string;
  barcode: string | null;
  productCodes: string[];
  serials: string[];
  marketRegions: string[];
  evidenceMarkets: string[];
  packagingLanguages: string[];
  softwareLanguages: string[];
  releaseStatus: string | null;
  physicalProductType: string | null;
  containsDisc: boolean | null;
  countsAsNativePhysicalRelease: boolean | null;
  confidence: string | null;
  evidenceCount: number;
  sourceCount: number;
  notes: string[];
};

export type ResearchTaskKind =
  | "VERIFY_PLATFORM"
  | "VERIFY_PHYSICAL_STATUS"
  | "RESOLVE_BARCODE"
  | "RESOLVE_MARKET"
  | "RESOLVE_PACKAGING"
  | "RESOLVE_CONFLICT"
  | "STRENGTHEN_EVIDENCE";

export type ResearchTaskStatus = "queued" | "researching" | "blocked" | "resolved" | "rejected";

export type ResearchTask = {
  id: string;
  subjectId: string;
  kind: ResearchTaskKind;
  priority: ResearchPriority;
  question: string;
  requiredEvidence: ResearchEvidenceKind[];
  riskCodes: ResearchRiskCode[];
  status: ResearchTaskStatus;
  createdAt: string;
};

export type ResearchQuery = {
  query: string;
  purpose: ResearchTaskKind;
  priority: ResearchPriority;
};

export type ResearchEvidence = {
  id: string;
  kind: ResearchEvidenceKind;
  label: string;
  url: string | null;
  sourceHost: string | null;
  observedAt: string;
  summary: string;
  supports: ResearchClaimField[];
};

export type ResearchClaim = {
  id: string;
  subjectId: string;
  field: ResearchClaimField;
  value: unknown;
  confidence: number;
  evidenceIds: string[];
  sourceStrength: number;
  note?: string;
};

export type ResearchClaimResolutionStatus = "CONFIRMED" | "PROVISIONAL" | "CONFLICT" | "UNRESOLVED";

export type ResearchClaimResolution = {
  field: ResearchClaimField;
  status: ResearchClaimResolutionStatus;
  value: unknown | null;
  score: number;
  competingValues: Array<{ value: unknown; score: number; claimIds: string[] }>;
};

export type ResearchScanItem = {
  subject: ResearchSubject;
  risks: ResearchRisk[];
  debtScore: number;
  tasks: ResearchTask[];
};

export type ResearchScanSummary = {
  scanned: number;
  flagged: number;
  p0: number;
  p1: number;
  p2: number;
  totalDebt: number;
};

export type ResearchScanResult = {
  schemaVersion: 1;
  mode: "research-only";
  generatedAt: string;
  filters: {
    platformSlug: string | null;
    query: string | null;
    limit: number | null;
  };
  summary: ResearchScanSummary;
  items: ResearchScanItem[];
};

export type ResearchSearchHit = {
  title: string;
  url: string;
  snippet: string;
  sourceHost: string | null;
};

export type ResearchSearchProvider = {
  name: string;
  search(query: string): Promise<ResearchSearchHit[]>;
};

export type ResearchInvestigationContext = {
  subject: ResearchSubject;
  task: ResearchTask;
  queries: ResearchQuery[];
  evidence: ResearchEvidence[];
  claims: ResearchClaim[];
};

export type ResearchAgentResult = {
  evidence: ResearchEvidence[];
  claims: ResearchClaim[];
  followUpQueries: string[];
  stopReason: "confirmed" | "unresolved" | "budget_exhausted" | "blocked";
};

export type ResearchAgentAdapter = {
  name: string;
  investigate(context: ResearchInvestigationContext): Promise<ResearchAgentResult>;
};
