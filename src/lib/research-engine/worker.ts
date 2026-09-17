import { createHash, randomUUID } from "node:crypto";
import { buildResearchCatalogContext } from "./catalog-context";
import { budgetAllows, budgetExhaustionReason, recordBudgetUse, recordModelUsage } from "./budget";
import { researchKnowledgePackSearchBudget, type ResearchKnowledgePackV1 } from "./knowledge-pack";
import { bindEvidenceSubject } from "./evidence-binding";
import { crossAttributionConflicts, resolveResearchClaimRecords, type ResearchFieldResolution } from "./conflict-engine";
import { loadResearchKnowledge } from "./knowledge-loader";
import { researchPageTextHash } from "./page-fetcher";
import { boundedBackoff, classifyRetrievalFailure, isInfrastructureRetrievalFailure, isRetryableRetrievalFailure, safeRetrievalDetail } from "./retrieval-resilience";
import { applicableDecisionTests, knownIdentifiersForRouter, routeResearch, shouldDynamicallyReplan } from "./router";
import { ResearchRunStore, createResearchPhysicalMetrics, createResearchState, createResearchTelemetry } from "./state-store";
import type { ResearchSubject } from "./types";
import { knownValuesForTarget, validateClaimDeterministically } from "./validators";
import {
  assessIdentifierSearchResults,
  createIdentifierTrace,
  createWorldwideCoverageLedger,
  discoverIdentifierCandidates,
  identifierField,
  missingExhaustionStages,
  nationalMarketRequirement,
  requiredExhaustionStages,
  searchResultMatchesResearchScope,
} from "./identifier-resolution";
import {
  canonicalImageUrl,
  canonicalResearchComponent,
  createEvidenceGap,
  createProductNode,
  fetchImageContentHash,
  genericQueriesAllowedAfterPhysicalMode,
  identifierBinding,
  isPhysicalEvidenceGap,
  mergeProductGraph,
  sourceRecordIdFromUrl,
} from "./physical-evidence";
import type {
  DurableResearchTask,
  ResearchBrowserProvider,
  ResearchCatalogContext,
  ResearchClaimRecord,
  ResearchEvidenceRecord,
  ResearchImageSearchProvider,
  ResearchImageSearchResult,
  ResearchImageCandidate,
  ResearchLlmProvider,
  ResearchModelUsage,
  ResearchPage,
  ResearchPageFetcher,
  ResearchRetrievalEvent,
  ResearchRetrievalFailureCode,
  ResearchRouterInput,
  ResearchRouterPlan,
  ResearchQueryStage,
  ResearchSearchProviderV2,
  ResearchSearchResult,
  ResearchSourcePlanItem,
  ResearchState,
  ResearchTargetField,
  ResearchVisionProvider,
  ResearchVisionResult,
} from "./v2-types";

export type ResearchWorkerDependencies = {
  searchProvider: ResearchSearchProviderV2 | null;
  pageFetcher: ResearchPageFetcher;
  browserProvider?: ResearchBrowserProvider | null;
  imageSearchProvider?: ResearchImageSearchProvider | null;
  llmProvider?: ResearchLlmProvider | null;
  visionProvider?: ResearchVisionProvider | null;
  store?: ResearchRunStore;
};

type PageArtifact = Pick<ResearchPage, "requestedUrl" | "canonicalUrl" | "status" | "title" | "language" | "contentType" | "bytes" | "fetchedAt"> & {
  textHash: string;
  excerpt: string;
  linkCount: number;
  imageCount: number;
  imageCandidates: ResearchImageCandidate[];
  mode: "DIRECT_FETCH" | "BROWSER";
};

export type ResearchWorkerResult = {
  state: ResearchState;
  context: ResearchCatalogContext;
  routerPlans: ResearchRouterPlan[];
  searchResults: ResearchSearchResult[];
  pages: PageArtifact[];
  images: ResearchImageSearchResult[];
  visionResults: Array<{ imageUrl: string; result: ResearchVisionResult; usage?: ResearchModelUsage }>;
  sourceCandidates: Array<{ host: string; sampleUrls: string[]; fieldsObserved: ResearchTargetField[]; status: "PENDING_SOURCE_REVIEW" }>;
  resolution: ResearchFieldResolution;
  providerUsage: Record<string, number>;
  providerHealth: ReturnType<NonNullable<ResearchSearchProviderV2["getHealth"]>>;
  retrievalEvents: ResearchRetrievalEvent[];
  technicalFailures: Array<{ operation: string; target: string; code: ResearchRetrievalFailureCode; detail: string; recovered: boolean }>;
  funnel: { searches: number; searchResults: number; pagesAttempted: number; pagesOpened: number; imagesDiscovered: number; imagesInspected: number };
  artifactDirectory: string;
};

type TechnicalFailure = ResearchWorkerResult["technicalFailures"][number];

const LLM_TOKEN_RESERVE = 6_000;
const VISION_TOKEN_RESERVE = 10_000;

function hasTokenReserve(state: ResearchState, reserve: number): boolean {
  return state.usage.inputTokens + state.usage.outputTokens + reserve <= state.budget.maxTokens;
}

function now(): string {
  return new Date().toISOString();
}

function absoluteOwnedScanUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = process.env.REGION_ATLAS_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.regionatlas.games";
  return new URL(value, base.endsWith("/") ? base : `${base}/`).toString();
}

function normalizedQuery(query: string): string {
  return query.toLowerCase().replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();
}

function highValueKnowledgeRoutesExhausted(
  pack: ResearchKnowledgePackV1 | undefined,
  targetField: ResearchTargetField,
  state: ResearchState,
): boolean {
  const plan = pack?.fieldPlans[targetField];
  if (!plan) return false;
  const directUrlsDone = plan.directUrls.every((row) => state.urlsVisited.includes(row.url));
  const exactAndSourceQueriesDone = plan.exactQueries
    .filter((row) => row.strategy !== "GENERIC_LAST_RESORT")
    .every((row) => state.normalizedQueries.includes(normalizedQuery(row.query)));
  return directUrlsDone && exactAndSourceQueriesDone;
}

function secondaryBudgetCanDegradeWithoutCuttingSearch(reason: string, packRoutesExhausted: boolean): boolean {
  if (packRoutesExhausted) return false;
  return [
    "PAGE_BUDGET_EXHAUSTED",
    "IMAGE_BUDGET_EXHAUSTED",
    "AGENT_TURN_BUDGET_EXHAUSTED",
    "BROWSER_BUDGET_EXHAUSTED",
  ].includes(reason);
}

function completedKnowledgeRouteStopReason(
  exhausted: string | null,
  pack: ResearchKnowledgePackV1 | undefined,
  targetField: ResearchTargetField,
  state: ResearchState,
): string | null {
  return exhausted?.endsWith("_BUDGET_EXHAUSTED")
    && highValueKnowledgeRoutesExhausted(pack, targetField, state)
    ? "HIGH_VALUE_ROUTES_EXHAUSTED"
    : exhausted;
}

function comparableText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchResultLooksRelevant(
  hit: ResearchSearchResult,
  context: ResearchCatalogContext,
  targetField: ResearchTargetField,
  plan: ResearchRouterPlan,
  planned: ResearchRouterPlan["queryPlan"][number],
): boolean {
  const haystack = comparableText(`${hit.title} ${hit.snippet} ${hit.url}`);
  const titleTokens = [...new Set(comparableText(context.title).split(" ").filter((token) => token.length >= 3 && !["the", "and", "edition"].includes(token)))];
  const matchingTokens = titleTokens.filter((token) => haystack.includes(token)).length;
  if (matchingTokens < Math.min(2, titleTokens.length)) return false;
  const distinctiveTitleTokens = titleTokens.filter((token) => !["assassin", "creed", "collection", "pack"].includes(token));
  const identityHaystack = comparableText(`${hit.title} ${hit.url}`);
  if (planned.strategy !== "EXACT_IDENTIFIER" && distinctiveTitleTokens.length && !distinctiveTitleTokens.some((token) => identityHaystack.includes(token))) return false;
  const platformAliases: Record<string, string[]> = {
    ds: ["nintendo ds", " nds ", " ds "],
    "3ds": ["nintendo 3ds", " 3ds "],
    switch: ["nintendo switch", " switch "],
    wiiu: ["wii u", " wiiu "],
    ps3: ["playstation 3", " ps3 "],
    ps4: ["playstation 4", " ps4 "],
    ps5: ["playstation 5", " ps5 "],
    xbox360: ["xbox 360", " xbox360 "],
  };
  const padded = ` ${haystack} `;
  const titleAndUrl = ` ${comparableText(`${hit.title} ${hit.url}`)} `;
  const expectedAliases = platformAliases[context.platformSlug] ?? [` ${comparableText(context.platformSlug)} `];
  const expectedPlatformPresent = expectedAliases.some((alias) => padded.includes(alias));
  const otherPlatformPresent = Object.entries(platformAliases)
    .some(([platform, aliases]) => platform !== context.platformSlug && aliases.some((alias) => padded.includes(alias)));
  const wrongPlatformInIdentity = Object.entries(platformAliases)
    .some(([platform, aliases]) => platform !== context.platformSlug && aliases.some((alias) => titleAndUrl.includes(alias)));
  if (wrongPlatformInIdentity && !expectedAliases.some((alias) => titleAndUrl.includes(alias))) return false;
  if (otherPlatformPresent && !expectedPlatformPresent) return false;
  const edition = comparableText(context.edition);
  const requiredEditionTokens = ["skull", "buccaneer", "black chest", "collector", "double pack"]
    .filter((token) => edition.includes(token));
  if (planned.strategy !== "EXACT_IDENTIFIER" && requiredEditionTokens.length && !requiredEditionTokens.some((token) => haystack.includes(token))) return false;
  if (["BARCODE", "BOX_CODE", "PRODUCT_CODE", "SERIAL"].includes(targetField)) {
    const sourceBound = plan.sourcePlan.some((source) => source.hosts.some((host) => hostMatches(hit.host, host)));
    const identifierCue = /\bbarcode\b|\bean\b|\bupc\b|product code|box code|cartridge code|back cover|contraportada|trasera|scan/i.test(`${hit.title} ${hit.snippet} ${hit.url}`);
    if (!sourceBound && !identifierCue) return false;
  }
  return true;
}

function imageResultLooksRelevant(hit: ResearchImageSearchResult, context: ResearchCatalogContext, targetField: ResearchTargetField): boolean {
  const haystack = comparableText(`${hit.title} ${hit.sourcePageUrl} ${hit.imageUrl}`);
  const distinctiveTitleTokens = [...new Set(comparableText(context.title).split(" ")
    .filter((token) => token.length >= 4 && !["assassin", "creed", "edition"].includes(token)))];
  const titleMatches = distinctiveTitleTokens.length === 0 || distinctiveTitleTokens.some((token) => haystack.includes(token));
  if (!titleMatches) return false;
  const expected = comparableText(context.platformSlug);
  const platformIdentity = comparableText(`${hit.title} ${hit.sourcePageUrl ?? ""}`);
  const platformAliases: Record<string, string[]> = {
    ds: ["nintendo ds", "nds"], switch: ["nintendo switch", "switch"], wiiu: ["wii u", "wiiu"],
    ps4: ["playstation 4", "ps4"], ps5: ["playstation 5", "ps5"], xbox360: ["xbox 360", "xbox360"],
  };
  const wrong = Object.entries(platformAliases).some(([platform, aliases]) => platform !== context.platformSlug && aliases.some((alias) => platformIdentity.includes(alias)));
  const right = (platformAliases[context.platformSlug] ?? [expected]).some((alias) => platformIdentity.includes(alias));
  if (wrong && !right) return false;
  if (targetField === "PHYSICAL_PRODUCT_TYPE" && /(?:eshop|digital key|steam key)/i.test(`${hit.title} ${hit.sourcePageUrl ?? ""}`) && !/(?:code in (?:a )?box|box|case|physical)/i.test(hit.title)) return false;
  return true;
}

function imageTargetScore(hit: ResearchImageSearchResult, targetField: ResearchTargetField): number {
  const text = `${hit.title} ${hit.sourcePageUrl ?? ""} ${hit.imageUrl}`.toLowerCase();
  let score = Math.max(0, 10 - hit.rank);
  if (targetField === "PHYSICAL_PRODUCT_TYPE") {
    if (/back cover|rear cover|contraportada|trasera|unboxing|case scan/.test(text)) score += 15;
    if (/code in (?:a )?box|download required|physical/.test(text)) score += 10;
    if (/cartridge|game card/.test(text)) score += 5;
    if (/eshop|digital key/.test(text)) score -= 12;
  }
  if (targetField === "PRODUCT_CODE" && /cartridge|game card|cart label/.test(text)) score += 15;
  if (targetField === "BARCODE" && /back|rear|barcode|contraportada|trasera/.test(text)) score += 15;
  if (targetField === "OUTER_INNER_RELATION" && /double pack|compilation|bundle|outer|inner/.test(text)) score += 12;
  return score;
}

function recoverSourceAttempt(failures: TechnicalFailure[], target: string): void {
  for (const failure of failures.filter((row) => row.target === target)) failure.recovered = true;
}

function recoverPhysicalRouteFallbacks(failures: TechnicalFailure[]): void {
  for (const failure of failures) {
    if (!failure.recovered && ["DIRECT_FETCH", "BROWSER", "IMAGE_INSPECTION"].includes(failure.operation)) failure.recovered = true;
  }
}

