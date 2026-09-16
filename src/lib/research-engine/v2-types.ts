import type { ResearchPriority, ResearchRiskCode } from "./types";

export const RESEARCH_TARGET_FIELDS = [
  "PHYSICAL_EXISTENCE",
  "PHYSICAL_PRODUCT_TYPE",
  "BARCODE",
  "BOX_CODE",
  "SERIAL",
  "PRODUCT_CODE",
  "MEDIA_ID",
  "XEMID",
  "MARKET_REGION",
  "EVIDENCE_MARKET",
  "DISTRIBUTION_MARKET",
  "PACKAGING_LANGUAGES",
  "SOFTWARE_LANGUAGES",
  "RATING",
  "OUTER_INNER_RELATION",
  "BUNDLE_CONTENTS",
  "COLLECTOR_CONTENTS",
  "PRINT_REVISION",
  "MEDIA_REVISION",
  "ROM_REVISION",
  "RELEASE_STATUS",
  "CANONICAL_IDENTITY",
] as const;

export type ResearchTargetField = (typeof RESEARCH_TARGET_FIELDS)[number];

export const RESEARCH_COMPONENTS = [
  "FRONT",
  "BACK",
  "SPINE",
  "BOX_FRONT",
  "BOX_BACK",
  "BOX_SPINE",
  "BOX_FLAPS",
  "CART_FRONT",
  "CART_BACK",
  "DISC",
  "MANUAL",
  "OUTER_BOX",
  "INNER_BOX",
  "INSERT",
  "STICKER",
  "STEELBOOK",
  "ACCESSORY",
  "UNKNOWN",
] as const;

export type ResearchComponent = (typeof RESEARCH_COMPONENTS)[number];

export const RESEARCH_ACCESS_MODES = [
  "INTERNAL",
  "DIRECT_FETCH",
  "SEARCH_ENGINE",
  "DOMAIN_SEARCH",
  "BROWSER",
  "IMAGE_SEARCH",
  "API",
  "ARCHIVE",
  "MARKETPLACE_API",
] as const;

export type ResearchAccessMode = (typeof RESEARCH_ACCESS_MODES)[number];

export type ResearchCompanyContext = {
  role: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  sourceCandidateHost: string | null;
};

export type ResearchCatalogContext = {
  subjectId: string;
  subjectKind: string;
  catalogId: string | null;
  canonicalGameId: string | null;
  workId: string | null;
  platformReleaseId: string | null;
  guideId: string | null;
  physicalEditionId: string | null;
  title: string;
  aliases: string[];
  titlePc: string | null;
  slug: string | null;
  platformSlug: string;
  edition: string;
  physicalVariant: string | null;
  region: string | null;
  regionFamily: string | null;
  marketRegion: string | null;
  regionalStatus: string | null;
  languages: string[];
  regionalPackaging: unknown[];
  canonicalSerials: string[];
  sourceSerials: string[];
  resolutionSerials: string[];
  publisher: string | null;
  developer: string | null;
  companyCredits: ResearchCompanyContext[];
  physicalPublisherOrDistributor: string | null;
  regionalPublisher: string | null;
  releaseDate: string | null;
  year: number | null;
  ean: string | null;
  barcode: string | null;
  productCodes: string[];
  softwareFamilyCodes: string[];
  serial: string | null;
  catalogNumber: string | null;
  boxCode: string | null;
  ratingSystems: string[];
  packagingLanguages: string[];
  softwareLanguages: string[];
  componentLanguageEvidence: unknown[];
  broadRegion: string | null;
  marketRegions: string[];
  evidenceMarkets: string[];
  distributionMarkets: string[];
  physicalProductType: string | null;
  nativePhysicalPlatform: string | null;
  compatiblePlatforms: string[];
  containsDisc: boolean | null;
  countsAsNativePhysicalRelease: boolean | null;
  physicalContents: string[];
  digitalContents: string[];
  releaseStatus: string | null;
  confidence: string | null;
  sharedDiscId: string | null;
  scanSetIds: string[];
  ownedScans: Array<{
    catalogId: string;
    capturedAt: string;
    sourceLabel: string;
    barcode: string | null;
    boxCode: string | null;
    packagingLanguages: string[];
    images: Array<{ role: string; label: string; url: string; thumbnailUrl: string }>;
  }>;
  coverUrl: string | null;
  editionImages: Array<{ key: string; url: string; label: string; evidenceType: string }>;
  existingEvidence: Array<{ id: string; type: string; label: string; url: string | null; summary: string | null; supports: string[] }>;
  existingResearchTasks: Array<{ id: string; label: string; status: string; marketRegions: string[]; notes: string[] }>;
  gameRetailer: { sku: string; url: string; imageUrl: string | null } | null;
  priceCharting: { productId: number | null; path: string | null } | null;
  museumPath: string | null;
  legacySources: string[];
  fieldProvenance: Record<string, unknown>;
  officialSourceCandidates: string[];
};

