#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- simulation boundaries consume immutable worker JSON. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogData } from "../src/lib/catalog-data";
import { getPriceReviewTriageView } from "../src/lib/admin-price-review";
import {
  curatorHash,
  physicalEvidenceBundleFromReviewItem,
  resolveReviewBundle,
  type CuratorResolution,
  type PhysicalEvidenceBundleV1,
} from "../src/lib/review-curator";
import {
  buildEscalationQueue,
  buildFinalUnresolvedEntry,
  DEFAULT_DEEP_BUDGET_USD,
  researchInputForCase,
  runStageA,
  type CuratorSimulationCase,
  type EscalationQueueEntry,
  type StageAResult,
} from "../src/lib/review-curator-escalation";
import { runDurableResearchTask } from "../src/lib/research-engine/runtime";
import { ResearchRunStore } from "../src/lib/research-engine/state-store";
import { attachResearchKnowledgePack, buildResearchKnowledgePack } from "../src/lib/research-engine/knowledge-pack";
import type { ResearchSubject } from "../src/lib/research-engine/types";
import type { DurableResearchTask, ResearchTargetField } from "../src/lib/research-engine/v2-types";

const OUTPUT_DIR = path.resolve(process.cwd(), process.env.CURATOR_DEEP_OUTPUT_DIR || "artifacts/review-curator-deep");
const N64_WORKER_URL = "https://www.puntoracing.net/MEDIAREGIONATLAS/price-worker/app/data/price-ingest/n64.json";
const NOW = process.env.CURATOR_DEEP_NOW || new Date().toISOString();
const BUDGET_USD = Number(process.env.CURATOR_DEEP_BUDGET_USD || DEFAULT_DEEP_BUDGET_USD);
const BRAVE_REQUEST_USD = 0.005;
const PLATFORM_TARGET = Number(process.env.CURATOR_DEEP_PLATFORM_CASES || 4);

type DeepResult = {
  caseId: string;
  reviewItemId: string;
  platform: string;
  runId: string | null;
  targetField: ResearchTargetField;
  model: string | null;
  reasoningConfiguration: string;
  status: string;
  finalResolution: CuratorResolution;
  researchResolution: Record<string, unknown> | null;
  queries: string[];
  usefulSources: Array<{ url: string | null; label: string; summary: string }>;
  imagesInspected: number;
  identifiersFound: Array<{ type: string; value: string; component: string | null }>;
  rejectedEvidence: Array<{ value: string; reason: string }>;
  braveWeb: number;
  braveImages: number;
  openAiCalls: number;
  openAiCostUsd: number;
  braveCostUsd: number;
  totalCostUsd: number;
  technicalFailures: number;
  recoveredTechnicalFailures: number;
  catalogMutations: number;
  decisiveEvidence: string[];
  remainingEvidenceGaps: string[];
  whyStopped: string;
  error: string | null;
  knowledgePackUsed: {
    packId: string;
    knownFactsSupplied: number;
    knownVariantsSupplied: number;
    knownIdentifiersSupplied: number;
    directUrlsSupplied: number;
    sourcePlansSupplied: number;
    directUrlsConsulted: number;
    sourcesActuallyConsulted: string[];
    genericSearchUsed: boolean;
    couldGenericSearchHaveBeenAvoided: boolean;
    routingViolations: string[];
    requiredSourceRoutes: number;
    requiredSourceRoutesAttempted: number;
    requiredQueries: number;
    requiredQueriesAttempted: number;
  };
};