function packagingImageScore(candidate: ResearchPage["imageCandidates"][number]): number {
  const text = `${candidate.galleryLabel ?? ""} ${candidate.alt ?? ""} ${candidate.caption ?? ""} ${candidate.originalUrl ?? ""} ${candidate.url}`.toLowerCase();
  if (/facebook\.com\/tr|\.svg(?:[?#]|$)|favicon|sprite|logo|icon|appstore|googleplay|tracking|pixel/i.test(text)) return -100;
  let score = 0;
  if (/\bback\b|\brear\b|\bbarcode\b|contraportada|trasera/i.test(text)) score += 8;
  if (/\bbox\b|\bcover\b|caratula|\bcart\b|cartridge|\bdisc\b|package|packaging|product/i.test(text)) score += 4;
  if (/\bfront\b|portada/i.test(text)) score += 1;
  if (candidate.originalUrl) score += 3;
  if (candidate.acquisitionMechanisms.includes("ancestor-a.href") || candidate.acquisitionMechanisms.includes("img.data-original")) score += 2;
  return score;
}

function hostMatches(host: string, candidate: string): boolean {
  const a = host.toLowerCase().replace(/^www\./, "");
  const b = candidate.toLowerCase().replace(/^www\./, "");
  return a === b || a.endsWith(`.${b}`);
}

function sourceForUrl(url: string, plan: ResearchRouterPlan): ResearchSourcePlanItem | null {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return plan.sourcePlan.find((source) => source.hosts.some((candidate) => hostMatches(host, candidate))) ?? null;
}

function traceKey(type: string, value: string): string {
  return `${type}:${value.toUpperCase()}`;
}

function recordQueryTelemetry(state: ResearchState, planned: ResearchRouterPlan["queryPlan"][number]): void {
  state.telemetry ??= createResearchTelemetry();
  if (planned.stage === "STRUCTURED_RELEASE_SEED") state.telemetry.releaseMapSeedQueries += 1;
  if (planned.stage === "FIELD_SPECIFIC") state.telemetry.fieldSpecificQueries += 1;
  if (planned.stage === "REGIONAL_FALLBACK") state.telemetry.regionalQueries += 1;
  if (planned.stage === "LOCAL_LANGUAGE_FALLBACK") state.telemetry.localLanguageQueries += 1;
  if (planned.strategy === "EXACT_IDENTIFIER" || planned.stage === "EXACT_IDENTIFIER_SEARCH" || planned.stage === "KNOWN_EXACT_IDENTIFIER") {
    state.telemetry.exactIdentifierQueries += 1;
  }
}

function searchLocaleFor(planned: ResearchRouterPlan["queryPlan"][number]): { country: string; language: string } {
  const query = planned.query.toLowerCase();
  if (planned.coverageBucket === "JAPAN" || /\b(?:japan|jan)\b|型番|日本/.test(query)) return { country: "JP", language: "ja" };
  if (planned.coverageBucket === "ASIA_OTHER") {
    if (/\b(?:korea|grac)\b|한국/.test(query)) return { country: "KR", language: "ko" };
    return { country: "HK", language: "en" };
  }
  if (planned.coverageBucket === "NORTH_AMERICA") return { country: "US", language: "en" };
  if (planned.coverageBucket === "OCEANIA") return { country: "AU", language: "en" };
  if (planned.coverageBucket === "LATIN_AMERICA") {
    return { country: "MX", language: "es" };
  }
  return { country: "ES", language: "es" };
}

function discoveryLadderComplete(state: ResearchState, plan: ResearchRouterPlan): boolean {
  const requiredStages = new Set<ResearchQueryStage>(["FIELD_SPECIFIC", "STRUCTURED_RELEASE_SEED", "REGIONAL_FALLBACK"]);
  if (plan.queryPlan.some((row) => row.stage === "LOCAL_LANGUAGE_FALLBACK")) requiredStages.add("LOCAL_LANGUAGE_FALLBACK");
  const attempted = new Set(executedQueries(state, [plan]).map((row) => row.stage).filter((stage): stage is ResearchQueryStage => Boolean(stage)));
  return [...requiredStages].every((stage) => attempted.has(stage))
    && plan.queryPlan
      .filter((row) => requiredStages.has(row.stage as ResearchQueryStage))
      .every((row) => state.normalizedQueries.includes(normalizedQuery(row.query)));
}

function processSearchResultIdentifiers(input: {
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  state: ResearchState;
  plan: ResearchRouterPlan;
  planned: ResearchRouterPlan["queryPlan"][number];
  hits: ResearchSearchResult[];
}): { newCandidate: boolean; exactProcessed: boolean } {
  input.state.telemetry ??= createResearchTelemetry();
  const previous = new Set((input.state.identifierTraces ?? []).map((trace) => traceKey(trace.type, trace.normalizedValue)));
  const traces = new Map((input.state.identifierTraces ?? []).map((trace) => [traceKey(trace.type, trace.normalizedValue), trace]));
  const discoveryHits = input.planned.strategy === "EXACT_IDENTIFIER"
    ? []
    : input.hits.filter((hit) => searchResultMatchesResearchScope({ hit, context: input.context, coverageBucket: input.planned.coverageBucket }));
  for (const hit of discoveryHits) {
    for (const candidate of discoverIdentifierCandidates(`${hit.title}\n${hit.snippet}\n${hit.url}`, input.context.platformSlug)) {
      const key = traceKey(candidate.type, candidate.normalizedValue);
      if (!traces.has(key)) {
        traces.set(key, createIdentifierTrace({
          candidate,
          discoveredFrom: "SEARCH_RESULT",
          discoveryQuery: input.planned.query,
          discoverySource: hit.host,
        }));
        input.state.telemetry.identifierCandidatesFound += 1;
        if (candidate.validation === "FORMAT_REJECTED") input.state.telemetry.identifierFormatRejected += 1;
        if (candidate.validation === "CHECKSUM_REJECTED") input.state.telemetry.identifierChecksumRejected += 1;
      }
      if (candidate.validation === "VALID") {
        input.state.identifiersSeen = mergeIdentifiers(input.state, [{ type: candidate.type, value: candidate.normalizedValue, component: null }]);
      }
    }
  }
  input.state.identifierTraces = [...traces.values()];
  const exactIdentifier = input.planned.identifierValue;
  const exactProcessed = Boolean(exactIdentifier && input.planned.strategy === "EXACT_IDENTIFIER");
  if (exactIdentifier) {
    const candidate = discoverIdentifierCandidates(exactIdentifier, input.context.platformSlug)[0]
      ?? (input.planned.identifierType ? {
        type: input.planned.identifierType === "BARCODE" ? "BARCODE" as const : input.planned.identifierType === "SERIAL" ? "SERIAL" as const : "PRODUCT_CODE" as const,
        observedValue: exactIdentifier,
        normalizedValue: exactIdentifier.trim().toUpperCase(),
        validation: "VALID" as const,
        rejectionReason: null,
      } : null);
    if (candidate) {
      const key = traceKey(candidate.type, candidate.normalizedValue);
      const trace = traces.get(key) ?? createIdentifierTrace({ candidate, discoveredFrom: "CATALOG" });
      trace.exactSearchQueries = [...new Set([...trace.exactSearchQueries, input.planned.query])];
      const confirmationHits = input.hits.filter((hit) => {
        const source = sourceForUrl(hit.url, input.plan);
        return !source?.roles.some((role) => role === "DISCOVERY_ONLY");
      });
      const assessment = assessIdentifierSearchResults({ identifier: candidate.normalizedValue, context: input.context, hits: confirmationHits, coverageBucket: input.planned.coverageBucket });
      trace.matchingSources = [...new Set([...trace.matchingSources, ...assessment.matchingSources])];
      trace.conflictingSources = [...new Set([...trace.conflictingSources, ...assessment.conflictingSources])];
      trace.subjectBinding = assessment.subjectBinding;
      trace.platformBinding = assessment.platformBinding;
      trace.editionBinding = assessment.editionBinding;
      if (assessment.status === "HARD_CONFLICT") {
        trace.finalStatus = "REJECTED";
        trace.rejectionReason = "HARD_IDENTIFIER_SUBJECT_CONFLICT";
        input.state.identifiersSeen = input.state.identifiersSeen.filter((row) => traceKey(row.type, row.value) !== key);
        input.state.rejectedHypotheses.push({ value: candidate.normalizedValue, reason: "HARD_IDENTIFIER_SUBJECT_CONFLICT" });
        input.state.telemetry.identifierSubjectConflicts += 1;
        input.state.claims = input.state.claims.map((claim) => {
          if (claim.field !== identifierField(candidate.type) || String(claim.value).trim().toUpperCase() !== candidate.normalizedValue) return claim;
          return {
            ...claim,
            status: "REJECTED" as const,
            validationErrors: [...new Set([...claim.validationErrors, "HARD_IDENTIFIER_SUBJECT_CONFLICT"])],
          };
        });
        input.state.conflicts = [...new Map([...input.state.conflicts, {
          id: `hard-id-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`,
          field: identifierField(candidate.type),
          claimIds: [],
          values: [candidate.normalizedValue],
          severity: "CRITICAL" as const,
          reason: "HARD_IDENTIFIER_SUBJECT_CONFLICT",
          nextEvidenceNeeded: ["CORRECT_EXACT_SUBJECT", "INDEPENDENT_EXACT_IDENTIFIER_SEARCH"],
        }].map((conflict) => [conflict.id, conflict])).values()];
      } else {
        const combinedStatus = trace.matchingSources.length >= 2 ? "CORROBORATED" : trace.matchingSources.length === 1 ? "PARTIAL" : "DISCOVERED";
        if (trace.finalStatus !== "CORROBORATED") {
          if (combinedStatus === "CORROBORATED") input.state.telemetry.identifierCorroborated += 1;
          else if (combinedStatus === "PARTIAL" && trace.finalStatus !== "PARTIAL") input.state.telemetry.identifierPartial += 1;
        }
        trace.finalStatus = combinedStatus;
        trace.rejectionReason = null;
        const field = identifierField(candidate.type);
        for (const hit of confirmationHits.filter((row) => trace.matchingSources.includes(row.host))) {
          const source = sourceForUrl(hit.url, input.plan);
          const sourceId = source?.sourceId ?? `web:${hit.host}`;
          const evidence: ResearchEvidenceRecord = {
            id: evidenceId(input.state.runId, hit.url, "EXACT_IDENTIFIER_SEARCH_RESULT", null),
            runId: input.state.runId,
            taskId: input.task.id,
            sourceId,
            sourceUrl: hit.url,
            canonicalUrl: hit.url,
            sourceType: source?.roles[0] ?? "SEARCH_RESULT",
            host: hit.host,
            fetchedAt: now(),
            evidenceType: "EXACT_IDENTIFIER_SEARCH_RESULT",
            subjectBinding: { game: "MATCH", platform: "MATCH", edition: "UNKNOWN", variant: "UNKNOWN", component: "UNKNOWN", risks: [] },
            relevantExcerpt: `${hit.title} — ${hit.snippet}`.slice(0, 2_000),
            imageUrl: null,
            imageHash: null,
            textHash: createHash("sha256").update(`${hit.title}\n${hit.snippet}`).digest("hex"),
            capabilities: [field],
            reliability: Math.max(68, source?.capabilityScore ?? 0),
            component: null,
          };
          addUniqueEvidence(input.state, evidence);
          const claim: ResearchClaimRecord = {
            id: claimId(evidence.id, field, candidate.normalizedValue),
            runId: input.state.runId,
            taskId: input.task.id,
            subjectId: input.context.subjectId,
            gameId: input.context.catalogId,
            platformSlug: input.context.platformSlug,
            editionId: input.context.physicalEditionId,
            variantId: input.context.physicalVariant,
            component: null,
            field,
            value: candidate.normalizedValue,
            sourceId,
            sourceUrl: hit.url,
            evidenceId: evidence.id,
            confidence: 0.9,
            status: "CANDIDATE",
            validationErrors: [],
            createdAt: now(),
          };
          claim.validationErrors = validateClaimDeterministically(claim, input.context);
          addUniqueClaims(input.state, [claim]);
        }
      }
      traces.set(key, trace);
      input.state.identifierTraces = [...traces.values()];
    }
  }
  const newCandidate = [...traces.keys()].some((key) => !previous.has(key) && traces.get(key)?.validation === "VALID");
  return { newCandidate, exactProcessed };
}

function evidenceId(runId: string, sourceUrl: string, evidenceType: string, component: string | null): string {
  return `ev-${createHash("sha256").update(`${runId}\n${sourceUrl}\n${evidenceType}\n${component ?? ""}`).digest("hex").slice(0, 24)}`;
}

function claimId(evidenceIdValue: string, field: ResearchTargetField, value: unknown): string {
  return `cl-${createHash("sha256").update(`${evidenceIdValue}\n${field}\n${JSON.stringify(value)}`).digest("hex").slice(0, 24)}`;
}

function blankBinding() {
  return {
    game: "UNKNOWN" as const,
    platform: "UNKNOWN" as const,
    edition: "UNKNOWN" as const,
    variant: "UNKNOWN" as const,
    component: "UNKNOWN" as const,
    risks: [] as string[],
  };
}

function pageEvidence(input: {
  state: ResearchState;
  page: ResearchPage;
  task: DurableResearchTask;
  source: ResearchSourcePlanItem | null;
}): ResearchEvidenceRecord {
  const host = new URL(input.page.canonicalUrl).hostname.toLowerCase();
  const sourceId = input.source?.sourceId ?? `candidate:${host}`;
  return {
    id: evidenceId(input.state.runId, input.page.canonicalUrl, "PAGE_TEXT", null),
    runId: input.state.runId,
    taskId: input.task.id,
    sourceId,
    sourceUrl: input.page.canonicalUrl,
    canonicalUrl: input.page.canonicalUrl,
    sourceType: input.source?.roles[0] ?? "NEW_SOURCE_CANDIDATE",
    host,
    fetchedAt: input.page.fetchedAt,
    evidenceType: "PAGE_TEXT",
    subjectBinding: blankBinding(),
    relevantExcerpt: input.page.text.slice(0, 2_000) || null,
    imageUrl: null,
    imageHash: null,
    textHash: researchPageTextHash(input.page),
    capabilities: input.source && input.source.capabilityScore > 0 ? [input.task.targetField] : [],
    reliability: input.source?.capabilityScore ?? 0,
    component: null,
  };
}

function imageEvidence(input: {
  state: ResearchState;
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  source: ResearchSourcePlanItem | null;
  imageUrl: string;
  sourcePageUrl: string | null;
  result: ResearchVisionResult;
  ownScan: boolean;
  imageHash?: string | null;
  visionModel?: string | null;
}): ResearchEvidenceRecord {
  const sourceUrl = input.sourcePageUrl ?? input.imageUrl;
  let host: string | null = null;
  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    host = null;
  }
  const binding = bindEvidenceSubject({
    context: input.context,
    observedTitle: input.result.titleCandidate,
    observedPlatform: input.result.platformCandidate,
    observedEdition: input.result.editionCandidate,
    observedComponent: input.result.component,
    expectedComponent: null,
  });
  const subjectClass = input.result.subjectClass ?? (binding.game === "MATCH" && binding.platform === "MATCH" && binding.edition !== "MISMATCH" ? "EXACT_PRODUCT" : "RELATED_PRODUCT");
  const collector = /\b(?:skull|buccaneer|black chest|collector|double pack)\b/i.test(input.context.edition);
  const exactPhysical = !input.ownScan
    && input.result.imageQuality === "GOOD"
    && binding.game === "MATCH"
    && binding.platform === "MATCH"
    && (!collector || binding.edition === "MATCH")
    && input.result.component !== "UNKNOWN"
    && input.result.barcodeBinding !== "RETAILER_STICKER";
  return {
    id: evidenceId(input.state.runId, sourceUrl, input.ownScan ? "OWN_SCAN" : exactPhysical ? "EXACT_PHYSICAL_PHOTO" : "IMAGE_FROM_SOURCE_PAGE", input.result.component),
    runId: input.state.runId,
    taskId: input.task.id,
    sourceId: input.ownScan ? "regionatlas-own-scan" : input.source?.sourceId ?? `candidate:${host ?? "unknown"}`,
    sourceUrl,
    canonicalUrl: input.sourcePageUrl,
    sourceType: input.ownScan ? "OWN_SCAN" : input.source?.roles[0] ?? "NEW_SOURCE_CANDIDATE",
    host,
    fetchedAt: now(),
    evidenceType: input.ownScan ? "OWN_SCAN" : exactPhysical ? "EXACT_PHYSICAL_PHOTO" : "IMAGE_FROM_SOURCE_PAGE",
    subjectBinding: binding,
    relevantExcerpt: null,
    imageUrl: input.imageUrl,
    imageHash: input.imageHash ?? null,
    textHash: null,
    capabilities: input.ownScan ? [input.task.targetField] : input.source && input.source.capabilityScore > 0 ? [input.task.targetField] : [],
    reliability: input.ownScan ? 100 : exactPhysical ? 95 : Math.min(95, (input.source?.capabilityScore ?? 0) + 5),
    component: input.result.component,
    productNodeId: null,
    componentNodeId: null,
    bindingState: input.result.bindingState ?? "UNBOUND",
    marketBindingState: input.result.marketBindingState ?? "UNBOUND",
    subjectClass,
    editionClass: input.result.editionClass,
    visibleEditionMarker: input.result.visibleEditionMarker ?? null,
    sourcePageUrl: input.sourcePageUrl,
    originalImageUrl: input.imageUrl,
    resolvedImageUrl: input.imageUrl,
    sourceRecordId: sourceRecordIdFromUrl(input.imageUrl),
    listingId: input.sourcePageUrl ? sourceRecordIdFromUrl(input.sourcePageUrl) : null,
    platformClassification: input.result.platformCandidate,
    editionClassification: input.result.editionCandidate,
    marketEvidence: input.result.distributorText,
    languageEvidence: input.result.packagingLanguagesObserved,
    extractedIdentifiers: [
      ...input.result.barcodeCandidates.map((value) => ({ type: "BARCODE", value })),
      ...input.result.printedCodes.map((value) => ({ type: "PRINTED_CODE", value })),
    ],
    visionModel: input.visionModel ?? null,
    visionSchemaVersion: 1,
  };
}

export function claimsFromVision(input: {
  state: ResearchState;
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  evidence: ResearchEvidenceRecord;
  result: ResearchVisionResult;
}): ResearchClaimRecord[] {
  const values: unknown[] = [];
  const component = canonicalResearchComponent(input.result.component);
  const boxComponents = new Set(["OUTER_PACKAGE_BACK", "OUTER_PACKAGE_FRONT", "OUTER_PACKAGE_FLAP", "INNER_CASE_BACK", "INNER_CASE_FRONT"]);
  const mediumComponents = new Set(["CARTRIDGE_FRONT", "CARTRIDGE_BACK", "DISC"]);
  switch (input.task.targetField) {
    case "BARCODE":
      if (input.result.barcodeBinding !== "RETAILER_STICKER") values.push(...input.result.barcodeCandidates);
      break;
    case "BOX_CODE":
      if (boxComponents.has(component)) values.push(...input.result.printedCodes);
      break;
    case "SERIAL": values.push(...input.result.printedCodes); break;
    case "PRODUCT_CODE":
    case "MEDIA_ID":
      if (mediumComponents.has(component)) values.push(...input.result.printedCodes);
      break;
    case "PACKAGING_LANGUAGES": if (input.result.packagingLanguagesObserved.length) values.push(input.result.packagingLanguagesObserved); break;
    case "RATING": if (input.result.ratingMarks.length) values.push(input.result.ratingMarks); break;
    case "PHYSICAL_PRODUCT_TYPE":
      if (input.result.physicalContentAssessment === "DOWNLOAD_REQUIRED" || input.result.physicalContentAssessment === "PARTIAL_DOWNLOAD") values.push("PHYSICAL_DOWNLOAD_REQUIRED");
      if (input.result.physicalContentAssessment === "CODE_IN_BOX") values.push("CODE_IN_BOX");
      break;
    case "OUTER_INNER_RELATION":
      if (["OUTER_PRODUCT", "INNER_GAME"].includes(input.result.barcodeProductRole)) {
        values.push(...input.result.barcodeCandidates.map((identifier) => ({
          identifier,
          productRole: input.result.barcodeProductRole,
          barcodeBinding: input.result.barcodeBinding,
          observedTitle: input.result.titleCandidate,
        })));
      }
      break;
    default: break;
  }
  return values.map((value) => {
    const base: ResearchClaimRecord = {
      id: claimId(input.evidence.id, input.task.targetField, value),
      runId: input.state.runId,
      taskId: input.task.id,
      subjectId: input.context.subjectId,
      gameId: input.context.catalogId,
      platformSlug: input.context.platformSlug,
      editionId: input.context.physicalEditionId,
      variantId: input.context.physicalVariant,
      component,
      field: input.task.targetField,
      value,
      sourceId: input.evidence.sourceId,
      sourceUrl: input.evidence.sourceUrl,
      evidenceId: input.evidence.id,
      confidence: input.result.confidenceByField[input.task.targetField] ?? (input.result.imageQuality === "GOOD" ? 0.82 : 0.55),
      status: "CANDIDATE",
      validationErrors: [],
      createdAt: now(),
    };
    return { ...base, validationErrors: validateClaimDeterministically(base, input.context) };
  });
}

function registerPhysicalBinding(input: {
  state: ResearchState;
  context: ResearchCatalogContext;
  evidence: ResearchEvidenceRecord;
  result: ResearchVisionResult;
  claims: ResearchClaimRecord[];
}): void {
  const subjectClass = input.result.subjectClass ?? input.evidence.subjectClass ?? "UNREADABLE";
  const root = createProductNode({ label: `${input.context.title} · ${input.context.platformSlug} · ${input.context.edition}`, type: "PHYSICAL_PRODUCT" });
  const componentType = input.result.productNodeType
    ?? (input.result.barcodeProductRole === "OUTER_PRODUCT" ? "OUTER_PACKAGE"
      : input.result.barcodeProductRole === "INNER_GAME" ? "INNER_PRODUCT"
        : ["CARTRIDGE_FRONT", "CARTRIDGE_BACK", "DISC"].includes(canonicalResearchComponent(input.result.component)) ? "MEDIA"
          : ["MANUAL_FRONT", "MANUAL_BACK", "INSERT", "CODE_VOUCHER", "DOWNLOAD_CARD"].includes(canonicalResearchComponent(input.result.component)) ? "DOCUMENT"
            : ["STICKER", "SELLER_STICKER"].includes(canonicalResearchComponent(input.result.component)) ? "STICKER"
              : "OUTER_PACKAGE");
  const component = createProductNode({
    label: input.result.componentNodeLabel ?? `${componentType}:${canonicalResearchComponent(input.result.component)}`,
    type: componentType,
    component: input.result.component,
    parentProductId: root.id,
  });
  const relation = componentType === "MEDIA" ? "MEDIA_FOR"
    : componentType === "DOCUMENT" ? (canonicalResearchComponent(input.result.component) === "CODE_VOUCHER" || canonicalResearchComponent(input.result.component) === "DOWNLOAD_CARD" ? "VOUCHER_FOR" : "MANUAL_FOR")
      : componentType === "STICKER" ? "STICKER_ON"
        : componentType === "INNER_PRODUCT" ? "BUNDLES" : "WRAPS";
  const graph = mergeProductGraph({
    nodes: input.state.productNodes ?? [], relations: input.state.productRelations ?? [], nextNodes: [root, component],
    nextRelations: [{ fromNodeId: component.id, toNodeId: root.id, relation, evidenceIds: [input.evidence.id] }],
  });
  input.state.productNodes = graph.nodes;
  input.state.productRelations = graph.relations;
  input.evidence.productNodeId = root.id;
  input.evidence.componentNodeId = component.id;
  const extractedRows = input.claims.flatMap((claim) => typeof claim.value === "string"
    ? [{ type: claim.field, value: claim.value, validationErrors: claim.validationErrors }]
    : []);
  const seenValues = new Set(extractedRows.map((row) => `${row.type}:${row.value}`));
  for (const value of input.result.barcodeCandidates) {
    if (!seenValues.has(`BARCODE:${value}`)) extractedRows.push({
      type: "BARCODE", value,
      validationErrors: validateClaimDeterministically({ field: "BARCODE", value, component: input.result.component }, input.context),
    });
  }
  const bindings = extractedRows.map((row) => {
    const binding = identifierBinding({
      identifierType: row.type,
      value: row.value,
      component: input.result.component,
      productNodeId: root.id,
      componentNodeId: component.id,
      evidenceId: input.evidence.id,
      subjectClass,
    });
    return row.validationErrors.length ? { ...binding, state: "REJECTED" as const, rejectionReason: row.validationErrors.join(",") } : binding;
  });
  input.state.identifierBindings = [...new Map([...(input.state.identifierBindings ?? []), ...bindings]
    .map((row) => [`${row.identifierType}:${row.value}:${row.componentNodeId ?? ""}`, row])).values()];
  input.evidence.bindingState = subjectClass === "EXACT_PRODUCT" ? "PRODUCT_BOUND" : subjectClass === "UNREADABLE" ? "UNBOUND" : "REJECTED";
  const metric = input.state.physicalMetrics;
  if (metric) {
    const canonicalComponent = canonicalResearchComponent(input.result.component);
    metric.imagesInspected += 1;
    metric.imagesClassified += 1;
    if (subjectClass === "EXACT_PRODUCT") {
      metric.subjectAccepted += 1;
      metric.exactTargetImages += 1;
    } else {
      metric.rejectedImages += 1;
      if (subjectClass === "SAME_TITLE_DIFFERENT_EDITION") metric.wrongEditionImagesRejected += 1;
      else if (subjectClass === "SAME_TITLE_DIFFERENT_PLATFORM") metric.wrongPlatformImagesRejected += 1;
      else metric.ambiguousImagesRejected += 1;
    }
    if (canonicalComponent !== "UNKNOWN_COMPONENT") metric.componentAccepted += 1;
    if (canonicalComponent.startsWith("OUTER_PACKAGE_")) metric.outerPackageImages += 1;
    if (canonicalComponent.startsWith("INNER_CASE_")) metric.innerCaseImages += 1;
    if (canonicalComponent.startsWith("CARTRIDGE_")) metric.cartImages += 1;
    if (canonicalComponent === "DISC") metric.discImages += 1;
    if (canonicalComponent === "OUTER_PACKAGE_BACK" || canonicalComponent === "INNER_CASE_BACK") metric.backCoverImages += 1;
    metric.identifierExtractions += bindings.length;
    metric.productBindings += bindings.filter((row) => row.state === "PRODUCT_BOUND").length;
    metric.componentBoundClaims += input.claims.filter((row) => canonicalResearchComponent(row.component ?? "UNKNOWN_COMPONENT") !== "UNKNOWN_COMPONENT").length;
    metric.productBoundIdentifiers += bindings.filter((row) => row.state === "PRODUCT_BOUND").length;
    metric.unboundIdentifierCandidates += bindings.filter((row) => row.state === "UNBOUND").length;
    metric.sellerStickerIdentifiers += bindings.filter((row) => canonicalResearchComponent(row.component ?? "UNKNOWN_COMPONENT") === "SELLER_STICKER").length;
    if (input.evidence.marketBindingState === "MARKET_BOUND") metric.marketBoundClaims += input.claims.length;
  }
}

function mergeIdentifiers(state: ResearchState, values: Array<{ type: string; value: string; component: string | null }>): ResearchState["identifiersSeen"] {
  return [...new Map([...state.identifiersSeen, ...values].map((identifier) => [
    `${identifier.type}:${identifier.value}:${identifier.component ?? ""}`,
    { ...identifier, component: identifier.component as ResearchState["identifiersSeen"][number]["component"] },
  ])).values()];
}

function addUniqueEvidence(state: ResearchState, evidence: ResearchEvidenceRecord): void {
  const index = state.evidence.findIndex((row) => row.id === evidence.id);
  if (index >= 0) state.evidence[index] = evidence;
  else state.evidence.push(evidence);
}

function addUniqueClaims(state: ResearchState, claims: ResearchClaimRecord[]): void {
  const merged = new Map(state.claims.map((claim) => [claim.id, claim]));
  for (const claim of claims) merged.set(claim.id, claim);
  state.claims = [...merged.values()];
}

function claimIdentifiers(claims: ResearchClaimRecord[]): ResearchState["identifiersSeen"] {
  const identifierFields = new Set<ResearchTargetField>(["BARCODE", "BOX_CODE", "SERIAL", "PRODUCT_CODE", "MEDIA_ID", "XEMID"]);
  return claims.flatMap((claim) => identifierFields.has(claim.field)
    && typeof claim.value === "string"
    && claim.value.trim()
    && claim.validationErrors.length === 0
    ? [{ type: claim.field, value: claim.value.trim(), component: claim.component }]
    : []);
}

function recordUsage(state: ResearchState, usage: ResearchModelUsage): void {
  state.usage = recordModelUsage(recordBudgetUse(state.usage, "agentTurns"), usage);
}

function updateState(state: ResearchState, update: Partial<ResearchState>): void {
  Object.assign(state, update, { updatedAt: now() });
}

function routerInput(input: {
  context: ResearchCatalogContext;
  task: DurableResearchTask;
  state: ResearchState;
  knowledge: Awaited<ReturnType<typeof loadResearchKnowledge>>;
  knowledgePack?: import("./knowledge-pack").ResearchKnowledgePackV1;
}): ResearchRouterInput {
  return {
    catalogContext: input.context,
    targetField: input.task.targetField,
    knownIdentifiers: input.state.identifiersSeen,
    platformKnowledge: input.knowledge.platform,
    companyKnowledge: input.context.companyCredits,
    franchiseKnowledge: input.knowledge.franchiseRules,
    sourceKnowledge: input.knowledge.sources,
    playbooks: input.knowledge.playbooks,
    queryTemplates: input.knowledge.queryTemplates,
    legacyKnowledge: input.knowledge.legacyEntries,
    currentClaims: input.state.claims,
    currentConflicts: input.state.conflicts,
    evidenceGaps: input.state.evidenceGaps ?? [],
    researchMode: input.state.researchMode ?? "STANDARD",
    coverageBucket: input.task.coverageBucket ?? null,
    regionalTitleCandidates: input.task.regionalTitleCandidates ?? [],
    knowledgePack: input.knowledgePack,
  };
}

async function persist(store: ResearchRunStore, state: ResearchState): Promise<void> {
  await store.writeState(state);
}

async function inspectOwnedScans(input: {
  context: ResearchCatalogContext;
  task: DurableResearchTask;
  state: ResearchState;
  plan: ResearchRouterPlan;
  visionProvider: ResearchVisionProvider | null;
  store: ResearchRunStore;
  visionResults: ResearchWorkerResult["visionResults"];
  modelUsages: ResearchModelUsage[];
}): Promise<boolean> {
  if (!input.context.ownedScans.length) return false;
  for (const scan of input.context.ownedScans) {
    const deterministicValue = input.task.targetField === "BARCODE"
      ? scan.barcode
      : input.task.targetField === "BOX_CODE"
        ? scan.boxCode
        : input.task.targetField === "PACKAGING_LANGUAGES" && scan.packagingLanguages.length
          ? scan.packagingLanguages
          : null;
    if (deterministicValue !== null) {
      const image = scan.images[0]?.url ? absoluteOwnedScanUrl(scan.images[0].url) : null;
      const ownedImageHash = image ? await fetchImageContentHash(image) : null;
      const evidence: ResearchEvidenceRecord = {
        id: evidenceId(input.state.runId, image ?? `owned-scan:${scan.catalogId}`, "OWN_SCAN", null),
        runId: input.state.runId,
        taskId: input.task.id,
        sourceId: "regionatlas-own-scan",
        sourceUrl: image,
        canonicalUrl: null,
        sourceType: "OWN_SCAN",
        host: "regionatlas.games",
        fetchedAt: scan.capturedAt,
        evidenceType: "OWN_SCAN",
        subjectBinding: { game: "MATCH", platform: "MATCH", edition: "UNKNOWN", variant: "UNKNOWN", component: "UNKNOWN", risks: [] },
        relevantExcerpt: `Owned scan metadata for ${scan.sourceLabel}.`,
        imageUrl: image,
        imageHash: ownedImageHash,
        textHash: null,
        capabilities: [input.task.targetField],
        reliability: 100,
        component: null,
      };
      const base: ResearchClaimRecord = {
        id: claimId(evidence.id, input.task.targetField, deterministicValue),
        runId: input.state.runId,
        taskId: input.task.id,
        subjectId: input.context.subjectId,
        gameId: input.context.catalogId,
        platformSlug: input.context.platformSlug,
        editionId: input.context.physicalEditionId,
        variantId: input.context.physicalVariant,
        component: null,
        field: input.task.targetField,
        value: deterministicValue,
        sourceId: evidence.sourceId,
        sourceUrl: evidence.sourceUrl,
        evidenceId: evidence.id,
        confidence: 1,
        status: "CANDIDATE",
        validationErrors: [],
        createdAt: now(),
      };
      addUniqueEvidence(input.state, evidence);
      addUniqueClaims(input.state, [{ ...base, validationErrors: validateClaimDeterministically(base, input.context) }]);
      await persist(input.store, input.state);
      const resolved = resolveResearchClaimRecords({ field: input.task.targetField, claims: input.state.claims, evidence: input.state.evidence });
      input.state.claims = resolved.claims;
      input.state.conflicts = [...new Map([...input.state.conflicts, ...resolved.conflicts].map((conflict) => [conflict.id, conflict])).values()];
      if (resolved.resolution.status === "CONFIRMED") return true;
    }
    if (!input.visionProvider || !input.plan.imagePlan.length) continue;
    for (const image of scan.images) {
      const imageUrl = absoluteOwnedScanUrl(image.url);
      if (!budgetAllows(input.state.budget, input.state.usage, "images") || !hasTokenReserve(input.state, VISION_TOKEN_RESERVE) || input.state.urlsVisited.includes(imageUrl)) return false;
      const requested = input.plan.imagePlan.flatMap((row) => row.fields);
      updateState(input.state, { status: "INSPECTING_IMAGES", urlsVisited: [...input.state.urlsVisited, imageUrl] });
      const inspected = await input.visionProvider.inspect({
        imageUrl,
        requestedFields: requested,
        expected: { title: input.context.title, platform: input.context.platformSlug, edition: input.context.edition, region: input.context.region },
        sourceContext: { pageTitle: scan.sourceLabel, pageUrl: null, imageLabel: image.label },
      });
      input.state.usage = recordBudgetUse(input.state.usage, "images");
      recordUsage(input.state, inspected.usage);
      input.modelUsages.push(inspected.usage);
      input.visionResults.push({ imageUrl, result: inspected.result, usage: inspected.usage });
      const imageHash = await fetchImageContentHash(imageUrl);
      const evidence = imageEvidence({
        state: input.state,
        task: input.task,
        context: input.context,
        source: input.plan.sourcePlan.find((source) => source.sourceId === "regionatlas-own-scan") ?? null,
        imageUrl,
        sourcePageUrl: null,
        result: inspected.result,
        ownScan: true,
        imageHash,
        visionModel: inspected.usage.model,
      });
      addUniqueEvidence(input.state, evidence);
      const claims = claimsFromVision({ state: input.state, task: input.task, context: input.context, evidence, result: inspected.result });
      addUniqueClaims(input.state, claims);
      registerPhysicalBinding({ state: input.state, context: input.context, evidence, result: inspected.result, claims });
      await persist(input.store, input.state);
      const resolved = resolveResearchClaimRecords({ field: input.task.targetField, claims: input.state.claims, evidence: input.state.evidence });
      input.state.claims = resolved.claims;
      input.state.conflicts = [...new Map([...input.state.conflicts, ...resolved.conflicts].map((conflict) => [conflict.id, conflict])).values()];
      if (resolved.resolution.status === "CONFIRMED") return true;
    }
  }
  return false;
}

async function fetchWithFallback(input: {
  url: string;
  source: ResearchSourcePlanItem | null;
  state: ResearchState;
  pageFetcher: ResearchPageFetcher;
  browserProvider: ResearchBrowserProvider | null;
  technicalFailures: TechnicalFailure[];
}): Promise<{ page: ResearchPage; mode: PageArtifact["mode"] }> {
  const directAllowed = input.source?.accessModes.includes("DIRECT_FETCH") ?? true;
  let directError: unknown = new Error("DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE");
  if (directAllowed) {
    const maxRetries = Math.max(0, Math.min(2, Number(process.env.RESEARCH_PAGE_TECHNICAL_RETRIES ?? 1)));
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const page = await input.pageFetcher.fetch(input.url);
        for (const failure of input.technicalFailures.filter((row) => row.operation === "DIRECT_FETCH" && row.target === input.url)) failure.recovered = true;
        return { page, mode: "DIRECT_FETCH" };
      } catch (error) {
        directError = error;
        const code = classifyRetrievalFailure(error);
        input.technicalFailures.push({ operation: "DIRECT_FETCH", target: input.url, code, detail: safeRetrievalDetail(error), recovered: false });
        if (attempt >= maxRetries || !isRetryableRetrievalFailure(code)) break;
        await boundedBackoff(attempt + 1);
      }
    }
  }
  const browserAllowed = input.source?.accessModes.includes("BROWSER") ?? true;
  if (!input.browserProvider || !browserAllowed || !budgetAllows(input.state.budget, input.state.usage, "browserSessions")) throw directError;
  input.state.usage = recordBudgetUse(input.state.usage, "browserSessions");
  let rendered;
  try {
    rendered = await input.browserProvider.browse(input.url);
    for (const failure of input.technicalFailures.filter((row) => row.target === input.url)) failure.recovered = true;
  } catch (error) {
    input.technicalFailures.push({ operation: "BROWSER", target: input.url, code: classifyRetrievalFailure(error), detail: safeRetrievalDetail(error), recovered: false });
    throw error;
  }
  return {
    mode: "BROWSER",
    page: {
      requestedUrl: input.url,
      canonicalUrl: rendered.url,
        status: rendered.status,
      title: rendered.title,
      text: rendered.text,
      language: null,
      structuredData: [],
      links: rendered.links,
      imageCandidates: rendered.images,
      fetchedAt: now(),
      contentType: "text/html; rendered=browser",
      bytes: new TextEncoder().encode(rendered.text).byteLength,
    },
  };
}