export type ResearchSourceDefinition = {
  id: string;
  hosts: string[];
  platforms: string[];
  countries: string[];
  roles: string[];
  accessModes: ResearchAccessMode[];
  fieldCapabilities: Partial<Record<ResearchTargetField, number>>;
  defaultReliability: number;
  knownRisks: string[];
  queryTemplates: string[];
};

export type ResearchDecisionTest = {
  id: string;
  question: string;
  options: string[];
  correct: string | string[];
  action?: string;
};

export type ResearchIdentifierRule = {
  id: string;
  trigger: string;
  rule?: string;
  allowedConclusions?: string[];
  forbiddenConclusions?: string[];
  nextEvidence?: string[];
};

export type ResearchPlaybook = {
  id: string;
  targets: Array<ResearchTargetField | "*">;
  triggers: string[];
  sourceRoles: string[];
  queryTemplateGroups: string[];
  deterministicChecks: string[];
  steps: string[];
  stopWhen: string | null;
  stopRule: string | null;
  sourceIds: string[];
  requiredEvidencePreference: string[];
};

export type ResearchPlatformKnowledge = {
  schemaVersion: number;
  knowledgeId: string;
  platformSlug: string;
  reviewedAt: string;
  status: string;
  mode: string;
  purpose: string;
  coreModel: Record<string, unknown>;
  sources: Record<string, Record<string, unknown>>;
  sourceCapabilities: Record<string, Array<[string, number]>>;
  identifierRules: ResearchIdentifierRule[];
  decisionTests: ResearchDecisionTest[];
  playbooks: Record<string, Record<string, unknown>>;
  knownTraps: Array<Record<string, unknown>>;
  caseLearnings: Array<Record<string, unknown>>;
  workerPolicy: Record<string, unknown>;
  integrationNotes: Record<string, unknown>;
};

export type ResearchLegacyKnowledgeEntry = {
  id: string;
  platformSlug: string;
  batch: string;
  kind: "inspection_rule" | "game_reference";
  status: string;
  text: string;
  catalogIds: string[];
  sourceIds: string[];
  sources: Array<{ id: string; url: string; kind: string; attribution: string | null }>;
  distributionVariants: unknown[];
  trust: "reviewed_guidance" | "candidate_only";
};

export type ResearchKnowledgeBundle = {
  platform: ResearchPlatformKnowledge | null;
  generalDocuments: Record<string, Record<string, unknown>>;
  sources: ResearchSourceDefinition[];
  playbooks: ResearchPlaybook[];
  queryTemplates: Record<string, string[]>;
  legacyEntries: ResearchLegacyKnowledgeEntry[];
  franchiseRules: string[];
  loadedFiles: string[];
};

export type ResearchRouterInput = {
  catalogContext: ResearchCatalogContext;
  targetField: ResearchTargetField;
  knownIdentifiers: Array<{ type: ResearchTargetField | string; value: string; component?: ResearchComponent | null }>;
  platformKnowledge: ResearchPlatformKnowledge | null;
  companyKnowledge: ResearchCompanyContext[];
  franchiseKnowledge: string[];
  sourceKnowledge: ResearchSourceDefinition[];
  playbooks: ResearchPlaybook[];
  queryTemplates: Record<string, string[]>;
  legacyKnowledge: ResearchLegacyKnowledgeEntry[];
  currentClaims: ResearchClaimRecord[];
  currentConflicts: ResearchConflict[];
};

export type ResearchSourcePlanItem = {
  sourceId: string;
  hosts: string[];
  roles: string[];
  accessModes: ResearchAccessMode[];
  capabilityScore: number;
  reason: string;
};

export type ResearchRouterPlan = {
  targetField: ResearchTargetField;
  factsUsed: string[];
  selectedPlaybook: ResearchPlaybook;
  sourcePlan: ResearchSourcePlanItem[];
  directUrlPlan: Array<{ url: string; sourceId: string; reason: string }>;
  queryPlan: Array<{ query: string; sourceId: string | null; purpose: ResearchTargetField }>;
  imagePlan: Array<{ component: ResearchComponent; fields: ResearchTargetField[]; reason: string }>;
  deterministicChecks: string[];
  escalationRules: string[];
  routeFingerprint: string;
};