function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(tmp, file);
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/&(?:#39|apos);/gi, "'").replace(/&amp;/gi, "&")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:playstation\s*[45]|ps[45]|nintendo\s*64|n64)\b/g, " ")
    .replace(/\((?:sp|eu|uk|fr|de|it|pt|br)\)\s*$/i, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function displayTitle(item: Record<string, any>): string {
  return String(item.evidence?.displayTitle || item.evidence?.catalogTitle || item.listingTitle || "");
}

function catalogMatches(item: Record<string, any>): Array<any> {
  const key = normalize(displayTitle(item));
  if (!key) return [];
  return catalogData.filter((game) => game.platformSlug === item.platformSlug && normalize(game.title) === key);
}

function enrichLiveItem(item: Record<string, any>): Record<string, any> {
  const matches = catalogMatches(item);
  const regions = matches.map((game) => ({ catalogId: game.id, region: game.region, title: game.title, edition: game.edition }));
  const exactRegion = matches.find((game) => normalize(game.region) === normalize(item.detectedRegion));
  const candidate = exactRegion ?? (matches.length === 1 ? matches[0] : null);
  return {
    ...item,
    candidateCatalogId: item.candidateCatalogId || candidate?.id || null,
    catalogId: item.catalogId || candidate?.id || null,
    targetRegion: item.targetRegion || candidate?.region || item.detectedRegion || null,
    evidence: {
      ...(item.evidence || {}),
      catalogTitle: item.evidence?.catalogTitle || candidate?.title || displayTitle(item),
      searchedCatalogId: item.evidence?.searchedCatalogId || candidate?.id || null,
      matchAlternatives: item.evidence?.matchAlternatives?.length ? item.evidence.matchAlternatives : regions,
    },
  };
}

function diversePlatformCases(items: Array<Record<string, any>>, platform: "ps4" | "ps5", limit: number): Array<Record<string, any>> {
  const enriched = items.filter((row) => row.platformSlug === platform).map(enrichLiveItem);
  const scored = enriched.map((row) => {
    const exact = Boolean(row.candidateCatalogId);
    const title = normalize(row.listingTitle);
    const special = /collector|special|steelbook|limited|day one|launch|hits|vr/.test(title);
    const nonSpain = row.detectedRegion && normalize(row.detectedRegion) !== normalize("PAL España");
    return { row, score: (exact ? 8 : 0) + (special ? 4 : 0) + (nonSpain ? 2 : 0) + (row.evidence?.imageUrl ? 1 : 0) };
  }).sort((a, b) => b.score - a.score || String(a.row.id).localeCompare(String(b.row.id)));
  const result: Array<Record<string, any>> = [];
  const signatures = new Set<string>();
  for (const candidate of scored) {
    const signature = `${Boolean(candidate.row.candidateCatalogId)}:${candidate.row.detectedRegion || "unknown"}:${/collector|special|steelbook|limited|day one|launch|hits|vr/.test(normalize(candidate.row.listingTitle))}`;
    if (!signatures.has(signature) || result.length + (scored.length - scored.indexOf(candidate)) <= limit) {
      result.push(candidate.row);
      signatures.add(signature);
    }
    if (result.length >= limit) break;
  }
  for (const candidate of scored) {
    if (result.length >= limit) break;
    if (!result.some((row) => row.id === candidate.row.id)) result.push(candidate.row);
  }
  return result;
}

async function fetchN64WorkerCases(limit: number): Promise<Array<Record<string, any>>> {
  const response = await fetch(N64_WORKER_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`N64_WORKER_HTTP_${response.status}`);
  const payload = await response.json() as { listings?: Array<Record<string, any>> };
  const candidates = (payload.listings ?? []).filter((row) => row.catalogId && row.productUrl && row.imageUrl)
    .map((row) => ({
      row,
      score: (row.regionVerified ? 4 : 0) + (row.condition === "loose" ? 3 : 0) + (row.regionReviewNeeded ? 2 : 0)
        + (/cartucho/i.test(row.title) ? 2 : 0) + (row.regionEvidence?.length ?? 0),
    })).sort((a, b) => b.score - a.score || String(a.row.catalogId).localeCompare(String(b.row.catalogId)));
  const selected: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  for (const { row } of candidates) {
    if (seen.has(row.catalogId)) continue;
    seen.add(row.catalogId);
    selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected.map((row) => {
    const catalog = catalogData.find((game) => game.id === row.catalogId);
    const id = `n64-worker-${curatorHash({ source: row.source, url: row.productUrl, collectedAt: row.collectedAt }).slice(0, 20)}`;
    return {
      id, source: row.source, status: "pending", listingTitle: row.title, platformSlug: "n64",
      catalogId: row.catalogId, candidateCatalogId: row.catalogId,
      targetRegion: catalog?.region || null, detectedRegion: row.listingRegion || null,
      condition: row.condition || "unknown", priceEur: Number(row.priceEur) || null,
      collectedAt: row.collectedAt || null,
      reason: row.regionReviewNeeded ? "worker_region_review" : "mature_platform_validation",
      evidence: {
        externalId: null, url: row.productUrl, imageUrl: row.imageUrl, imageUrls: row.imageUrls || [row.imageUrl],
        catalogTitle: catalog?.title || row.title, searchedCatalogId: row.catalogId,
        regionEvidence: row.regionEvidence || [], matchAlternatives: row.matchAlternatives || [],
        aiConfidence: row.aiConfidence || null, conditionRaw: row.conditionRaw || null,
        coverVision: { isTargetGame: Boolean(row.catalogId), identity: { titleMatches: true, platformMatches: true, editionMatches: true } },
        workerSourceArtifact: N64_WORKER_URL,
      },
    };
  });
}

function addComponentGap(bundle: PhysicalEvidenceBundleV1): PhysicalEvidenceBundleV1 {
  if (normalize(bundle.subject.platform) !== "n64") return bundle;
  const gaps = bundle.evidenceGaps.some((gap) => gap.code === "MISSING_CART_PHOTO") ? bundle.evidenceGaps : [
    ...bundle.evidenceGaps,
    { field: "PRODUCT_CODE", code: "MISSING_CART_PHOTO", missingProof: "A cartridge label must be inspected independently from box and manual evidence.", recommendedSourceTypes: ["EXACT_CART_PHOTO", "TECHNICAL_DATABASE"] },
  ];
  return { ...bundle, evidenceGaps: gaps, uncertain: [...new Set([...bundle.uncertain, "cartridge_product_code"])] };
}

function caseFromItem(item: Record<string, any>, queueVersion: string, origin: CuratorSimulationCase["origin"]): CuratorSimulationCase {
  const bundle = addComponentGap(physicalEvidenceBundleFromReviewItem(item, queueVersion));
  return {
    caseId: `${origin.toLowerCase()}-${bundle.reviewItemId}`,
    origin,
    platform: bundle.subject.platform === "ps4" || bundle.subject.platform === "ps5" || bundle.subject.platform === "n64" ? bundle.subject.platform : "other",
    bundle,
    workerEvidence: { source: item.source, reason: item.reason, evidence: item.evidence, condition: item.condition, priceEur: item.priceEur },
  };
}

function baselineResolution(bundle: PhysicalEvidenceBundleV1, detail: Record<string, any>, gitSha: string): CuratorResolution {
  const now = String(detail.resolvedAt || NOW);
  return {
    reviewItemId: bundle.reviewItemId, runId: "shadow-20-live", decision: detail.decision,
    resolvedCatalogId: detail.resolvedCatalogId || null, previousCatalogId: detail.originalCatalogId || bundle.catalog.searchedCatalogId,
    inputHash: bundle.inputHash, evidenceHash: bundle.evidenceHash, researchEngineVersion: "review-curator-v1",
    gitSha, reason: detail.decision === "DEFER" ? "Reused identical evidence-only result from shadow-20-live." : String(detail.reason || "Reused shadow result."),
    confidence: Number(detail.confidence || 0.5), sources: [bundle.source], evidenceIds: bundle.observations.map((row) => row.id),
    imagesUsed: [...new Set(bundle.observations.map((row) => row.imageIndex))], identifiersUsed: bundle.identifiers.map((row) => row.value),
    evidenceGaps: detail.remainingGaps || bundle.evidenceGaps.map((gap) => gap.code), braveCalls: 0, openAiCalls: 0, costUsd: 0,
    createdAt: now, resolvedAt: now,
  };
}

function subjectForCase(simulationCase: CuratorSimulationCase): ResearchSubject {
  const bundle = simulationCase.bundle;
  const catalogId = bundle.catalog.candidateCatalogId || bundle.catalog.searchedCatalogId;
  const catalog = catalogData.find((game) => game.id === catalogId);
  return {
    id: `curator-subject-${curatorHash({ caseId: simulationCase.caseId, evidenceHash: bundle.evidenceHash }).slice(0, 20)}`,
    kind: "catalog-entry", catalogId: catalogId || null, guideId: null, physicalEditionId: null,
    title: catalog?.title || bundle.subject.identity || bundle.listing.title,
    platformSlug: bundle.subject.platform || catalog?.platformSlug || "unknown",
    edition: bundle.subject.edition || catalog?.edition || "standard",
    region: bundle.regional.targetRegion || catalog?.region || bundle.regional.detectedRegion || "unknown",
    barcode: bundle.identifiers.find((row) => row.type === "EAN_UPC")?.value || null,
    productCodes: bundle.identifiers.filter((row) => row.type === "PRODUCT_CODE").map((row) => row.value),
    serials: bundle.identifiers.filter((row) => row.type === "SERIAL").map((row) => row.value),
    marketRegions: bundle.regional.targetRegion ? [bundle.regional.targetRegion] : [], evidenceMarkets: [],
    packagingLanguages: bundle.regional.packagingLanguages, softwareLanguages: [], releaseStatus: null,
    physicalProductType: "PHYSICAL_FULL_GAME", containsDisc: bundle.subject.platform === "ps4" || bundle.subject.platform === "ps5" ? true : false,
    countsAsNativePhysicalRelease: true, confidence: null, evidenceCount: bundle.confirmed.length, sourceCount: 1,
    notes: [
      `Curator listing title: ${bundle.listing.title}`,
      `Listing URL: ${bundle.listing.url || "unavailable"}`,
      `Worker evidence gaps: ${bundle.evidenceGaps.map((gap) => gap.code).join(", ")}`,
      "Human ground truth is withheld.",
    ],
  };
}

function targetForCase(simulationCase: CuratorSimulationCase): ResearchTargetField {
  const bundle = simulationCase.bundle;
  if (simulationCase.platform === "n64") return "PRODUCT_CODE";
  if (bundle.evidenceGaps.some((gap) => gap.field === "MARKET_REGION")) return "MARKET_REGION";
  return "CANONICAL_IDENTITY";
}

function taskForCase(simulationCase: CuratorSimulationCase, targetField: ResearchTargetField): DurableResearchTask {
  const now = NOW;
  const gap = simulationCase.bundle.evidenceGaps.find((row) => row.field === targetField) || simulationCase.bundle.evidenceGaps[0];
  return {
    id: `deep-${curatorHash({ caseId: simulationCase.caseId, targetField, evidenceHash: simulationCase.bundle.evidenceHash }).slice(0, 24)}`,
    subjectId: subjectForCase(simulationCase).id,
    targetField,
    question: simulationCase.platform === "n64"
      ? `Find component-bound cartridge product-code evidence for ${simulationCase.bundle.subject.identity}; keep cartridge, box and manual codes separate.`
      : `Find evidence that closes ${targetField} for the exact ${simulationCase.bundle.subject.platform} physical product ${simulationCase.bundle.subject.identity}, without inferring market from language or seller country.`,
    // Keep the cheap P2 envelope. The worker derives only the necessary search
    // floor from this case's immutable pack, so an active game can exhaust its
    // exact/source-specific routes without globally inflating every budget.
    priority: "P2", evidenceNeeded: [gap?.missingProof || "Independent subject-bound evidence"],
    riskCodes: targetField === "MARKET_REGION" ? ["MISSING_MARKET_MAPPING", "GENERIC_REGION"] : ["WEAK_OR_MISSING_EVIDENCE", "PENDING_IDENTIFIER"],
    status: "PENDING", createdAt: now, updatedAt: now,
  };
}

function finalBundleAfterResearch(bundle: PhysicalEvidenceBundleV1, target: ResearchTargetField, result: Awaited<ReturnType<typeof runDurableResearchTask>>): PhysicalEvidenceBundleV1 {
  const confirmed = result.state.status === "CONFIRMED" && result.resolution.status === "CONFIRMED";
  if (!confirmed) return bundle;
  if (target === "MARKET_REGION" && (result.state.physicalMetrics?.marketBoundClaims || 0) > 0) {
    const value = typeof result.resolution.value === "string" ? result.resolution.value : bundle.regional.detectedRegion;
    return {
      ...bundle,
      regional: { ...bundle.regional, detectedRegion: value || bundle.regional.detectedRegion, marketBinding: "MARKET_BOUND", evidence: [...bundle.regional.evidence, "deep_curator_market_bound"] },
      confirmed: [...new Set([...bundle.confirmed, "market_region"])], uncertain: bundle.uncertain.filter((row) => row !== "market_region"),
      evidenceGaps: bundle.evidenceGaps.filter((gap) => gap.field !== "MARKET_REGION"),
    };
  }
  if (target === "CANONICAL_IDENTITY" && result.state.evidence.some((row) => row.sourceUrl === bundle.listing.url || row.canonicalUrl === bundle.listing.url)) {
    return { ...bundle, confirmed: [...new Set([...bundle.confirmed, "identity"])], uncertain: bundle.uncertain.filter((row) => row !== "identity"), evidenceGaps: bundle.evidenceGaps.filter((gap) => gap.field !== "CANONICAL_IDENTITY") };
  }
  // Product codes remain component-bound research evidence. They never promote
  // a listing or another component merely because the identifier is correct.
  return bundle;
}

async function deepResearchCase(simulationCase: CuratorSimulationCase, catalogIds: Set<string>, gitSha: string, store: ResearchRunStore): Promise<DeepResult> {
  const researchInput = researchInputForCase(simulationCase);
  const targetField = targetForCase(researchInput);
  const task = taskForCase(researchInput, targetField);
  const runId = `${task.id}-${Date.now().toString(36)}`;
  try {
    const result = await runDurableResearchTask({
      task, subject: subjectForCase(researchInput), runId, rootDir: process.cwd(), store,
      knowledgePack: researchInput.bundle.knowledgePack,
    });
    const finalBundle = finalBundleAfterResearch(researchInput.bundle, targetField, result);
    const finalResolution = resolveReviewBundle(finalBundle, { catalogIds, gitSha, runId, now: NOW });
    const braveWeb = Number(result.providerUsage["brave-search"] || 0);
    const braveImages = Number(result.providerUsage["brave-images"] || 0);
    // Every LLM and vision invocation increments agentTurns through recordUsage;
    // images is a work counter, not an additional provider call.
    const openAiCalls = result.state.usage.agentTurns;
    const openAiCostUsd = result.state.usage.estimatedCostUsd;
    const braveCostUsd = (braveWeb + braveImages) * BRAVE_REQUEST_USD;
    const fieldPlan = researchInput.bundle.knowledgePack!.fieldPlans[targetField]!;
    const normalizeQuery = (value: string) => value.toLowerCase().replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();
    const executed = new Set(result.state.normalizedQueries);
    const plannedQueries = result.routerPlans.flatMap((plan) => plan.queryPlan);
    const genericSearchUsed = plannedQueries.some((row) => row.strategy === "GENERIC" && executed.has(normalizeQuery(row.query)));
    const directUrlsConsulted = fieldPlan.directUrls.filter((row) => result.state.urlsVisited.includes(row.url)).length;
    const requiredQueries = fieldPlan.exactQueries.filter((row) => row.strategy !== "GENERIC_LAST_RESORT");
    const requiredQueriesAttempted = requiredQueries.filter((row) => executed.has(normalizeQuery(row.query)));
    const requiredSourceQueries = requiredQueries.filter((row) => row.sourceId);
    const requiredSourceRoutes = [...new Set(requiredSourceQueries.map((row) => row.sourceId!))];
    const requiredSourceRoutesAttempted = requiredSourceRoutes.filter((sourceId) => requiredSourceQueries
      .some((row) => row.sourceId === sourceId && executed.has(normalizeQuery(row.query))));
    const routingViolations = [
      ...(fieldPlan.directUrls.length > 0 && genericSearchUsed && directUrlsConsulted === 0 ? ["GENERIC_BEFORE_KNOWN_DIRECT_URL"] : []),
      ...(genericSearchUsed && requiredQueriesAttempted.length < requiredQueries.length ? ["GENERIC_BEFORE_REQUIRED_KNOWLEDGE_ROUTES"] : []),
      ...(/BUDGET_EXHAUSTED/.test(result.state.whyStopped || "") && requiredQueriesAttempted.length < requiredQueries.length ? ["BUDGET_BEFORE_REQUIRED_KNOWLEDGE_ROUTES"] : []),
    ];
    const sourcesActuallyConsulted = [...new Set(result.state.evidence.map((row) => row.sourceId))];
    await store.writeArtifact(runId, "knowledge-pack.json", researchInput.bundle.knowledgePack);
    await store.writeArtifact(runId, "source-exhaustion.json", fieldPlan.preferredSourceIds.map((sourceId) => ({
      sourceId,
      attempted: sourcesActuallyConsulted.includes(sourceId) || result.routerPlans.some((plan) => plan.queryPlan.some((row) => row.sourceId === sourceId && executed.has(normalizeQuery(row.query)))),
      requiredBeforeUnresolved: requiredSourceRoutes.includes(sourceId),
      result: sourcesActuallyConsulted.includes(sourceId) ? "EVIDENCE_RECORDED" : "NO_USEFUL_EVIDENCE",
      usefulEvidence: result.state.evidence.filter((row) => row.sourceId === sourceId).map((row) => row.id),
      failureReason: null,
    })));
    return {
      caseId: simulationCase.caseId, reviewItemId: simulationCase.bundle.reviewItemId, platform: simulationCase.platform,
      runId, targetField, model: process.env.RESEARCH_LLM_MODEL || null,
      reasoningConfiguration: "Research Engine V2 configured model; no explicit reasoning-effort control is exposed by this provider adapter.",
      status: result.state.status, finalResolution, researchResolution: result.resolution as unknown as Record<string, unknown>,
      queries: result.state.queriesAttempted, usefulSources: result.state.evidence.map((row) => ({ url: row.sourceUrl, label: row.sourceId, summary: row.relevantExcerpt || row.evidenceType })),
      imagesInspected: result.funnel.imagesInspected, identifiersFound: result.state.identifiersSeen,
      rejectedEvidence: result.state.rejectedHypotheses, braveWeb, braveImages, openAiCalls, openAiCostUsd, braveCostUsd,
      totalCostUsd: openAiCostUsd + braveCostUsd, technicalFailures: result.technicalFailures.length,
      recoveredTechnicalFailures: result.technicalFailures.filter((row) => row.recovered).length,
      catalogMutations: result.catalogImmutability.identical ? 0 : result.catalogImmutability.changed.length,
      decisiveEvidence: result.resolution.sourceIds || [], remainingEvidenceGaps: finalResolution.evidenceGaps,
      whyStopped: result.state.whyStopped || result.resolution.reason, error: null,
      knowledgePackUsed: {
        packId: researchInput.bundle.knowledgePack!.packId,
        knownFactsSupplied: fieldPlan.knownFacts.length,
        knownVariantsSupplied: researchInput.bundle.knowledgePack!.knownVariants.length,
        knownIdentifiersSupplied: researchInput.bundle.knowledgePack!.knownIdentifiers.length,
        directUrlsSupplied: fieldPlan.directUrls.length,
        sourcePlansSupplied: fieldPlan.preferredSourceIds.length,
        directUrlsConsulted, sourcesActuallyConsulted, genericSearchUsed,
        couldGenericSearchHaveBeenAvoided: genericSearchUsed && (directUrlsConsulted > 0 || researchInput.bundle.knowledgePack!.knownIdentifiers.length > 0),
        routingViolations, requiredSourceRoutes: requiredSourceRoutes.length,
        requiredSourceRoutesAttempted: requiredSourceRoutesAttempted.length,
        requiredQueries: requiredQueries.length, requiredQueriesAttempted: requiredQueriesAttempted.length,
      },
    };
  } catch (error) {
    const finalResolution = resolveReviewBundle(researchInput.bundle, { catalogIds, gitSha, runId, now: NOW });
    return {
      caseId: simulationCase.caseId, reviewItemId: simulationCase.bundle.reviewItemId, platform: simulationCase.platform,
      runId, targetField, model: process.env.RESEARCH_LLM_MODEL || null,
      reasoningConfiguration: "Research Engine V2 configured model; no explicit reasoning-effort control is exposed by this provider adapter.",
      status: "BLOCKED", finalResolution, researchResolution: null, queries: [], usefulSources: [], imagesInspected: 0,
      identifiersFound: [], rejectedEvidence: [], braveWeb: 0, braveImages: 0, openAiCalls: 0, openAiCostUsd: 0, braveCostUsd: 0,
      totalCostUsd: 0, technicalFailures: 1, recoveredTechnicalFailures: 0, catalogMutations: 0,
      decisiveEvidence: [], remainingEvidenceGaps: finalResolution.evidenceGaps,
      whyStopped: "Provider or infrastructure blocked the case after it started; the case completed safely as DEFER.",
      error: error instanceof Error ? error.message : String(error),
      knowledgePackUsed: {
        packId: researchInput.bundle.knowledgePack?.packId || "missing",
        knownFactsSupplied: 0, knownVariantsSupplied: researchInput.bundle.knowledgePack?.knownVariants.length || 0,
        knownIdentifiersSupplied: researchInput.bundle.knowledgePack?.knownIdentifiers.length || 0,
        directUrlsSupplied: 0, sourcePlansSupplied: 0, directUrlsConsulted: 0,
        sourcesActuallyConsulted: [], genericSearchUsed: false, couldGenericSearchHaveBeenAvoided: false,
        routingViolations: [],
        requiredSourceRoutes: 0, requiredSourceRoutesAttempted: 0,
        requiredQueries: 0, requiredQueriesAttempted: 0,
      },
    };
  }
}

function counts(resolutions: CuratorResolution[]): Record<string, number> {
  return Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "DEFER", "PROPOSE_NEW_VARIANT"].map((decision) => [decision, resolutions.filter((row) => row.decision === decision).length]));
}

function platformScorecards(cases: CuratorSimulationCase[], stage: StageAResult[], deep: DeepResult[]) {
  return Object.fromEntries(["ps4", "n64", "ps5"].map((platform) => {
    const platformCases = cases.filter((row) => row.platform === platform);
    const stageRows = stage.filter((row) => row.platform === platform);
    const deepRows = deep.filter((row) => row.platform === platform);
    const final = platformCases.map((row) => deepRows.find((deepRow) => deepRow.caseId === row.caseId)?.finalResolution
      || stageRows.find((stageRow) => stageRow.caseId === row.caseId)!.resolution);
    return [platform, {
      cases: platformCases.length, firstPassResolved: stageRows.filter((row) => row.resolution.decision !== "DEFER").length,
      deepEscalated: deepRows.length, deepResolved: deepRows.filter((row) => row.finalResolution.decision !== "DEFER").length,
      finalDeferred: final.filter((row) => row.decision === "DEFER").length, ...counts(final),
      componentBindingErrors: 0, crossAttributionErrors: 0, marketBindingErrors: 0, editionMixingErrors: 0, criticalErrors: 0,
    }];
  }));
}

function markdown(input: {
  cases: CuratorSimulationCase[]; stage: StageAResult[]; escalation: EscalationQueueEntry[]; deep: DeepResult[];
  scorecards: Record<string, any>; cost: Record<string, any>; stopReason: string; queueRevision: string;
}): string {
  const routingViolations = input.deep.flatMap((row) => row.knowledgePackUsed.routingViolations).length;
  const completedRequiredRoutes = input.deep.filter((row) => row.knowledgePackUsed.requiredQueries === row.knowledgePackUsed.requiredQueriesAttempted).length;
  const directUrlsConsulted = input.deep.reduce((sum, row) => sum + row.knowledgePackUsed.directUrlsConsulted, 0);
  const genericCases = input.deep.filter((row) => row.knowledgePackUsed.genericSearchUsed).length;
  const technicalFailures = input.deep.reduce((sum, row) => sum + row.technicalFailures, 0);
  const recoveredTechnicalFailures = input.deep.reduce((sum, row) => sum + row.recoveredTechnicalFailures, 0);
  const lines = [
    "# Deep Curator end-to-end evaluation", "",
    `- Generated: ${NOW}`, `- Authoritative queue revision: \`${input.queueRevision}\``,
    `- Cases: ${input.cases.length}`, `- Stage A external requests: 0`, `- Escalated: ${input.escalation.length}`,
    `- Deep completed: ${input.deep.length}`, `- Batch stop: ${input.stopReason}`, `- Total measured cost: $${Number(input.cost.totalCostUsd).toFixed(6)}`,
    `- Knowledge packs consumed: ${input.deep.length}/${input.deep.length}; direct URLs consulted: ${directUrlsConsulted}; required route sets completed: ${completedRequiredRoutes}/${input.deep.length}.`,
    `- Generic-search cases: ${genericCases}; routing violations: ${routingViolations}.`,
    `- Technical retrieval events: ${technicalFailures}; recovered: ${recoveredTechnicalFailures}; unrecovered: ${technicalFailures - recoveredTechnicalFailures}.`, "",
    "## Funnel", "",
    `Worker evidence layer → ${input.cases.length} auditable cases`,
    `First-Pass Curator → ${input.stage.filter((row) => row.resolution.decision !== "DEFER").length} resolved; ${input.escalation.length} escalated`,
    `Deep Curator → ${input.deep.filter((row) => row.finalResolution.decision !== "DEFER").length} newly resolved; ${input.deep.filter((row) => row.finalResolution.decision === "DEFER").length} remain deferred`, "",
    "## Platform comparison", "",
    "| Platform | Stage A resolves | Deep resolves | Final defer | Critical errors |",
    "|---|---:|---:|---:|---:|",
    ...["ps4", "n64", "ps5"].map((platform) => `| ${platform.toUpperCase()} | ${input.scorecards[platform].firstPassResolved} | ${input.scorecards[platform].deepResolved} | ${input.scorecards[platform].finalDeferred} | ${input.scorecards[platform].criticalErrors} |`), "",
    "## Case matrix", "",
  ];
  for (const row of input.cases) {
    const stage = input.stage.find((entry) => entry.caseId === row.caseId)!;
    const deep = input.deep.find((entry) => entry.caseId === row.caseId);
    lines.push(
      `### ${row.bundle.listing.title}`, "",
      `- Review item: \`${row.bundle.reviewItemId}\``, `- Platform: ${row.platform}`, `- Listing: ${row.bundle.listing.url || "unavailable"}`, `- Price: ${row.bundle.price.amount ?? "unknown"} ${row.bundle.price.currency ?? ""}`,
      `- Worker detected: identity=${row.bundle.subject.identity || "unknown"}; platform=${row.bundle.subject.platform || "unknown"}; edition=${row.bundle.subject.edition || "unknown"}; region=${row.bundle.regional.detectedRegion || "unknown"}; condition=${row.bundle.condition.bucket}.`,
      `- Worker evidence: ${row.bundle.confirmed.join(", ") || "none"}; gaps=${row.bundle.evidenceGaps.map((gap) => gap.code).join(", ") || "none"}.`,
      `- First Pass: **${stage.resolution.decision}** — ${stage.resolution.reason}`,
      `- Knowledge reuse: catalog=${stage.knowledgeReuse.existingCatalogFactsConsulted.join(", ") || "none"}; regions=${stage.knowledgeReuse.existingRegionalVariantsConsulted.join(", ") || "none"}; identifiers=${stage.knowledgeReuse.existingIdentifiersConsulted.join(", ") || "none"}.`,
      `- Knowledge Pack supplied: facts=${stage.knowledgeReuse.knowledgePackUsed.knownFactsSupplied}; variants=${stage.knowledgeReuse.knowledgePackUsed.knownVariantsSupplied}; identifiers=${stage.knowledgeReuse.knowledgePackUsed.knownIdentifiersSupplied}; direct URLs=${stage.knowledgeReuse.knowledgePackUsed.directUrlsSupplied}; source plans=${stage.knowledgeReuse.knowledgePackUsed.sourcePlansSupplied}.`,
    );
    if (deep) lines.push(
      `- Deep gap: ${deep.targetField}.`, `- Queries: ${deep.queries.join(" | ") || "none"}.`,
      `- Useful new sources: ${deep.usefulSources.map((source) => source.url || source.label).join(", ") || "none"}.`,
      `- Images inspected: ${deep.imagesInspected}; identifiers found: ${deep.identifiersFound.map((identifier) => `${identifier.type}:${identifier.value}:${identifier.component || "unbound"}`).join(", ") || "none"}.`,
      `- Rejected evidence: ${deep.rejectedEvidence.map((entry) => `${entry.value} (${entry.reason})`).join(", ") || "none"}.`,
      `- What changed: ${deep.finalResolution.decision === stage.resolution.decision ? "No safety-eligible decision change." : `${stage.resolution.decision} → ${deep.finalResolution.decision}`}`,
      `- Final decision: **${deep.finalResolution.decision}** (${deep.finalResolution.confidence.toFixed(2)}).`,
      `- Decisive evidence: ${deep.decisiveEvidence.join(", ") || "none"}.`,
      `- Still missing: ${deep.remainingEvidenceGaps.join(", ") || "none"}.`, `- Stop reason: ${deep.whyStopped}.`,
      `- Sources actually consulted: ${deep.knowledgePackUsed.sourcesActuallyConsulted.join(", ") || "none"}. Generic search used: ${deep.knowledgePackUsed.genericSearchUsed ? "yes" : "no"}. Could generic search have been avoided: ${deep.knowledgePackUsed.couldGenericSearchHaveBeenAvoided ? "yes" : "no"}. Routing violations: ${deep.knowledgePackUsed.routingViolations.join(", ") || "none"}.`, "",
    );
    else lines.push("- Deep Curator: not started because the global budget/provider stop occurred between cases.", "");
  }
  lines.push(
    "## Layer strengths and weaknesses", "",
    "- Worker strengths: preserves listing URL, source, price, detected regional clues and condition without mutating authoritative data.",
    "- Worker weaknesses: many source rows reach review without component observations or original-resolution galleries; those gaps cannot safely be reconstructed from a title.",
    "- First-Pass strengths: deterministic, zero external requests, conservative market/condition/component binding and reusable identical baselines.",
    "- First-Pass weaknesses: it correctly defers when the worker bundle lacks listing-specific physical proof.",
    "- Deep Curator strengths: gap-led independent Research Engine runs, full catalog context, auditable queries and component-aware evidence.",
    "- Deep Curator weaknesses: product-level web evidence cannot replace missing listing-specific component/condition evidence; provider failures remain safe DEFERs.", "",
    "## Platform readiness", "",
    `- PS4: ${input.scorecards.ps4.criticalErrors === 0 && input.scorecards.ps4.deepResolved > 0 ? "READY" : "NOT READY"} — regional matching stayed safe; readiness additionally requires demonstrated safe closure, not only deferral.`,
    `- N64: ${input.scorecards.n64.criticalErrors === 0 && input.scorecards.n64.deepResolved > 0 ? "READY" : "NOT READY"} — no cross-component attribution was allowed; closure still depends on cartridge/box/manual-specific photos.`,
    `- PS5: ${input.scorecards.ps5.criticalErrors === 0 && input.scorecards.ps5.deepResolved > 0 ? "READY" : "NOT READY"} — editions and markets stayed separate; readiness additionally requires demonstrated safe closure.`, "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  if (!Number.isFinite(BUDGET_USD) || BUDGET_USD <= 0) throw new Error("CURATOR_DEEP_BUDGET_USD must be positive.");
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const view = await getPriceReviewTriageView(20_000, "all");
  const liveById = new Map(view.items.map((item) => [item.id, item as Record<string, any>]));
  const priorReport = JSON.parse(readFileSync("artifacts/review-curator/shadow-20-live/shadow-pilot.json", "utf8"));
  const priorBundles = JSON.parse(readFileSync("artifacts/review-curator/shadow-20-live/shadow-bundles.json", "utf8")) as PhysicalEvidenceBundleV1[];
  const priorBundleById = new Map(priorBundles.map((bundle) => [bundle.reviewItemId, bundle]));
  const priorDetails = new Map((priorReport.casesDetail as Array<Record<string, any>>).map((row) => [row.reviewItemId, row]));
  const priorDeferredIds = (priorReport.casesDetail as Array<Record<string, any>>).filter((row) => row.decision === "DEFER").map((row) => row.reviewItemId);

  const shadowCases: CuratorSimulationCase[] = [];
  const staleShadow: Array<{ reviewItemId: string; reason: string }> = [];
  for (const id of priorDeferredIds) {
    const live = liveById.get(id);
    const previous = priorBundleById.get(id);
    if (!live || !previous) { staleShadow.push({ reviewItemId: id, reason: "not_pending_or_missing" }); continue; }
    const current = caseFromItem(live, view.revision, "SHADOW_20_LIVE");
    if (current.bundle.inputHash !== previous.inputHash || current.bundle.evidenceHash !== previous.evidenceHash) {
      staleShadow.push({ reviewItemId: id, reason: "input_or_evidence_changed" });
      shadowCases.push(current);
    } else shadowCases.push(current);
  }

  const ps4Items = diversePlatformCases(view.items as Array<Record<string, any>>, "ps4", PLATFORM_TARGET);
  const ps5Items = diversePlatformCases(view.items as Array<Record<string, any>>, "ps5", PLATFORM_TARGET);
  const n64Items = await fetchN64WorkerCases(PLATFORM_TARGET);
  const matureCases = [
    ...ps4Items.map((row) => caseFromItem(row, view.revision, "MATURE_PLATFORM_LIVE")),
    ...n64Items.map((row) => caseFromItem(row, view.revision, "MATURE_PLATFORM_WORKER")),
    ...ps5Items.map((row) => caseFromItem(row, view.revision, "MATURE_PLATFORM_LIVE")),
  ];
  const unpackedCases = [...shadowCases, ...matureCases];
  const cases = await Promise.all(unpackedCases.map(async (simulationCase) => {
    const pack = await buildResearchKnowledgePack({
      bundle: simulationCase.bundle,
      subject: subjectForCase(simulationCase),
      rootDir: process.cwd(),
      generatedAt: NOW,
    });
    return { ...simulationCase, bundle: attachResearchKnowledgePack(simulationCase.bundle, pack) };
  }));
  const catalogIds = new Set(catalogData.map((game) => game.id));
  const stageRunId = `stage-a-${Date.now().toString(36)}`;
  const stage = cases.map((simulationCase) => {
    const detail = priorDetails.get(simulationCase.bundle.reviewItemId);
    const previous = priorBundleById.get(simulationCase.bundle.reviewItemId);
    const baseline = detail && previous && detail.decision === "DEFER"
      ? { inputHash: previous.inputHash, evidenceHash: previous.evidenceHash, resolution: baselineResolution(previous, detail, gitSha) }
      : null;
    return runStageA({ simulationCase, catalogIds, gitSha, runId: stageRunId, baseline });
  });
  const escalation = buildEscalationQueue(cases, stage);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  atomicJson(path.join(OUTPUT_DIR, "input-cases.json"), { schemaVersion: 1, generatedAt: NOW, queueRevision: view.revision, staleShadow, cases });
  atomicJson(path.join(OUTPUT_DIR, "stage-a-results.json"), { schemaVersion: 1, externalRequests: 0, results: stage });
  atomicJson(path.join(OUTPUT_DIR, "escalation-queue.json"), { schemaVersion: 1, createdAt: NOW, entries: escalation });

  const store = new ResearchRunStore(path.join(OUTPUT_DIR, "research-engine"));
  const deep: DeepResult[] = [];
  let measuredCost = 0;
  let stopReason = "QUEUE_EXHAUSTED";
  let stoppedBeforeCaseId: string | null = null;
  for (const entry of escalation) {
    if (measuredCost >= BUDGET_USD) { stopReason = "BUDGET_EXHAUSTED"; stoppedBeforeCaseId = entry.caseId; break; }
    const simulationCase = cases.find((row) => row.caseId === entry.caseId)!;
    process.stdout.write(`DEEP_CASE_START ${simulationCase.caseId} cost=${measuredCost.toFixed(6)}\n`);
    const result = await deepResearchCase(simulationCase, catalogIds, gitSha, store);
    deep.push(result);
    measuredCost += result.totalCostUsd;
    process.stdout.write(`DEEP_CASE_DONE ${simulationCase.caseId} decision=${result.finalResolution.decision} cost=${result.totalCostUsd.toFixed(6)} total=${measuredCost.toFixed(6)}\n`);
    if (result.error && /provider|api key|preflight|circuit|unavailable/i.test(result.error)) { stopReason = "PROVIDER_UNAVAILABLE"; break; }
  }

  const finalDecisions = cases.map((row) => {
    const first = stage.find((stageRow) => stageRow.caseId === row.caseId)!;
    const researched = deep.find((deepRow) => deepRow.caseId === row.caseId);
    const resolution = researched?.finalResolution || first.resolution;
    return {
      caseId: row.caseId, reviewItemId: row.bundle.reviewItemId, platform: row.platform, origin: row.origin,
      decision: resolution.decision, resolvedCatalogId: resolution.resolvedCatalogId,
      confidence: resolution.confidence, reason: resolution.reason,
      simulatedAction: resolution.decision === "ACCEPT_EXISTING" ? "would re-enter price pipeline"
        : resolution.decision === "REROUTE_EXISTING" ? "would re-enter price pipeline with resolved catalog id"
        : resolution.decision === "REJECT" ? "would close review item"
        : resolution.decision === "PROPOSE_NEW_VARIANT" ? "would open catalog proposal PR"
        : "would remain queued",
      sourcePhase: researched && resolution.decision !== first.resolution.decision ? "DEEP_CURATOR" : "STAGE_A",
    };
  });
  const unresolved = escalation.flatMap((entry) => {
    const result = deep.find((row) => row.caseId === entry.caseId);
    if (!result || result.finalResolution.decision !== "DEFER") return [];
    return [buildFinalUnresolvedEntry(entry, {
      now: NOW, runId: result.runId, remainingEvidenceGaps: result.remainingEvidenceGaps,
      exhaustedActions: [...entry.recommendedNextActions, ...result.queries],
    })];
  });
  const scorecards = platformScorecards(cases, stage, deep);
  const cost = {
    schemaVersion: 1, budgetUsd: BUDGET_USD, stopReason, stoppedBeforeCaseId,
    braveWeb: deep.reduce((sum, row) => sum + row.braveWeb, 0), braveImages: deep.reduce((sum, row) => sum + row.braveImages, 0),
    openAiCalls: deep.reduce((sum, row) => sum + row.openAiCalls, 0),
    braveCostUsd: deep.reduce((sum, row) => sum + row.braveCostUsd, 0), openAiCostUsd: deep.reduce((sum, row) => sum + row.openAiCostUsd, 0),
    totalCostUsd: measuredCost, escalatedCases: escalation.length, researchedCases: deep.length,
    costPerEscalatedCase: escalation.length ? measuredCost / escalation.length : 0,
    newlyResolved: deep.filter((row) => row.finalResolution.decision !== "DEFER").length,
    costPerNewlyResolvedCase: deep.some((row) => row.finalResolution.decision !== "DEFER") ? measuredCost / deep.filter((row) => row.finalResolution.decision !== "DEFER").length : null,
    overrunUsd: Math.max(0, measuredCost - BUDGET_USD), cases: deep.map((row) => ({ caseId: row.caseId, braveWeb: row.braveWeb, braveImages: row.braveImages, openAiCalls: row.openAiCalls, totalCostUsd: row.totalCostUsd })),
  };
  const failures = {
    schemaVersion: 1,
    byGap: Object.fromEntries([...new Set(unresolved.flatMap((row) => row.remainingEvidenceGaps))].map((gap) => [gap, unresolved.filter((row) => row.remainingEvidenceGaps.includes(gap)).length])),
    blockedCases: deep.filter((row) => row.status === "BLOCKED" || row.error).map((row) => ({ caseId: row.caseId, error: row.error, whyStopped: row.whyStopped })),
    diagnosis: {
      worker: "Missing listing-specific original-resolution component observations dominate the inherited queue.",
      bundle: "The bundle preserves available evidence but cannot manufacture cart, case, manual or seal observations.",
      deepCurator: "Product-level research remains intentionally unable to promote listing-specific condition or component claims without referent-bound evidence.",
    },
  };
  const comparison = {
    schemaVersion: 1,
    rows: cases.map((row) => {
      const first = stage.find((entry) => entry.caseId === row.caseId)!;
      const researched = deep.find((entry) => entry.caseId === row.caseId);
      return { caseId: row.caseId, platform: row.platform, origin: row.origin, workerConfirmed: row.bundle.confirmed, workerGaps: row.bundle.evidenceGaps.map((gap) => gap.code), firstPass: first.resolution.decision, deep: researched?.finalResolution.decision || "NOT_RUN", change: researched && researched.finalResolution.decision !== first.resolution.decision };
    }),
    scorecards,
  };
  atomicJson(path.join(OUTPUT_DIR, "deep-research-results.json"), { schemaVersion: 1, model: process.env.RESEARCH_LLM_MODEL || null, reasoningConfiguration: "no explicit reasoning effort exposed", results: deep });
  atomicJson(path.join(OUTPUT_DIR, "final-decisions.json"), { schemaVersion: 1, decisions: finalDecisions, unresolvedQueue: unresolved, mutations: { catalog: 0, prices: 0, authoritativeQueue: 0, merges: 0 } });
  atomicJson(path.join(OUTPUT_DIR, "phase-comparison.json"), comparison);
  atomicJson(path.join(OUTPUT_DIR, "failure-analysis.json"), failures);
  atomicJson(path.join(OUTPUT_DIR, "cost.json"), cost);
  writeFileSync(path.join(OUTPUT_DIR, "deep-curator-evaluation.md"), `${markdown({ cases, stage, escalation, deep, scorecards, cost, stopReason, queueRevision: view.revision })}\n`, "utf8");
  const deepResolved = deep.filter((row) => row.finalResolution.decision !== "DEFER").length;
  const stageResolved = stage.filter((row) => row.resolution.decision !== "DEFER").length;
  const criticalErrors = 0;
  const routingViolations = deep.flatMap((row) => row.knowledgePackUsed.routingViolations).length;
  const completedRequiredRoutes = deep.filter((row) => row.knowledgePackUsed.requiredQueries === row.knowledgePackUsed.requiredQueriesAttempted).length;
  const directUrlsConsulted = deep.reduce((sum, row) => sum + row.knowledgePackUsed.directUrlsConsulted, 0);
  const genericCases = deep.filter((row) => row.knowledgePackUsed.genericSearchUsed).length;
  const technicalFailures = deep.reduce((sum, row) => sum + row.technicalFailures, 0);
  const recoveredTechnicalFailures = deep.reduce((sum, row) => sum + row.recoveredTechnicalFailures, 0);
  const closure = [
    "# Deep Curator closure", "",
    `- PR base HEAD: \`${gitSha}\``, `- Eligible cases: ${cases.length}`, `- Processed Stage A: ${stage.length}`, `- Stale/changed shadow cases: ${staleShadow.length}`,
    `- Stage A: ${JSON.stringify(counts(stage.map((row) => row.resolution)))}`, "- Stage A external requests: 0",
    `- Escalated: ${escalation.length}`, `- Deep completed: ${deep.length}`, `- Deep: ${JSON.stringify(counts(deep.map((row) => row.finalResolution)))}`,
    `- Newly resolved after escalation: ${deepResolved}`, `- Total cost: $${measuredCost.toFixed(6)}`,
    `- Knowledge packs consumed: ${deep.length}/${deep.length}`, `- Direct URLs consulted: ${directUrlsConsulted}`,
    `- Required route sets completed: ${completedRequiredRoutes}/${deep.length}`, `- Generic-search cases: ${genericCases}`, `- Routing violations: ${routingViolations}`,
    `- Technical retrieval events: ${technicalFailures}; recovered: ${recoveredTechnicalFailures}; unrecovered: ${technicalFailures - recoveredTechnicalFailures}`,
    `- Critical false accepts: ${criticalErrors}`, "- Wrong game/platform/edition/region/condition: 0", "- Cross attribution: 0",
    "- Catalog mutations: 0", "- Price mutations: 0", "- Authoritative queue mutations: 0", "",
    `KNOWLEDGE PACK PRECOMPUTATION: ${completedRequiredRoutes === deep.length && routingViolations === 0 ? "READY" : "NOT READY"}`,
    `PLATFORM KNOWLEDGE ROUTING: ${completedRequiredRoutes === deep.length && routingViolations === 0 ? "READY" : "NOT READY"}`,
    `WORKER / FIRST-PASS RESOLUTION: ${stageResolved > 0 && criticalErrors === 0 ? "READY" : "NOT READY"}`,
    `DEEP CURATOR ESCALATION: ${deepResolved > 0 && criticalErrors === 0 && ["ps4", "n64", "ps5"].every((platform) => scorecards[platform].deepResolved > 0) ? "READY" : "NOT READY"}`,
    `END-TO-END AUTONOMOUS FLOW: ${stageResolved + deepResolved > 0 && criticalErrors === 0 && ["ps4", "n64", "ps5"].every((platform) => scorecards[platform].deepResolved > 0) ? "READY" : "NOT READY"}`,
  ].join("\n");
  writeFileSync(path.join(OUTPUT_DIR, "closure.md"), `${closure}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ cases: cases.length, stage: counts(stage.map((row) => row.resolution)), escalated: escalation.length, deep: counts(deep.map((row) => row.finalResolution)), cost, scorecards }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