async function processPage(input: {
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  state: ResearchState;
  plan: ResearchRouterPlan;
  page: ResearchPage;
  source: ResearchSourcePlanItem | null;
  llmProvider: ResearchLlmProvider | null;
  store: ResearchRunStore;
  modelUsages: ResearchModelUsage[];
}): Promise<boolean> {
  const evidence = pageEvidence({ state: input.state, page: input.page, task: input.task, source: input.source });
  addUniqueEvidence(input.state, evidence);
  if (!input.llmProvider || !budgetAllows(input.state.budget, input.state.usage, "agentTurns") || !hasTokenReserve(input.state, LLM_TOKEN_RESERVE)) {
    await persist(input.store, input.state);
    return false;
  }
  const extraction = await input.llmProvider.extract({
    context: input.context,
    targetField: input.task.targetField,
    sourceId: evidence.sourceId,
    sourceUrl: input.page.canonicalUrl,
    text: input.page.text,
    allowedNextActions: input.plan.escalationRules,
  });
  recordUsage(input.state, extraction.usage);
  input.modelUsages.push(extraction.usage);
  evidence.subjectBinding = bindEvidenceSubject({
    context: input.context,
    observedTitle: extraction.observedSubject.title,
    observedPlatform: extraction.observedSubject.platform,
    observedEdition: extraction.observedSubject.edition,
    observedVariant: extraction.observedSubject.variant,
  });
  const pageInResearchScope = searchResultMatchesResearchScope({
    hit: {
      title: input.page.title,
      snippet: input.page.text.slice(0, 8_000),
      url: input.page.canonicalUrl,
      host: (() => { try { return new URL(input.page.canonicalUrl).hostname; } catch { return "unknown"; } })(),
      rank: 1,
      publishedAt: null,
      provider: "opened-page",
    },
    context: input.context,
    coverageBucket: input.task.coverageBucket,
  });
  const previousIdentifiers = [...input.state.identifiersSeen];
  const extractedIdentifiers = extraction.identifiers.filter((identifier) => {
    if (!pageInResearchScope && input.task.researchMode === "WORLDWIDE_VARIANT_DISCOVERY") return false;
    if (!["BARCODE", "BOX_CODE", "SERIAL", "PRODUCT_CODE", "MEDIA_ID", "XEMID"].includes(identifier.type)) return false;
    if (/\b(?:unknown|unresolved|pending|pendiente|aucune id[eé]e)\b/i.test(identifier.value)) return false;
    const probe = { field: identifier.type as ResearchTargetField, value: identifier.value, component: identifier.component };
    return validateClaimDeterministically(probe, input.context).length === 0;
  });
  input.state.identifiersSeen = mergeIdentifiers(input.state, extractedIdentifiers);
  const claims = extraction.claims
    .filter((claim) => claim.field === input.task.targetField)
    .filter(() => pageInResearchScope || input.task.researchMode !== "WORLDWIDE_VARIANT_DISCOVERY")
    .map((claim): ResearchClaimRecord => {
      const base: ResearchClaimRecord = {
        id: claimId(evidence.id, claim.field, claim.value),
        runId: input.state.runId,
        taskId: input.task.id,
        subjectId: input.context.subjectId,
        gameId: input.context.catalogId,
        platformSlug: input.context.platformSlug,
        editionId: input.context.physicalEditionId,
        variantId: input.context.physicalVariant,
        component: claim.component,
        field: claim.field,
        value: claim.value,
        sourceId: evidence.sourceId,
        sourceUrl: evidence.sourceUrl,
        evidenceId: evidence.id,
        confidence: claim.confidence,
        status: "CANDIDATE",
        validationErrors: [],
        createdAt: now(),
      };
      return { ...base, validationErrors: validateClaimDeterministically(base, input.context) };
    });
  addUniqueEvidence(input.state, { ...evidence, relevantExcerpt: claims[0] ? extraction.claims[0]?.excerpt ?? evidence.relevantExcerpt : evidence.relevantExcerpt });
  addUniqueClaims(input.state, claims);
  input.state.identifiersSeen = mergeIdentifiers(input.state, claimIdentifiers(claims));
  updateState(input.state, { lastDecision: extraction.nextAction, reasoningSummary: extraction.reasoningSummary });
  await persist(input.store, input.state);
  return shouldDynamicallyReplan(previousIdentifiers, input.state.identifiersSeen);
}