export type ResearchSubjectBinding = {
  game: "MATCH" | "MISMATCH" | "UNKNOWN";
  platform: "MATCH" | "MISMATCH" | "UNKNOWN";
  edition: "MATCH" | "MISMATCH" | "UNKNOWN";
  variant: "MATCH" | "MISMATCH" | "UNKNOWN";
  component: "MATCH" | "MISMATCH" | "UNKNOWN";
  risks: string[];
};

export type ResearchEvidenceRecord = {
  id: string;
  runId: string;
  taskId: string;
  sourceId: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  sourceType: string;
  host: string | null;
  fetchedAt: string;
  evidenceType: string;
  subjectBinding: ResearchSubjectBinding;
  relevantExcerpt: string | null;
  imageUrl: string | null;
  imageHash: string | null;
  textHash: string | null;
  capabilities: ResearchTargetField[];
  reliability: number;
  component: ResearchComponent | null;
};

export type ResearchClaimRecord = {
  id: string;
  runId: string;
  taskId: string;
  subjectId: string;
  gameId: string | null;
  platformSlug: string;
  editionId: string | null;
  variantId: string | null;
  component: ResearchComponent | null;
  field: ResearchTargetField;
  value: unknown;
  sourceId: string;
  sourceUrl: string | null;
  evidenceId: string;
  confidence: number;
  status: "CANDIDATE" | "VALIDATED" | "REJECTED" | "CONFLICT";
  validationErrors: string[];
  createdAt: string;
};

export type ResearchConflict = {
  id: string;
  field: ResearchTargetField;
  claimIds: string[];
  values: unknown[];
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  reason: string;
  nextEvidenceNeeded: string[];
};

export type ResearchSearchRequest = {
  query: string;
  domains?: string[];
  excludeDomains?: string[];
  country?: string;
  language?: string;
  recencyDays?: number;
  maxResults?: number;
  /** Zero-based result-page offset for providers that support pagination. */
  offset?: number;
};

export type ResearchSearchResult = {
  title: string;
  url: string;
  snippet: string;
  host: string;
  rank: number;
  publishedAt: string | null;
  provider: string;
};

export type ResearchRetrievalFailureCode =
  | "SOURCE_TIMEOUT"
  | "SOURCE_BLOCKED"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_RATE_LIMITED"
  | "PROVIDER_QUOTA_EXHAUSTED"
  | "PROVIDER_TEMPORARILY_UNAVAILABLE"
  | "BROWSER_REQUIRED"
  | "IMAGE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ResearchProviderHealth = {
  provider: string;
  state: "HEALTHY" | "DEGRADED" | "OPEN_CIRCUIT" | "NOT_CONFIGURED";
  checkedAt: string;
  failureCode: ResearchRetrievalFailureCode | null;
  detail: string | null;
};

export type ResearchRetrievalEvent = {
  at: string;
  operation: "PREFLIGHT" | "SEARCH" | "IMAGE_SEARCH" | "DIRECT_FETCH" | "BROWSER";
  provider: string;
  outcome: "SUCCESS" | "EMPTY" | "RETRY" | "FAILOVER" | "OPEN_CIRCUIT" | "CACHE_HIT" | "FAILURE";
  failureCode: ResearchRetrievalFailureCode | null;
  detail: string | null;
};

export type ResearchSearchProviderV2 = {
  name: string;
  search(request: ResearchSearchRequest): Promise<ResearchSearchResult[]>;
  getUsage?(): Record<string, number>;
  preflight?(): Promise<ResearchProviderHealth[]>;
  getHealth?(): ResearchProviderHealth[];
  getEvents?(): ResearchRetrievalEvent[];
};

export type ResearchPage = {
  requestedUrl: string;
  canonicalUrl: string;
  status: number;
  title: string;
  text: string;
  language: string | null;
  structuredData: unknown[];
  links: string[];
  imageCandidates: Array<{ url: string; alt: string | null; caption: string | null }>;
  fetchedAt: string;
  contentType: string;
  bytes: number;
};

export type ResearchPageFetcher = {
  fetch(url: string): Promise<ResearchPage>;
};

export type ResearchBrowserResult = {
  url: string;
  status: number;
  title: string;
  text: string;
  links: string[];
  images: Array<{ url: string; alt: string | null; caption: string | null }>;
};

export type ResearchBrowserProvider = {
  name: string;
  browse(url: string): Promise<ResearchBrowserResult>;
  close(): Promise<void>;
};

