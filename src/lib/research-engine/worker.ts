import { createHash, randomUUID } from "node:crypto";
import { buildResearchCatalogContext } from "./catalog-context";
import { budgetAllows, budgetExhaustionReason, recordBudgetUse, recordModelUsage } from "./budget";
import { bindEvidenceSubject } from "./evidence-binding";
import { crossAttributionConflicts, resolveResearchClaimRecords, type ResearchFieldResolution } from "./conflict-engine";
import { loadResearchKnowledge } from "./knowledge-loader";
import { researchPageTextHash } from "./page-fetcher";
import { boundedBackoff, classifyRetrievalFailure, isInfrastructureRetrievalFailure, isRetryableRetrievalFailure, safeRetrievalDetail } from "./retrieval-resilience";
import { applicableDecisionTests, knownIdentifiersForRouter, routeResearch, shouldDynamicallyReplan } from "./router";
import { ResearchRunStore, createResearchState } from "./state-store";
import type { ResearchSubject } from "./types";
import { validateClaimDeterministically } from "./validators";
import type {
  DurableResearchTask,
  ResearchBrowserProvider,
  ResearchCatalogContext,
  ResearchClaimRecord,
  ResearchEvidenceRecord,
  ResearchImageSearchProvider,
  ResearchImageSearchResult,
  ResearchLlmProvider,
  ResearchModelUsage,
  ResearchPage,
  ResearchPageFetcher,
  ResearchRetrievalEvent,
  ResearchRetrievalFailureCode,
  ResearchRouterInput,
  ResearchRouterPlan,
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
  mode: "DIRECT_FETCH" | "BROWSER";
};

export type ResearchWorkerResult = {
  state: ResearchState;
  context: ResearchCatalogContext;
  routerPlans: ResearchRouterPlan[];
  searchResults: ResearchSearchResult[];
  pages: PageArtifact[];
  images: ResearchImageSearchResult[];
  visionResults: Array<{ imageUrl: string; result: ResearchVisionResult }>;
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
  return {
    id: evidenceId(input.state.runId, sourceUrl, input.ownScan ? "OWN_SCAN" : "IMAGE_FROM_SOURCE_PAGE", input.result.component),
    runId: input.state.runId,
    taskId: input.task.id,
    sourceId: input.ownScan ? "regionatlas-own-scan" : input.source?.sourceId ?? `candidate:${host ?? "unknown"}`,
    sourceUrl,
    canonicalUrl: input.sourcePageUrl,
    sourceType: input.ownScan ? "OWN_SCAN" : input.source?.roles[0] ?? "NEW_SOURCE_CANDIDATE",
    host,
    fetchedAt: now(),
    evidenceType: input.ownScan ? "OWN_SCAN" : "IMAGE_FROM_SOURCE_PAGE",
    subjectBinding: binding,
    relevantExcerpt: null,
    imageUrl: input.imageUrl,
    imageHash: createHash("sha256").update(input.imageUrl).digest("hex"),
    textHash: null,
    capabilities: input.ownScan ? [input.task.targetField] : input.source && input.source.capabilityScore > 0 ? [input.task.targetField] : [],
    reliability: input.ownScan ? 100 : Math.min(95, (input.source?.capabilityScore ?? 0) + 5),
    component: input.result.component,
  };
}