async function inspectDiscoveredImages(input: {
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  state: ResearchState;
  plan: ResearchRouterPlan;
  imageSearchProvider: ResearchImageSearchProvider | null;
  visionProvider: ResearchVisionProvider | null;
  pageFetcher: ResearchPageFetcher;
  browserProvider: ResearchBrowserProvider | null;
  store: ResearchRunStore;
  pages: PageArtifact[];
  images: ResearchImageSearchResult[];
  visionResults: ResearchWorkerResult["visionResults"];
  modelUsages: ResearchModelUsage[];
  technicalFailures: TechnicalFailure[];
}): Promise<boolean> {
  if (!input.imageSearchProvider || !input.visionProvider || !input.plan.imagePlan.length) return false;
  if (!budgetAllows(input.state.budget, input.state.usage, "searches") || !budgetAllows(input.state.budget, input.state.usage, "images") || !hasTokenReserve(input.state, VISION_TOKEN_RESERVE)) return false;
  const previousIdentifiers = [...input.state.identifiersSeen];
  const component = input.plan.imagePlan[0]?.component ?? "UNKNOWN";
  const visualCue = input.task.targetField === "PHYSICAL_PRODUCT_TYPE" ? '"back cover"'
    : ["BACK", "BOX_BACK", "OUTER_PACKAGE_BACK", "INNER_CASE_BACK"].includes(component) ? '"back cover" barcode'
    : ["BOX_FLAPS", "OUTER_PACKAGE_FLAP"].includes(component) ? '"box code" packaging'
      : ["CART_FRONT", "CARTRIDGE_FRONT"].includes(component) ? 'cartridge label "product code"'
        : "physical packaging";
  const platformLabel: Record<string, string> = { ds: "Nintendo DS", "3ds": "Nintendo 3DS", wiiu: "Wii U", switch: "Nintendo Switch", ps3: "PlayStation 3", ps4: "PlayStation 4", ps5: "PlayStation 5", xbox360: "Xbox 360" };
  const region = input.context.marketRegions.join(" ") || input.context.region || input.context.edition;
  const imageQuery = `"${input.context.title}" "${platformLabel[input.context.platformSlug] ?? input.context.platformSlug}" ${region ? `"${region}" ` : ""}${visualCue}`;
  input.state.usage = recordBudgetUse(input.state.usage, "searches");
  input.state.queriesAttempted.push(imageQuery);
  input.state.normalizedQueries.push(normalizedQuery(imageQuery));
  let found: ResearchImageSearchResult[];
  try {
    found = await input.imageSearchProvider.search({ query: imageQuery, maxResults: 4, country: "ES", language: "es" });
  } catch (error) {
    input.technicalFailures.push({ operation: "IMAGE_SEARCH", target: imageQuery, code: classifyRetrievalFailure(error), detail: safeRetrievalDetail(error), recovered: false });
    input.state.rejectedHypotheses.push({
      value: imageQuery,
      reason: error instanceof Error ? error.message.slice(0, 300) : "IMAGE_SEARCH_FAILED",
    });
    await persist(input.store, input.state);
    return false;
  }
  const relevant = found
    .filter((image) => imageResultLooksRelevant(image, input.context, input.task.targetField))
    .sort((left, right) => imageTargetScore(right, input.task.targetField) - imageTargetScore(left, input.task.targetField));
  input.images.push(...relevant);
  const sourcePages = [...new Map(relevant.filter((image) => image.sourcePageUrl).map((image) => [image.sourcePageUrl!, image])).values()].slice(0, 2);
  for (const image of sourcePages) {
    const sourcePageUrl = image.sourcePageUrl!;
    if (input.state.urlsVisited.includes(sourcePageUrl) || !budgetAllows(input.state.budget, input.state.usage, "pages")) continue;
    const source = sourceForUrl(sourcePageUrl, input.plan);
    updateState(input.state, { status: "READING", urlsVisited: [...input.state.urlsVisited, sourcePageUrl] });
    try {
      const fetched = await fetchWithFallback({
        url: sourcePageUrl,
        source,
        state: input.state,
        pageFetcher: input.pageFetcher,
        browserProvider: input.browserProvider,
        technicalFailures: input.technicalFailures,
      });
      input.state.usage = recordBudgetUse(input.state.usage, "pages");
      input.pages.push(pageArtifact(fetched.page, fetched.mode));
      const inspectedBefore = input.visionResults.length;
      const galleryReplan = await inspectPageImages({
        task: input.task, context: input.context, state: input.state, plan: input.plan, page: fetched.page, source,
        visionProvider: input.visionProvider, store: input.store, images: input.images, visionResults: input.visionResults,
        modelUsages: input.modelUsages, technicalFailures: input.technicalFailures,
      });
      if (input.visionResults.length > inspectedBefore) recoverPhysicalRouteFallbacks(input.technicalFailures);
      if (galleryReplan) return true;
    } catch (error) {
      input.state.rejectedHypotheses.push({ value: sourcePageUrl, reason: `GALLERY_PAGE_UNAVAILABLE: ${safeRetrievalDetail(error)}` });
    }
  }
  for (const image of relevant.slice(0, 2)) {
    if (!image.sourcePageUrl || canonicalImageUrl(image.imageUrl) === canonicalImageUrl(image.sourcePageUrl)
      || input.state.urlsVisited.includes(image.imageUrl) || !budgetAllows(input.state.budget, input.state.usage, "images") || !hasTokenReserve(input.state, VISION_TOKEN_RESERVE)) continue;
    const source = sourceForUrl(image.sourcePageUrl, input.plan);
    updateState(input.state, { status: "INSPECTING_IMAGES", urlsVisited: [...input.state.urlsVisited, image.imageUrl] });
    try {
      const inspectionUrl = image.imageUrl;
      const imageHash = await fetchImageContentHash(inspectionUrl);
      if (imageHash && input.state.evidence.some((row) => row.imageHash === imageHash)) {
        if (input.state.physicalMetrics) input.state.physicalMetrics.duplicateImages += 1;
        continue;
      }
      const inspected = await input.visionProvider.inspect({
        imageUrl: inspectionUrl,
        componentHint: input.plan.imagePlan[0]?.component,
        requestedFields: input.plan.imagePlan.flatMap((row) => row.fields),
        expected: { title: input.context.title, platform: input.context.platformSlug, edition: input.context.edition, region: input.context.region },
        sourceContext: { pageTitle: image.title, pageUrl: image.sourcePageUrl, imageLabel: image.title },
      });
      input.state.usage = recordBudgetUse(input.state.usage, "images");
      recordUsage(input.state, inspected.usage);
      input.modelUsages.push(inspected.usage);
      input.visionResults.push({ imageUrl: inspectionUrl, result: inspected.result, usage: inspected.usage });
      const evidence = imageEvidence({
        state: input.state,
        task: input.task,
        context: input.context,
        source,
        imageUrl: image.imageUrl,
        sourcePageUrl: image.sourcePageUrl,
        result: inspected.result,
        ownScan: false,
        imageHash,
        visionModel: inspected.usage.model,
      });
      addUniqueEvidence(input.state, evidence);
      const claims = claimsFromVision({ state: input.state, task: input.task, context: input.context, evidence, result: inspected.result });
      addUniqueClaims(input.state, claims);
      registerPhysicalBinding({ state: input.state, context: input.context, evidence, result: inspected.result, claims });
      input.state.identifiersSeen = mergeIdentifiers(input.state, claimIdentifiers(claims));
      if (image.sourcePageUrl) recoverSourceAttempt(input.technicalFailures, image.sourcePageUrl);
      recoverPhysicalRouteFallbacks(input.technicalFailures);
    } catch (error) {
      input.technicalFailures.push({ operation: "IMAGE_INSPECTION", target: image.imageUrl, code: classifyRetrievalFailure(error), detail: safeRetrievalDetail(error), recovered: false });
    }
    await persist(input.store, input.state);
  }
  return shouldDynamicallyReplan(previousIdentifiers, input.state.identifiersSeen);
}