export type ResearchImageSearchResult = {
  imageUrl: string;
  thumbnailUrl: string | null;
  sourcePageUrl: string | null;
  title: string;
  host: string;
  rank: number;
};

export type ResearchImageSearchProvider = {
  name: string;
  search(request: ResearchSearchRequest): Promise<ResearchImageSearchResult[]>;
  getUsage?(): Record<string, number>;
  preflight?(): Promise<ResearchProviderHealth[]>;
  getHealth?(): ResearchProviderHealth[];
  getEvents?(): ResearchRetrievalEvent[];
};

export type ResearchVisionResult = {
  component: ResearchComponent;
  titleCandidate: string | null;
  platformCandidate: string | null;
  editionCandidate: string | null;
  barcodeCandidates: string[];
  printedCodes: string[];
  packagingLanguagesObserved: string[];
  ratingMarks: string[];
  publisherText: string[];
  distributorText: string[];
  downloadStatements: string[];
  stickerDetected: boolean;
  imageQuality: "GOOD" | "LIMITED" | "UNREADABLE";
  confidenceByField: Record<string, number>;
};

export type ResearchModelUsage = {
  provider: "openai" | "none";
  model: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type ResearchLlmProvider = {
  name: string;
  extract(input: {
    context: ResearchCatalogContext;
    targetField: ResearchTargetField;
    sourceId: string;
    sourceUrl: string;
    text: string;
    allowedNextActions: string[];
  }): Promise<{
    claims: Array<{ field: ResearchTargetField; value: unknown; confidence: number; excerpt: string; component: ResearchComponent | null }>;
    identifiers: Array<{ type: string; value: string; component: ResearchComponent | null }>;
    observedSubject: { title: string | null; platform: string | null; edition: string | null; variant: string | null };
    nextAction: string;
    reasoningSummary: string;
    usage: ResearchModelUsage;
  }>;
  decide(input: { question: string; options: string[]; observations: Record<string, unknown> }): Promise<{ choice: string; usage: ResearchModelUsage }>;
};

export type ResearchVisionProvider = {
  name: string;
  inspect(input: { imageUrl: string; componentHint?: ResearchComponent | null; requestedFields: ResearchTargetField[] }): Promise<{ result: ResearchVisionResult; usage: ResearchModelUsage }>;
};

export type ResearchBudgetLimits = {
  maxSearches: number;
  maxPages: number;
  maxImages: number;
  maxAgentTurns: number;
  maxTokens: number;
  maxCostUsd: number;
  maxBrowserSessions: number;
};

export type ResearchBudgetUsage = {
  searches: number;
  pages: number;
  images: number;
  agentTurns: number;
  browserSessions: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type ResearchRunStatus =
  | "QUEUED"
  | "SEARCHING"
  | "READING"
  | "INSPECTING_IMAGES"
  | "RESOLVING"
  | "CONFIRMED"
  | "PARTIAL"
  | "UNRESOLVED"
  | "BLOCKED_INFRASTRUCTURE"
  | "BLOCKED"
  | "FAILED";

export type ResearchState = {
  schemaVersion: 2;
  runId: string;
  taskId: string;
  subjectId: string;
  priority: ResearchPriority;
  status: ResearchRunStatus;
  round: number;
  targetFields: ResearchTargetField[];
  currentTargetField: ResearchTargetField;
  currentPlaybook: string | null;
  queriesAttempted: string[];
  normalizedQueries: string[];
  urlsVisited: string[];
  domainsVisited: string[];
  identifiersSeen: Array<{ type: string; value: string; component: ResearchComponent | null }>;
  evidence: ResearchEvidenceRecord[];
  claims: ResearchClaimRecord[];
  conflicts: ResearchConflict[];
  rejectedHypotheses: Array<{ value: string; reason: string }>;
  budget: ResearchBudgetLimits;
  usage: ResearchBudgetUsage;
  lastDecision: string | null;
  reasoningSummary: string | null;
  decisionSummary: string | null;
  nextEvidenceNeeded: string[];
  whyStopped: string | null;
  riskCodes: ResearchRiskCode[];
  createdAt: string;
  updatedAt: string;
};

export type DurableResearchTask = {
  id: string;
  subjectId: string;
  targetField: ResearchTargetField;
  question: string;
  priority: ResearchPriority;
  evidenceNeeded: string[];
  riskCodes: ResearchRiskCode[];
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "UNRESOLVED" | "BLOCKED";
  createdAt: string;
  updatedAt: string;
};