function claimsFromVision(input: {
  state: ResearchState;
  task: DurableResearchTask;
  context: ResearchCatalogContext;
  evidence: ResearchEvidenceRecord;
  result: ResearchVisionResult;
}): ResearchClaimRecord[] {
  const values: unknown[] = [];
  switch (input.task.targetField) {
    case "BARCODE": values.push(...input.result.barcodeCandidates); break;
    case "BOX_CODE":
    case "SERIAL":
    case "PRODUCT_CODE":
    case "MEDIA_ID": values.push(...input.result.printedCodes); break;
    case "PACKAGING_LANGUAGES": if (input.result.packagingLanguagesObserved.length) values.push(input.result.packagingLanguagesObserved); break;
    case "RATING": if (input.result.ratingMarks.length) values.push(input.result.ratingMarks); break;
    case "PHYSICAL_PRODUCT_TYPE": if (input.result.downloadStatements.length) values.push("PHYSICAL_DOWNLOAD_REQUIRED"); break;
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
      component: input.result.component,
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
        imageHash: image ? createHash("sha256").update(image).digest("hex") : null,
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
      if (!budgetAllows(input.state.budget, input.state.usage, "images") || input.state.urlsVisited.includes(imageUrl)) return false;
      const requested = input.plan.imagePlan.flatMap((row) => row.fields);
      updateState(input.state, { status: "INSPECTING_IMAGES", urlsVisited: [...input.state.urlsVisited, imageUrl] });
      const inspected = await input.visionProvider.inspect({ imageUrl, requestedFields: requested });
      input.state.usage = recordBudgetUse(input.state.usage, "images");
      recordUsage(input.state, inspected.usage);
      input.modelUsages.push(inspected.usage);
      input.visionResults.push({ imageUrl, result: inspected.result });
      const evidence = imageEvidence({
        state: input.state,
        task: input.task,
        context: input.context,
        source: input.plan.sourcePlan.find((source) => source.sourceId === "regionatlas-own-scan") ?? null,
        imageUrl,
        sourcePageUrl: null,
        result: inspected.result,
        ownScan: true,
      });
      addUniqueEvidence(input.state, evidence);
      addUniqueClaims(input.state, claimsFromVision({ state: input.state, task: input.task, context: input.context, evidence, result: inspected.result }));
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
  if (!input.llmProvider || !budgetAllows(input.state.budget, input.state.usage, "agentTurns")) {
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
  const previousIdentifiers = [...input.state.identifiersSeen];
  input.state.identifiersSeen = mergeIdentifiers(input.state, extraction.identifiers);
  const claims = extraction.claims
    .filter((claim) => claim.field === input.task.targetField)
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
  store: ResearchRunStore;
  images: ResearchImageSearchResult[];
  visionResults: ResearchWorkerResult["visionResults"];
  modelUsages: ResearchModelUsage[];
  technicalFailures: TechnicalFailure[];
}): Promise<void> {
  if (!input.imageSearchProvider || !input.visionProvider || !input.plan.imagePlan.length) return;
  if (!budgetAllows(input.state.budget, input.state.usage, "searches") || !budgetAllows(input.state.budget, input.state.usage, "images")) return;
  const query = input.plan.queryPlan.find((candidate) => !input.state.normalizedQueries.includes(normalizedQuery(`${candidate.query} images`)))?.query;
  if (!query) return;
  const imageQuery = `${query} images`;
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
    return;
  }
  input.images.push(...found);
  for (const image of found.slice(0, 2)) {
    if (!image.sourcePageUrl || input.state.urlsVisited.includes(image.imageUrl) || !budgetAllows(input.state.budget, input.state.usage, "images")) continue;
    const source = sourceForUrl(image.sourcePageUrl, input.plan);
    updateState(input.state, { status: "INSPECTING_IMAGES", urlsVisited: [...input.state.urlsVisited, image.imageUrl] });
    const inspected = await input.visionProvider.inspect({
      imageUrl: image.imageUrl,
      componentHint: input.plan.imagePlan[0]?.component,
      requestedFields: input.plan.imagePlan.flatMap((row) => row.fields),
    });
    input.state.usage = recordBudgetUse(input.state.usage, "images");
    recordUsage(input.state, inspected.usage);
    input.modelUsages.push(inspected.usage);
    input.visionResults.push({ imageUrl: image.imageUrl, result: inspected.result });
    const evidence = imageEvidence({
      state: input.state,
      task: input.task,
      context: input.context,
      source,
      imageUrl: image.imageUrl,
      sourcePageUrl: image.sourcePageUrl,
      result: inspected.result,
      ownScan: false,
    });
    addUniqueEvidence(input.state, evidence);
    addUniqueClaims(input.state, claimsFromVision({ state: input.state, task: input.task, context: input.context, evidence, result: inspected.result }));
    await persist(input.store, input.state);
  }
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
}): Promise<void> {
  if (!input.visionProvider || !input.plan.imagePlan.length) return;
  const ranked = input.page.imageCandidates
    .filter((candidate) => /^https?:\/\//i.test(candidate.url))
    .sort((a, b) => Number(/back|rear|barcode|box|cover|cart|disc/i.test(`${b.alt ?? ""} ${b.caption ?? ""} ${b.url}`)) - Number(/back|rear|barcode|box|cover|cart|disc/i.test(`${a.alt ?? ""} ${a.caption ?? ""} ${a.url}`)))
    .slice(0, 3);
  for (const [index, candidate] of ranked.entries()) {
    if (input.state.urlsVisited.includes(candidate.url) || !budgetAllows(input.state.budget, input.state.usage, "images")) continue;
    input.images.push({ imageUrl: candidate.url, thumbnailUrl: null, sourcePageUrl: input.page.canonicalUrl, title: candidate.alt ?? candidate.caption ?? input.page.title, host: new URL(input.page.canonicalUrl).hostname, rank: index + 1 });
    updateState(input.state, { status: "INSPECTING_IMAGES", urlsVisited: [...input.state.urlsVisited, candidate.url] });
    try {
      const inspected = await input.visionProvider.inspect({
        imageUrl: candidate.url,
        componentHint: input.plan.imagePlan[0]?.component,
        requestedFields: input.plan.imagePlan.flatMap((row) => row.fields),
      });
      input.state.usage = recordBudgetUse(input.state.usage, "images");
      recordUsage(input.state, inspected.usage);
      input.modelUsages.push(inspected.usage);
      input.visionResults.push({ imageUrl: candidate.url, result: inspected.result });
      const evidence = imageEvidence({ state: input.state, task: input.task, context: input.context, source: input.source, imageUrl: candidate.url, sourcePageUrl: input.page.canonicalUrl, result: inspected.result, ownScan: false });
      addUniqueEvidence(input.state, evidence);
      addUniqueClaims(input.state, claimsFromVision({ state: input.state, task: input.task, context: input.context, evidence, result: inspected.result }));
    } catch (error) {
      input.technicalFailures.push({ operation: "IMAGE_INSPECTION", target: candidate.url, code: classifyRetrievalFailure(error), detail: safeRetrievalDetail(error), recovered: false });
    }
    await persist(input.store, input.state);
  }
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
  await Promise.all([
    store.writeArtifact(state.runId, "task.json", input.task),
    store.writeArtifact(state.runId, "catalog-context.json", input.context),
    store.writeArtifact(state.runId, "router-plan.json", { current: input.plans.at(-1) ?? null, history: input.plans }),
    store.writeArtifact(state.runId, "source-ranking.json", input.plans.at(-1)?.sourcePlan ?? []),
    store.writeArtifact(state.runId, "queries.json", state.queriesAttempted),
    store.writeArtifact(state.runId, "search-results.json", input.searchResults),
    store.writeArtifact(state.runId, "pages.json", input.pages),
    store.writeArtifact(state.runId, "images.json", input.images),
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
      if (exhausted) {
        updateState(state, { whyStopped: exhausted });
        break;
      }
      const routeInput = routerInput({ context, task: input.task, state, knowledge });
      const plan = routeResearch(routeInput);
      plans.push(plan);
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
      if (input.dependencies.llmProvider && tests[0] && budgetAllows(state.budget, state.usage, "agentTurns")) {
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
          await inspectPageImages({ task: input.task, context, state, plan, page: fetched.page, source: directSource, visionProvider: input.dependencies.visionProvider ?? null, store, images, visionResults, modelUsages, technicalFailures });
        } catch (error) {
          state.rejectedHypotheses.push({ value: direct.url, reason: safeRetrievalDetail(error) });
        }
        if (replan) break;
      }
      if (input.dependencies.searchProvider) {
        for (const planned of plan.queryPlan) {
          const normalized = normalizedQuery(planned.query);
          if (state.normalizedQueries.includes(normalized)) continue;
          if (!budgetAllows(state.budget, state.usage, "searches")) break;
          const source = planned.sourceId ? plan.sourcePlan.find((row) => row.sourceId === planned.sourceId) ?? null : null;
          state.usage = recordBudgetUse(state.usage, "searches");
          state.queriesAttempted.push(planned.query);
          state.normalizedQueries.push(normalized);
          let found: ResearchSearchResult[];
          try {
            found = await input.dependencies.searchProvider.search({
              query: planned.query,
              domains: source?.hosts.length ? source.hosts : undefined,
              maxResults: 6,
              country: "ES",
              language: "es",
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
          progressed ||= found.length > 0;
          await persist(store, state);
          for (const hit of found.slice(0, 2)) {
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
              await inspectPageImages({
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
              await persist(store, state);
            }
          }
          if (state.status === "CONFIRMED" || replan) break;
        }
      }
      if (state.status === "CONFIRMED") break;
      await inspectDiscoveredImages({
        task: input.task,
        context,
        state,
        plan,
        imageSearchProvider: input.dependencies.imageSearchProvider ?? null,
        visionProvider: input.dependencies.visionProvider ?? null,
        store,
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
      noProgressRounds = progressed || replan ? 0 : noProgressRounds + 1;
      if (noProgressRounds >= 1 || !replan) {
        updateState(state, { whyStopped: budgetExhaustionReason(state.budget, state.usage) ?? "NO_NEW_DISCRIMINATING_EVIDENCE" });
        break;
      }
    }
    if (state.status !== "CONFIRMED") {
      const infrastructureBlocked = technicalFailures.some((failure) => !failure.recovered)
        && !pages.length
        && !searchResults.length
        && !state.evidence.length;
      const terminal = finalResolution.status === "PARTIAL" ? "PARTIAL" : infrastructureBlocked ? "BLOCKED_INFRASTRUCTURE" : "UNRESOLVED";
      updateState(state, {
        status: terminal,
        decisionSummary: finalResolution.reason,
        nextEvidenceNeeded: state.conflicts.flatMap((conflict) => conflict.nextEvidenceNeeded).filter((value, index, all) => all.indexOf(value) === index),
        whyStopped: infrastructureBlocked ? "RETRIEVAL_INFRASTRUCTURE_UNAVAILABLE" : state.whyStopped ?? "EVIDENCE_INSUFFICIENT",
      });
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