async function inspectPageImages(input: {
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  state: ResearchState;
  plan: ResearchRouterPlan;
  page: ResearchPage;
  source: ResearchSourcePlanItem | null;
  visionProvider: ResearchVisionProvider | null;
  store: ResearchRunStore;
  images: ResearchImageSearchResult[];
  visionResults: ResearchWorkerResult["visionResults"];
  modelUsages: ResearchModelUsage[];
  technicalFailures: TechnicalFailure[];
}): Promise<boolean> {
  if (!input.visionProvider || !input.plan.imagePlan.length) return false;
  const previousIdentifiers = [...input.state.identifiersSeen];
  const requiredScore = input.plan.imagePlan.some((row) => ["BACK", "BOX_BACK", "OUTER_PACKAGE_BACK", "INNER_CASE_BACK"].includes(row.component)) ? 8 : 4;
  if (input.state.physicalMetrics && input.page.imageCandidates.length) {
    input.state.physicalMetrics.galleriesOpened += 1;
    input.state.physicalMetrics.galleryPagesOpened += 1;
    input.state.physicalMetrics.imagesDiscovered += input.page.imageCandidates.length;
    input.state.physicalMetrics.imageCandidatesDiscovered += input.page.imageCandidates.length;
    input.state.physicalMetrics.originalImagesResolved += input.page.imageCandidates.filter((row) => Boolean(row.originalUrl)).length;
  }
  const ranked = input.page.imageCandidates
    .filter((candidate) => /^https?:\/\//i.test(candidate.resolvedUrl || candidate.url))
    .map((candidate) => ({ candidate, score: packagingImageScore(candidate) }))
    .filter((row) => row.score >= requiredScore)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.candidate)
    .slice(0, 3);
  for (const [index, candidate] of ranked.entries()) {
    const inspectionUrl = candidate.originalUrl ?? candidate.resolvedUrl ?? candidate.url;
    if (input.state.urlsVisited.includes(inspectionUrl) || !budgetAllows(input.state.budget, input.state.usage, "images") || !hasTokenReserve(input.state, VISION_TOKEN_RESERVE)) continue;
    input.images.push({ imageUrl: inspectionUrl, thumbnailUrl: candidate.thumbnailUrl, sourcePageUrl: input.page.canonicalUrl, title: candidate.galleryLabel ?? candidate.alt ?? candidate.caption ?? input.page.title, host: new URL(input.page.canonicalUrl).hostname, rank: index + 1 });
    updateState(input.state, { status: "INSPECTING_IMAGES", urlsVisited: [...input.state.urlsVisited, inspectionUrl] });
    try {
      const imageHash = await fetchImageContentHash(inspectionUrl);
      if (imageHash && input.state.evidence.some((row) => row.imageHash === imageHash)) {
        if (input.state.physicalMetrics) input.state.physicalMetrics.duplicateImages += 1;
        continue;
      }
      const inspected = await input.visionProvider.inspect({
        imageUrl: inspectionUrl,
        componentHint: input.plan.imagePlan[0]?.component,
        requestedFields: input.plan.imagePlan.flatMap((row) => row.fields),
        expected: { title: input.context.title, platform: input.context.platformSlug, edition: input.context.edition, region: input.context.region },
        sourceContext: { pageTitle: input.page.title, pageUrl: input.page.canonicalUrl, imageLabel: candidate.galleryLabel ?? candidate.alt ?? candidate.caption },
      });
      input.state.usage = recordBudgetUse(input.state.usage, "images");
      if (candidate.originalUrl && input.state.physicalMetrics) input.state.physicalMetrics.fullResolutionImagesFetched += 1;
      recordUsage(input.state, inspected.usage);
      input.modelUsages.push(inspected.usage);
      input.visionResults.push({ imageUrl: inspectionUrl, result: inspected.result, usage: inspected.usage });
      const evidence = imageEvidence({ state: input.state, task: input.task, context: input.context, source: input.source, imageUrl: inspectionUrl, sourcePageUrl: input.page.canonicalUrl, result: inspected.result, ownScan: false, imageHash, visionModel: inspected.usage.model });
      addUniqueEvidence(input.state, evidence);
      const claims = claimsFromVision({ state: input.state, task: input.task, context: input.context, evidence, result: inspected.result });
      addUniqueClaims(input.state, claims);
      registerPhysicalBinding({ state: input.state, context: input.context, evidence, result: inspected.result, claims });
      input.state.identifiersSeen = mergeIdentifiers(input.state, claimIdentifiers(claims));
    } catch (error) {
      input.technicalFailures.push({ operation: "IMAGE_INSPECTION", target: inspectionUrl, code: classifyRetrievalFailure(error), detail: safeRetrievalDetail(error), recovered: false });
    }
    await persist(input.store, input.state);
  }
  return shouldDynamicallyReplan(previousIdentifiers, input.state.identifiersSeen);
}

function pageArtifact(page: ResearchPage, mode: PageArtifact["mode"]): PageArtifact {
  return {
    requestedUrl: page.requestedUrl,
    canonicalUrl: page.canonicalUrl,
    status: page.status,
    title: page.title,
    language: page.language,
    contentType: page.contentType,
    bytes: page.bytes,
    fetchedAt: page.fetchedAt,
    textHash: researchPageTextHash(page),
    excerpt: page.text.slice(0, 2_000),
    linkCount: page.links.length,
    imageCount: page.imageCandidates.length,
    imageCandidates: page.imageCandidates,
    mode,
  };
}

function sourceCandidates(state: ResearchState): ResearchWorkerResult["sourceCandidates"] {
  const candidates = new Map<string, { host: string; sampleUrls: string[]; fieldsObserved: ResearchTargetField[]; status: "PENDING_SOURCE_REVIEW" }>();
  for (const evidence of state.evidence.filter((item) => item.sourceId.startsWith("candidate:") && item.host)) {
    const current = candidates.get(evidence.host!) ?? { host: evidence.host!, sampleUrls: [], fieldsObserved: [], status: "PENDING_SOURCE_REVIEW" };
    if (evidence.sourceUrl) current.sampleUrls.push(evidence.sourceUrl);
    current.fieldsObserved.push(...evidence.capabilities);
    current.fieldsObserved.push(...state.claims.filter((claim) => claim.evidenceId === evidence.id).map((claim) => claim.field));
    current.sampleUrls = [...new Set(current.sampleUrls)].slice(0, 8);
    current.fieldsObserved = [...new Set(current.fieldsObserved)];
    candidates.set(current.host, current);
  }
  return [...candidates.values()];
}

function executedQueries(state: ResearchState, plans: ResearchRouterPlan[]) {
  const planned = new Map<string, ResearchRouterPlan["queryPlan"][number]>();
  for (const plan of plans) {
    for (const row of plan.queryPlan) planned.set(normalizedQuery(row.query), row);
  }
  return state.queriesAttempted.map((query) => {
    const match = planned.get(normalizedQuery(query));
    return {
      query,
      strategy: match?.strategy ?? "IMAGE",
      sourceId: match?.sourceId ?? null,
      identifierType: match?.identifierType ?? null,
      identifierValue: match?.identifierValue ?? null,
      stage: match?.stage ?? null,
      coverageBucket: match?.coverageBucket ?? null,
    };
  });
}

function searchExhaustion(input: {
  state: ResearchState;
  context: ResearchCatalogContext;
  task: DurableResearchTask;
  plans: ResearchRouterPlan[];
  technicalFailures: TechnicalFailure[];
}) {
  const executions = executedQueries(input.state, input.plans);
  const attemptedStages = executions.map((row) => row.stage).filter((stage): stage is ResearchQueryStage => Boolean(stage));
  const validTraces = (input.state.identifierTraces ?? []).filter((trace) => trace.validation === "VALID");
  const required = requiredExhaustionStages({
    worldwide: input.state.researchMode === "WORLDWIDE_VARIANT_DISCOVERY",
    candidatesFound: validTraces.length,
    regionalTitleCandidates: input.task.regionalTitleCandidates?.length ?? 0,
  });
  const missingStages = missingExhaustionStages(required, attemptedStages);
  const unrecovered = input.technicalFailures.filter((failure) => !failure.recovered);
  const exhaustionStatus = unrecovered.length
    ? "BLOCKED_BY_TECHNICAL_FAILURE" as const
    : missingStages.length ? "INCOMPLETE" as const : "COMPLETE" as const;
  return {
    field: input.task.targetField,
    initialKnowledge: knownValuesForTarget(input.context, input.task.targetField),
    queriesAttempted: [...input.state.queriesAttempted],
    sourcesReached: [...new Set(input.state.evidence.map((row) => row.sourceId))],
    candidatesFound: validTraces.map((trace) => trace.normalizedValue),
    exactIdentifierQueries: executions.filter((row) => row.strategy === "EXACT_IDENTIFIER").map((row) => row.query),
    corroborations: validTraces.filter((trace) => trace.finalStatus === "CORROBORATED").map((trace) => trace.normalizedValue),
    rejections: (input.state.identifierTraces ?? []).filter((trace) => trace.finalStatus === "REJECTED").map((trace) => `${trace.normalizedValue}:${trace.rejectionReason ?? "REJECTED"}`),
    hardConflicts: input.state.conflicts.filter((conflict) => conflict.reason === "HARD_IDENTIFIER_SUBJECT_CONFLICT").map((conflict) => String(conflict.values[0] ?? "unknown")),
    technicalFailures: unrecovered.map((failure) => `${failure.operation}:${failure.target}:${failure.code}`),
    regionalFallbackAttempted: attemptedStages.includes("REGIONAL_FALLBACK"),
    localLanguageFallbackAttempted: attemptedStages.includes("LOCAL_LANGUAGE_FALLBACK"),
    finalStatus: input.state.status,
    exhaustionStatus,
    missingStages,
  };
}

function evidenceGap(input: { state: ResearchState; resolution: ResearchFieldResolution; plans: ResearchRouterPlan[] }) {
  if (input.resolution.status === "CONFIRMED") return null;
  const field = input.resolution.field;
  const missingProof: Partial<Record<ResearchTargetField, string>> = {
    BARCODE: "Exact subject/edition binding plus a second authoritative source or readable component-bound photo.",
    BOX_CODE: "Readable code on the exact box component; a cart or manual code is not equivalent.",
    PRODUCT_CODE: "Platform-valid code on the exact cartridge/disc or an exact technical database record.",
    PHYSICAL_PRODUCT_TYPE: "Exact-platform back-cover, unboxing, or technical evidence stating cart/download/code distribution.",
    OUTER_INNER_RELATION: "Each identifier bound separately to the outer product or named inner product.",
    CANONICAL_IDENTITY: "Exact title, platform, edition, and variant agreement from an authoritative or independent source.",
  };
  const last = input.plans.at(-1);
  return createEvidenceGap({
    field,
    candidateValue: input.resolution.value,
    missingProof: missingProof[field] ?? "Additional independently bound evidence meeting the field confirmation threshold.",
    recommendedSourceTypes: (last?.sourcePlan ?? []).filter((source) => source.capabilityScore > 0).slice(0, 5).map((source) => source.sourceId),
  });
}

function activatePhysicalEvidenceMode(state: ResearchState, resolution: ResearchFieldResolution, plans: ResearchRouterPlan[]): boolean {
  const gap = evidenceGap({ state, resolution, plans });
  if (!gap) return false;
  const existed = (state.evidenceGaps ?? []).some((row) => row.field === gap.field && row.type === gap.type);
  state.evidenceGaps = [...new Map([...(state.evidenceGaps ?? []), gap].map((row) => [`${row.field}:${row.type}`, row])).values()];
  state.nextEvidenceNeeded = [...new Set([...state.nextEvidenceNeeded, ...gap.recommendedActions])];
  if (!isPhysicalEvidenceGap(gap) || state.researchMode !== "STANDARD") return !existed;
  const at = now();
  state.modeTransitions = [...(state.modeTransitions ?? []), { at, from: state.researchMode ?? "STANDARD", to: "PHYSICAL_EVIDENCE_MODE", reason: gap.missingProof, gapType: gap.type }];
  state.researchMode = "PHYSICAL_EVIDENCE_MODE";
  if (state.physicalMetrics) state.physicalMetrics.physicalEvidenceModeEntries += 1;
  return true;
}

async function writeArtifacts(input: {
  store: ResearchRunStore;
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  state: ResearchState;
  plans: ResearchRouterPlan[];
  searchResults: ResearchSearchResult[];
  pages: PageArtifact[];
  images: ResearchImageSearchResult[];
  visionResults: ResearchWorkerResult["visionResults"];
  resolution: ResearchFieldResolution;
  modelUsages: ResearchModelUsage[];
  providerUsage: Record<string, number>;
  providerHealth: ResearchWorkerResult["providerHealth"];
  retrievalEvents: ResearchRetrievalEvent[];
  technicalFailures: TechnicalFailure[];
  durationMs: number;
}): Promise<void> {
  const { store, state } = input;
  const queryExecution = executedQueries(state, input.plans);
  const gap = evidenceGap(input);
  const pageImageCandidates = input.pages.flatMap((page) => page.imageCandidates);
  const evidenceImages = state.evidence.filter((row) => row.imageUrl).map((row) => ({
    evidenceId: row.id,
    sourcePageUrl: row.sourcePageUrl ?? row.canonicalUrl,
    originalUrl: row.originalImageUrl ?? row.imageUrl,
    resolvedUrl: row.resolvedImageUrl ?? row.imageUrl,
    contentHash: row.imageHash,
    sourceId: row.sourceId,
    sourceRecordId: row.sourceRecordId ?? (row.imageUrl ? sourceRecordIdFromUrl(row.imageUrl) : null),
    listingId: row.listingId ?? (row.sourceUrl ? sourceRecordIdFromUrl(row.sourceUrl) : null),
    subjectClass: row.subjectClass ?? "UNREADABLE",
    component: row.component,
    marketBindingState: row.marketBindingState ?? "UNBOUND",
    bindingState: row.bindingState ?? "UNBOUND",
    productNodeId: row.productNodeId ?? null,
    componentNodeId: row.componentNodeId ?? null,
    platformClassification: row.platformClassification ?? null,
    editionClassification: row.editionClassification ?? null,
    editionClass: row.editionClass ?? "UNKNOWN",
    visibleEditionMarker: row.visibleEditionMarker ?? null,
    marketEvidence: row.marketEvidence ?? [],
    languageEvidence: row.languageEvidence ?? [],
    extractedIdentifiers: row.extractedIdentifiers ?? [],
    model: row.visionModel ?? input.modelUsages.filter((usage) => usage.model).at(-1)?.model ?? null,
    schemaVersion: row.visionSchemaVersion ?? 1,
  }));
  await Promise.all([
    store.writeArtifact(state.runId, "task.json", input.task),
    store.writeArtifact(state.runId, "catalog-context.json", input.context),
    store.writeArtifact(state.runId, "router-plan.json", { current: input.plans.at(-1) ?? null, history: input.plans }),
    store.writeArtifact(state.runId, "source-ranking.json", input.plans.at(-1)?.sourcePlan ?? []),
    store.writeArtifact(state.runId, "queries.json", state.queriesAttempted),
    store.writeArtifact(state.runId, "query-strategies.json", queryExecution),
    store.writeArtifact(state.runId, "search-results.json", input.searchResults),
    store.writeArtifact(state.runId, "pages.json", input.pages),
    store.writeArtifact(state.runId, "images.json", input.images),
    store.writeArtifact(state.runId, "image-candidates.json", pageImageCandidates),
    store.writeArtifact(state.runId, "evidence-images.json", evidenceImages),
    store.writeArtifact(state.runId, "subject-classifications.json", input.visionResults.map((row) => ({ imageUrl: row.imageUrl, subjectClass: row.result.subjectClass ?? "UNREADABLE", stage: row.result.visualStages?.subject ?? "UNREADABLE" }))),
    store.writeArtifact(state.runId, "component-classifications.json", input.visionResults.map((row) => ({ imageUrl: row.imageUrl, component: row.result.component, componentNodeLabel: row.result.componentNodeLabel ?? null, stage: row.result.visualStages?.component ?? "UNREADABLE" }))),
    store.writeArtifact(state.runId, "identifier-bindings.json", state.identifierBindings ?? []),
    store.writeArtifact(state.runId, "identifier-resolution-traces.json", state.identifierTraces ?? []),
    store.writeArtifact(state.runId, "search-exhaustion.json", state.searchExhaustion ?? null),
    store.writeArtifact(state.runId, "worldwide-coverage.json", state.coverageLedger ?? []),
    store.writeArtifact(state.runId, "research-telemetry.json", state.telemetry ?? createResearchTelemetry()),
    store.writeArtifact(state.runId, "product-graph.json", { nodes: state.productNodes ?? [], relations: state.productRelations ?? [] }),
    store.writeArtifact(state.runId, "market-binding.json", evidenceImages.map((row) => ({ evidenceId: row.evidenceId, marketBindingState: row.marketBindingState }))),
    store.writeArtifact(state.runId, "mode-transitions.json", state.modeTransitions ?? []),
    store.writeArtifact(state.runId, "evidence-gaps.json", state.evidenceGaps ?? (gap ? [gap] : [])),
    store.writeArtifact(state.runId, "physical-metrics.json", state.physicalMetrics ?? {}),
    store.writeArtifact(state.runId, "rejected-images.json", input.visionResults.filter((row) => row.result.subjectClass && row.result.subjectClass !== "EXACT_PRODUCT").map((row) => ({ imageUrl: row.imageUrl, subjectClass: row.result.subjectClass, reason: "SUBJECT_GATE_REJECTED" }))),
    store.writeArtifact(state.runId, "vision-results.json", input.visionResults),
    store.writeArtifact(state.runId, "evidence.json", state.evidence),
    store.writeArtifact(state.runId, "claims.json", state.claims),
    store.writeArtifact(state.runId, "conflicts.json", state.conflicts),
    store.writeArtifact(state.runId, "rejected-hypotheses.json", state.rejectedHypotheses),
    store.writeArtifact(state.runId, "source-candidates.json", sourceCandidates(state)),
    store.writeArtifact(state.runId, "provider-health.json", input.providerHealth),
    store.writeArtifact(state.runId, "retrieval-events.json", input.retrievalEvents),
    store.writeArtifact(state.runId, "technical-failures.json", input.technicalFailures),
    store.writeArtifact(state.runId, "retrieval-funnel.json", {
      searches: state.usage.searches,
      searchResults: input.searchResults.length,
      pagesAttempted: new Set([...input.pages.map((page) => page.requestedUrl), ...input.technicalFailures.filter((row) => row.operation === "DIRECT_FETCH" || row.operation === "BROWSER").map((row) => row.target)]).size,
      pagesOpened: input.pages.length,
      imagesDiscovered: input.images.length,
      imagesInspected: input.visionResults.length,
    }),
    store.writeArtifact(state.runId, "resolution.json", input.resolution),
    store.writeArtifact(state.runId, "evidence-gap.json", gap),
    store.writeArtifact(state.runId, "cost.json", {
      searchCalls: state.usage.searches,
      pagesOpened: state.usage.pages,
      imagesInspected: state.usage.images,
      browserSessions: state.usage.browserSessions,
      llmAndVisionCalls: state.usage.agentTurns,
      inputTokens: state.usage.inputTokens,
      outputTokens: state.usage.outputTokens,
      estimatedCostUsd: state.usage.estimatedCostUsd,
      providerCalls: input.providerUsage,
      technicalRetriesAndFailures: input.technicalFailures.length,
      llmCalls: Math.max(0, state.usage.agentTurns - input.visionResults.length),
      visionCalls: input.visionResults.length,
      modelUsages: input.modelUsages,
      durationMs: input.durationMs,
    }),
  ]);
  const summary = [
    `# Research run ${state.runId}`,
    "",
    `- Target: ${state.currentTargetField}`,
    `- Status: ${state.status}`,
    `- Playbook: ${state.currentPlaybook ?? "none"}`,
    `- Evidence: ${state.evidence.length}`,
    `- Claims: ${state.claims.length}`,
    `- Conflicts: ${state.conflicts.length}`,
    `- Cost: $${state.usage.estimatedCostUsd.toFixed(6)}`,
    `- Catalog mutations: 0`,
    `- Why stopped: ${state.whyStopped ?? "n/a"}`,
    "",
    `Conclusion: ${input.resolution.status} — ${input.resolution.reason}`,
  ].join("\n");
  await store.writeArtifact(state.runId, "summary.md", summary);
}

export async function runResearchTaskV2(input: {
  task: DurableResearchTask;
  subject: ResearchSubject;
  dependencies: ResearchWorkerDependencies;
  runId?: string;
  resumeState?: ResearchState | null;
  rootDir?: string;
  franchiseId?: string | null;
  knowledgePack?: import("./knowledge-pack").ResearchKnowledgePackV1;
}): Promise<ResearchWorkerResult> {
  const started = Date.now();
  const store = input.dependencies.store ?? new ResearchRunStore();
  const context = buildResearchCatalogContext(input.subject);
  const knowledge = await loadResearchKnowledge({
    platformSlug: context.platformSlug,
    catalogIds: [context.catalogId, ...context.ownedScans.map((scan) => scan.catalogId)].filter((value): value is string => Boolean(value)),
    franchiseId: input.franchiseId ?? null,
    rootDir: input.rootDir,
  });
  const state = input.resumeState ?? createResearchState({
    runId: input.runId ?? randomUUID(),
    taskId: input.task.id,
    subjectId: input.subject.id,
    targetField: input.task.targetField,
    priority: input.task.priority,
    riskCodes: input.task.riskCodes,
  });
  if (!input.resumeState) {
    state.researchMode = input.task.researchMode ?? "STANDARD";
    state.identifierTraces = state.identifierTraces ?? [];
    state.telemetry = state.telemetry ?? createResearchTelemetry();
    if (state.researchMode === "WORLDWIDE_VARIANT_DISCOVERY") {
      state.coverageLedger = createWorldwideCoverageLedger();
      state.budget.maxSearches = Math.max(state.budget.maxSearches, 16);
    }
  }
  if (input.knowledgePack) {
    state.budget.maxSearches = Math.max(state.budget.maxSearches, researchKnowledgePackSearchBudget(
      input.knowledgePack,
      input.task.targetField,
      { reserveImageSearch: Boolean(input.dependencies.imageSearchProvider && input.dependencies.visionProvider) },
    ));
  }
  state.physicalMetrics = { ...createResearchPhysicalMetrics(), ...(state.physicalMetrics ?? {}) };
  const priorRouter = input.resumeState
    ? await store.readArtifact<{ history?: ResearchRouterPlan[] }>(state.runId, "router-plan.json", () => ({}))
    : {};
  const priorCost = input.resumeState
    ? await store.readArtifact<{ modelUsages?: ResearchModelUsage[]; providerCalls?: Record<string, number>; durationMs?: number }>(state.runId, "cost.json", () => ({}))
    : {};
  const plans: ResearchRouterPlan[] = [...(priorRouter.history ?? [])];
  const searchResults: ResearchSearchResult[] = input.resumeState
    ? await store.readArtifact(state.runId, "search-results.json", () => [] as ResearchSearchResult[])
    : [];
  const pages: PageArtifact[] = input.resumeState
    ? await store.readArtifact(state.runId, "pages.json", () => [] as PageArtifact[])
    : [];
  const images: ResearchImageSearchResult[] = input.resumeState
    ? await store.readArtifact(state.runId, "images.json", () => [] as ResearchImageSearchResult[])
    : [];
  const visionResults: ResearchWorkerResult["visionResults"] = input.resumeState
    ? await store.readArtifact(state.runId, "vision-results.json", () => [] as ResearchWorkerResult["visionResults"])
    : [];
  const modelUsages: ResearchModelUsage[] = [...(priorCost.modelUsages ?? [])];
  const technicalFailures: TechnicalFailure[] = input.resumeState
    ? await store.readArtifact(state.runId, "technical-failures.json", () => [] as TechnicalFailure[])
    : [];
  await persist(store, state);

  let finalResolution: ResearchFieldResolution = {
    field: input.task.targetField,
    status: "UNRESOLVED",
    value: null,
    score: 0,
    claimIds: [],
    sourceIds: [],
    reason: "Research has not produced an eligible claim.",
  };
  let noProgressRounds = 0;
  const maxRounds = Math.max(1, state.budget.maxAgentTurns + 2);
  try {
    for (; state.round < maxRounds; state.round += 1) {
      const exhausted = budgetExhaustionReason(state.budget, state.usage);
      const packRoutesExhausted = highValueKnowledgeRoutesExhausted(input.knowledgePack, input.task.targetField, state);
      if (exhausted && !secondaryBudgetCanDegradeWithoutCuttingSearch(exhausted, packRoutesExhausted)) {
        updateState(state, {
          whyStopped: completedKnowledgeRouteStopReason(exhausted, input.knowledgePack, input.task.targetField, state),
        });
        break;
      }
      const routeInput = routerInput({ context, task: input.task, state, knowledge, knowledgePack: input.knowledgePack });
      const plan = routeResearch(routeInput);
      plans.push(plan);
      state.telemetry ??= createResearchTelemetry();
      state.telemetry.duplicateQueriesPrevented += plan.duplicateQueriesPrevented ?? 0;
      updateState(state, { currentPlaybook: plan.selectedPlaybook.id, status: "SEARCHING" });
      await persist(store, state);

      if (await inspectOwnedScans({
        context,
        task: input.task,
        state,
        plan,
        visionProvider: input.dependencies.visionProvider ?? null,
        store,
        visionResults,
        modelUsages,
      })) {
        const resolved = resolveResearchClaimRecords({ field: input.task.targetField, claims: state.claims, evidence: state.evidence });
        state.claims = resolved.claims;
        finalResolution = resolved.resolution;
        updateState(state, { status: "CONFIRMED", whyStopped: "OWN_SCAN_RESOLVED_TARGET", decisionSummary: resolved.resolution.reason });
        break;
      }

      const tests = applicableDecisionTests(routeInput);
      if (input.dependencies.llmProvider && tests[0] && budgetAllows(state.budget, state.usage, "agentTurns") && hasTokenReserve(state, LLM_TOKEN_RESERVE)) {
        const decision = await input.dependencies.llmProvider.decide({
          question: tests[0].question,
          options: tests[0].options,
          observations: Object.fromEntries(knownIdentifiersForRouter(routeInput).map((identifier) => [identifier.type, identifier.value])),
        });
        recordUsage(state, decision.usage);
        modelUsages.push(decision.usage);
        const allowed = Array.isArray(tests[0].correct) ? tests[0].correct : [tests[0].correct];
        if (!allowed.includes(decision.choice)) {
          state.rejectedHypotheses.push({ value: decision.choice, reason: `Failed closed-choice rule ${tests[0].id}.` });
        }
      }

      let progressed = false;
      let replan = false;
      for (const direct of plan.directUrlPlan) {
        if (state.urlsVisited.includes(direct.url) || !budgetAllows(state.budget, state.usage, "pages")) continue;
        const directSource = plan.sourcePlan.find((row) => row.sourceId === direct.sourceId) ?? sourceForUrl(direct.url, plan);
        updateState(state, { status: "READING", urlsVisited: [...state.urlsVisited, direct.url] });
        try {
          const fetched = await fetchWithFallback({
            url: direct.url,
            source: directSource,
            state,
            pageFetcher: input.dependencies.pageFetcher,
            browserProvider: input.dependencies.browserProvider ?? null,
            technicalFailures,
          });
          state.usage = recordBudgetUse(state.usage, "pages");
          pages.push(pageArtifact(fetched.page, fetched.mode));
          progressed = true;
          replan = await processPage({ task: input.task, context, state, plan, page: fetched.page, source: directSource, llmProvider: input.dependencies.llmProvider ?? null, store, modelUsages });
          replan ||= await inspectPageImages({ task: input.task, context, state, plan, page: fetched.page, source: directSource, visionProvider: input.dependencies.visionProvider ?? null, store, images, visionResults, modelUsages, technicalFailures });
        } catch (error) {
          state.rejectedHypotheses.push({ value: direct.url, reason: safeRetrievalDetail(error) });
          // Search-provider fallback has now taken ownership of the retrieval.
          if (input.dependencies.searchProvider) recoverSourceAttempt(technicalFailures, direct.url);
        }
        if (replan) break;
      }
      if (input.dependencies.searchProvider) {
        for (const planned of plan.queryPlan) {
          const normalized = normalizedQuery(planned.query);
          if (state.normalizedQueries.includes(normalized)) continue;
          if (state.researchMode === "PHYSICAL_EVIDENCE_MODE" && planned.strategy === "GENERIC"
            && !genericQueriesAllowedAfterPhysicalMode(executedQueries(state, plans).map((row) => row.strategy), 2)) continue;
          if (!budgetAllows(state.budget, state.usage, "searches")) break;
          const shouldReserveImageSearch = Boolean(
            input.dependencies.imageSearchProvider
            && input.dependencies.visionProvider
            && plan.imagePlan.length
            && budgetAllows(state.budget, state.usage, "images")
            && hasTokenReserve(state, VISION_TOKEN_RESERVE),
          );
          if (shouldReserveImageSearch && state.usage.searches >= Math.max(0, state.budget.maxSearches - 1)) break;
          const source = planned.sourceId ? plan.sourcePlan.find((row) => row.sourceId === planned.sourceId) ?? null : null;
          state.usage = recordBudgetUse(state.usage, "searches");
          state.queriesAttempted.push(planned.query);
          state.normalizedQueries.push(normalized);
          recordQueryTelemetry(state, planned);
          let found: ResearchSearchResult[];
          try {
            const locale = searchLocaleFor(planned);
            found = await input.dependencies.searchProvider.search({
              query: planned.query,
              domains: source?.hosts.length ? source.hosts : undefined,
              maxResults: 6,
              country: locale.country,
              language: locale.language,
            });
          } catch (error) {
            technicalFailures.push({ operation: "SEARCH", target: planned.query, code: classifyRetrievalFailure(error), detail: safeRetrievalDetail(error), recovered: false });
            state.rejectedHypotheses.push({
              value: planned.query,
              reason: error instanceof Error ? error.message.slice(0, 300) : "SEARCH_FAILED",
            });
            await persist(store, state);
            continue;
          }
          searchResults.push(...found);
          const identifierProgress = processSearchResultIdentifiers({ task: input.task, context, state, plan, planned, hits: found });
          const identifierResolution = resolveResearchClaimRecords({ field: input.task.targetField, claims: state.claims, evidence: state.evidence });
          state.claims = identifierResolution.claims;
          state.conflicts = [...new Map([...state.conflicts, ...identifierResolution.conflicts].map((conflict) => [conflict.id, conflict])).values()];
          finalResolution = identifierResolution.resolution;
          if (identifierResolution.resolution.status === "CONFIRMED") {
            state.telemetry ??= createResearchTelemetry();
            state.telemetry.fieldsResolvedAfterExactSearch += identifierProgress.exactProcessed ? 1 : 0;
            updateState(state, { status: "CONFIRMED", whyStopped: "TARGET_CONFIRMED_AFTER_EXACT_IDENTIFIER_SEARCH", decisionSummary: identifierResolution.resolution.reason });
            await persist(store, state);
            break;
          }
          if (identifierProgress.newCandidate && !identifierProgress.exactProcessed) {
            replan = true;
            await persist(store, state);
            break;
          }
          const shortlisted = found.filter((hit) => searchResultLooksRelevant(hit, context, input.task.targetField, plan, planned));
          progressed ||= shortlisted.length > 0;
          await persist(store, state);
          for (const hit of shortlisted.slice(0, 2)) {
            if (state.urlsVisited.includes(hit.url) || !budgetAllows(state.budget, state.usage, "pages")) continue;
            const resolvedSource = sourceForUrl(hit.url, plan);
            updateState(state, { status: "READING", urlsVisited: [...state.urlsVisited, hit.url], domainsVisited: [...new Set([...state.domainsVisited, hit.host])] });
            try {
              const fetched = await fetchWithFallback({
                url: hit.url,
                source: resolvedSource,
                state,
                pageFetcher: input.dependencies.pageFetcher,
                browserProvider: input.dependencies.browserProvider ?? null,
                technicalFailures,
              });
              state.usage = recordBudgetUse(state.usage, "pages");
              pages.push(pageArtifact(fetched.page, fetched.mode));
              progressed = true;
              const finalSource = sourceForUrl(fetched.page.canonicalUrl, plan);
              replan = await processPage({
                task: input.task,
                context,
                state,
                plan,
                page: fetched.page,
                source: finalSource,
                llmProvider: input.dependencies.llmProvider ?? null,
                store,
                modelUsages,
              });
              replan ||= await inspectPageImages({
                task: input.task,
                context,
                state,
                plan,
                page: fetched.page,
                source: finalSource,
                visionProvider: input.dependencies.visionProvider ?? null,
                store,
                images,
                visionResults,
                modelUsages,
                technicalFailures,
              });
              const resolved = resolveResearchClaimRecords({ field: input.task.targetField, claims: state.claims, evidence: state.evidence });
              state.claims = resolved.claims;
              state.conflicts = [...new Map([
                ...state.conflicts,
                ...resolved.conflicts,
                ...crossAttributionConflicts(state.evidence),
              ].map((conflict) => [conflict.id, conflict])).values()];
              finalResolution = resolved.resolution;
              if (resolved.resolution.status === "CONFIRMED") {
                updateState(state, { status: "CONFIRMED", whyStopped: "TARGET_CONFIRMED", decisionSummary: resolved.resolution.reason });
                break;
              }
              if (replan) break;
            } catch (error) {
              state.rejectedHypotheses.push({
                value: hit.url,
                reason: error instanceof Error ? error.message.slice(0, 300) : "PAGE_FETCH_FAILED",
              });
              // This source failed closed, but the search loop continues with
              // the next independent result instead of failing the target.
              recoverSourceAttempt(technicalFailures, hit.url);
              await persist(store, state);
            }
          }
          if (!replan && !(state.identifierTraces ?? []).some((trace) => trace.validation === "VALID") && discoveryLadderComplete(state, plan)) break;
          if (state.status === "CONFIRMED" || replan) break;
        }
      }
      if (state.status === "CONFIRMED") break;
      replan ||= await inspectDiscoveredImages({
        task: input.task,
        context,
        state,
        plan,
        imageSearchProvider: input.dependencies.imageSearchProvider ?? null,
        visionProvider: input.dependencies.visionProvider ?? null,
        pageFetcher: input.dependencies.pageFetcher,
        browserProvider: input.dependencies.browserProvider ?? null,
        store,
        pages,
        images,
        visionResults,
        modelUsages,
        technicalFailures,
      });
      const resolved = resolveResearchClaimRecords({ field: input.task.targetField, claims: state.claims, evidence: state.evidence });
      state.claims = resolved.claims;
      state.conflicts = [...new Map([...state.conflicts, ...resolved.conflicts, ...crossAttributionConflicts(state.evidence)].map((conflict) => [conflict.id, conflict])).values()];
      finalResolution = resolved.resolution;
      if (resolved.resolution.status === "CONFIRMED") {
        updateState(state, { status: "CONFIRMED", whyStopped: "TARGET_CONFIRMED", decisionSummary: resolved.resolution.reason });
        break;
      }
      replan ||= activatePhysicalEvidenceMode(state, resolved.resolution, plans);
      noProgressRounds = progressed || replan ? 0 : noProgressRounds + 1;
      if (noProgressRounds >= 1 || !replan) {
        const exhausted = budgetExhaustionReason(state.budget, state.usage);
        updateState(state, {
          whyStopped: completedKnowledgeRouteStopReason(exhausted, input.knowledgePack, input.task.targetField, state)
            ?? "NO_NEW_DISCRIMINATING_EVIDENCE",
        });
        break;
      }
    }
    if (state.status !== "CONFIRMED") {
      state.searchExhaustion = searchExhaustion({ state, context, task: input.task, plans, technicalFailures });
      if (input.task.targetField === "MARKET_REGION"
        && nationalMarketRequirement({
          broadRegion: context.broadRegion,
          marketRegions: context.marketRegions,
          physicalExistenceConfirmed: context.releaseStatus === "RELEASED" || context.existingEvidence.length > 0,
          identifierConfirmed: Boolean(context.barcode || context.ean),
        }) === "NOT_REQUIRED") {
        finalResolution = {
          field: "MARKET_REGION",
          status: "CONFIRMED",
          value: "NO_DISTINCT_NATIONAL_MARKET_PROVEN",
          score: 1,
          claimIds: [],
          sourceIds: [],
          reason: "Broad European physical edition is confirmed; a national packaging subdivision is not required.",
        };
        updateState(state, { status: "CONFIRMED", whyStopped: "NATIONAL_MARKET_NOT_REQUIRED", decisionSummary: finalResolution.reason });
      }
    }
    if (state.status !== "CONFIRMED") {
      const infrastructureBlocked = technicalFailures.some((failure) => !failure.recovered)
        && !pages.length
        && !searchResults.length
        && !state.evidence.length;
      const strongCandidateRemains = finalResolution.status === "PARTIAL"
        || (finalResolution.status === "CONFLICT" && finalResolution.score >= 0.6);
      const incompleteExhaustion = state.searchExhaustion?.exhaustionStatus === "INCOMPLETE";
      const exhaustionBlocked = state.searchExhaustion?.exhaustionStatus === "BLOCKED_BY_TECHNICAL_FAILURE";
      const terminal = strongCandidateRemains ? "PARTIAL" : infrastructureBlocked || exhaustionBlocked ? "BLOCKED_INFRASTRUCTURE" : incompleteExhaustion ? "BLOCKED" : "UNRESOLVED";
      updateState(state, {
        status: terminal,
        decisionSummary: finalResolution.reason,
        nextEvidenceNeeded: state.conflicts.flatMap((conflict) => conflict.nextEvidenceNeeded).filter((value, index, all) => all.indexOf(value) === index),
        whyStopped: infrastructureBlocked || exhaustionBlocked ? "RETRIEVAL_INFRASTRUCTURE_UNAVAILABLE"
          : incompleteExhaustion ? `SEARCH_EXHAUSTION_INCOMPLETE:${state.searchExhaustion?.missingStages.join(",")}`
            : state.whyStopped ?? "EVIDENCE_INSUFFICIENT",
      });
      if (terminal === "UNRESOLVED") {
        state.telemetry ??= createResearchTelemetry();
        state.telemetry.fieldsUnresolvedAfterExhaustion += 1;
      }
    }
    if (state.searchExhaustion) state.searchExhaustion.finalStatus = state.status;
    if (state.researchMode === "WORLDWIDE_VARIANT_DISCOVERY" && input.task.coverageBucket) {
      const ledger = state.coverageLedger ?? createWorldwideCoverageLedger();
      const entry = ledger.find((row) => row.bucket === input.task.coverageBucket);
      if (entry) {
        entry.status = state.status === "CONFIRMED" ? "CONFIRMED_VARIANT_FOUND"
          : state.status === "BLOCKED_INFRASTRUCTURE" ? "TECHNICAL_FAILURE" : "UNRESOLVED";
        entry.sourcesConsulted = [...new Set(state.evidence.map((row) => row.sourceId))];
        entry.queries = [...state.queriesAttempted];
        entry.identifiersFound = [...new Set((state.identifierTraces ?? []).filter((trace) => trace.validation === "VALID").map((trace) => trace.normalizedValue))];
        entry.physicalFamiliesFound = context.physicalVariant ? [context.physicalVariant] : [];
        entry.remainingGaps = state.status === "CONFIRMED" ? [] : [...new Set(state.nextEvidenceNeeded)];
        state.telemetry ??= createResearchTelemetry();
        state.telemetry.coverageBucketsComplete = ledger.filter((row) => row.status !== "NOT_CHECKED").length;
      }
      state.coverageLedger = ledger;
    }
  } catch (error) {
    const code = classifyRetrievalFailure(error);
    updateState(state, { status: isInfrastructureRetrievalFailure(code) ? "BLOCKED_INFRASTRUCTURE" : "FAILED", whyStopped: safeRetrievalDetail(error) });
    await persist(store, state);
    if (!isInfrastructureRetrievalFailure(code)) throw error;
  } finally {
    await input.dependencies.browserProvider?.close().catch(() => undefined);
  }
  await persist(store, state);
  const providerUsage: Record<string, number> = { ...(priorCost.providerCalls ?? {}) };
  for (const usage of [
    input.dependencies.searchProvider?.getUsage?.() ?? {},
    input.dependencies.imageSearchProvider?.getUsage?.() ?? {},
  ]) {
    for (const [provider, calls] of Object.entries(usage)) providerUsage[provider] = (providerUsage[provider] ?? 0) + calls;
  }
  const providerHealth = input.dependencies.searchProvider?.getHealth?.() ?? [];
  const retrievalEvents = [
    ...(input.dependencies.searchProvider?.getEvents?.() ?? []),
    ...(input.dependencies.imageSearchProvider?.getEvents?.() ?? []),
  ];
  await writeArtifacts({
    store,
    task: input.task,
    context,
    state,
    plans,
    searchResults,
    pages,
    images,
    visionResults,
    resolution: finalResolution,
    modelUsages,
    providerUsage,
    providerHealth,
    retrievalEvents,
    technicalFailures,
    durationMs: (priorCost.durationMs ?? 0) + Date.now() - started,
  });
  return {
    state,
    context,
    routerPlans: plans,
    searchResults,
    pages,
    images,
    visionResults,
    sourceCandidates: sourceCandidates(state),
    resolution: finalResolution,
    providerUsage,
    providerHealth,
    retrievalEvents,
    technicalFailures,
    funnel: {
      searches: state.usage.searches,
      searchResults: searchResults.length,
      pagesAttempted: new Set([...pages.map((page) => page.requestedUrl), ...technicalFailures.filter((row) => row.operation === "DIRECT_FETCH" || row.operation === "BROWSER").map((row) => row.target)]).size,
      pagesOpened: pages.length,
      imagesDiscovered: images.length,
      imagesInspected: visionResults.length,
    },
    artifactDirectory: store.runDirectory(state.runId),
  };
}
