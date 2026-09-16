import type { CuratorResolution, PhysicalEvidenceBundleV1 } from "./review-curator";
import { resolveReviewBundle } from "./review-curator";
import { assertResearchKnowledgePack } from "./research-engine/knowledge-pack";

export const DEEP_CURATOR_VERSION = "review-curator-deep-v1";
export const DEFAULT_DEEP_BUDGET_USD = 3;
export const DEFAULT_DEFER_DAYS = 30;

export type CuratorPlatform = "ps4" | "n64" | "ps5" | "other";
export type CaseOrigin = "SHADOW_20_LIVE" | "MATURE_PLATFORM_LIVE" | "MATURE_PLATFORM_WORKER";

export type KnowledgeReuse = {
  existingCatalogFactsConsulted: string[];
  existingRegionalVariantsConsulted: string[];
  existingIdentifiersConsulted: string[];
  existingPhysicalEvidenceConsulted: string[];
  existingResearchKnowledgeConsulted: string[];
  outcome: "EXISTING_KNOWLEDGE_ONLY" | "EXISTING_EVIDENCE_AND_LOGIC" | "REQUIRED_EXTERNAL_RESEARCH";
  knowledgePackUsed: {
    packId: string;
    knownFactsSupplied: number;
    knownVariantsSupplied: number;
    knownIdentifiersSupplied: number;
    directUrlsSupplied: number;
    sourcePlansSupplied: number;
    factsConsulted: number;
    variantsConsulted: number;
    identifiersConsulted: number;
    directUrlsConsulted: number;
    sourcePlansConsulted: number;
  };
};

export type CuratorSimulationCase = {
  caseId: string;
  origin: CaseOrigin;
  platform: CuratorPlatform;
  bundle: PhysicalEvidenceBundleV1;
  workerEvidence: Record<string, unknown>;
  groundTruth?: unknown;
};

export type StageAResult = {
  caseId: string;
  origin: CaseOrigin;
  platform: CuratorPlatform;
  reviewItemId: string;
  inputHash: string;
  evidenceHash: string;
  reusedBaseline: boolean;
  externalRequests: 0;
  resolution: CuratorResolution;
  knowledgeReuse: KnowledgeReuse;
  audit: Array<{ phase: "STAGE_A"; action: string; detail: string }>;
};

export type EscalationQueueEntry = {
  caseId: string;
  reviewItemId: string;
  platform: CuratorPlatform;
  inputHash: string;
  evidenceHash: string;
  workerEvidence: Record<string, unknown>;
  firstPassReasoningSummary: string;
  confirmedFacts: string[];
  rejectedHypotheses: string[];
  unresolvedFields: string[];
  evidenceGaps: string[];
  recommendedNextActions: string[];
};

export type FinalUnresolvedEntry = EscalationQueueEntry & {
  attemptCount: number;
  lastAttemptAt: string;
  lastResearchRunId: string | null;
  remainingEvidenceGaps: string[];
  exhaustedActions: string[];
  nextEligibleAt: string;
  reactivationTriggers: Array<"NEW_LISTING" | "NEW_IMAGE" | "NEW_IDENTIFIER" | "CATALOG_CHANGED" | "NEW_REGIONAL_VARIANT">;
};

export type AtomicBatchResult<T> = {
  completed: T[];
  stoppedBeforeCaseId: string | null;
  stopReason: "BUDGET_EXHAUSTED" | "QUEUE_EXHAUSTED";
  budgetUsd: number;
  finalCostUsd: number;
  overrunUsd: number;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function platformForBundle(bundle: PhysicalEvidenceBundleV1): CuratorPlatform {
  const platform = String(bundle.subject.platform ?? "").toLowerCase();
  return platform === "ps4" || platform === "n64" || platform === "ps5" ? platform : "other";
}

export function buildKnowledgeReuse(bundle: PhysicalEvidenceBundleV1): KnowledgeReuse {
  assertResearchKnowledgePack(bundle);
  const plans = Object.values(bundle.knowledgePack.fieldPlans);
  const catalogIds = unique([bundle.catalog.searchedCatalogId, bundle.catalog.candidateCatalogId]);
  const regions = unique([bundle.regional.targetRegion, bundle.regional.detectedRegion]);
  const identifiers = unique(bundle.identifiers.map((row) => `${row.type}:${row.value}:${row.component}`));
  const evidence = unique([
    ...bundle.confirmed,
    ...bundle.observations.map((row) => `${row.component}:${row.productNodeType}`),
    ...bundle.images.map((row) => row.hash ? `image:${row.hash}` : `image-index:${row.index}`),
  ]);
  return {
    existingCatalogFactsConsulted: catalogIds,
    existingRegionalVariantsConsulted: regions,
    existingIdentifiersConsulted: identifiers,
    existingPhysicalEvidenceConsulted: evidence,
    existingResearchKnowledgeConsulted: unique([
      bundle.subject.platform ? `platform:${bundle.subject.platform}` : null,
      bundle.subject.edition ? `edition:${bundle.subject.edition}` : null,
      bundle.subject.physicalVariant ? `physical-variant:${bundle.subject.physicalVariant}` : null,
    ]),
    outcome: evidence.length || identifiers.length ? "EXISTING_EVIDENCE_AND_LOGIC" : "EXISTING_KNOWLEDGE_ONLY",
    knowledgePackUsed: {
      packId: bundle.knowledgePack.packId,
      knownFactsSupplied: plans.reduce((sum, plan) => sum + (plan?.knownFacts.length ?? 0), 0),
      knownVariantsSupplied: bundle.knowledgePack.knownVariants.length,
      knownIdentifiersSupplied: bundle.knowledgePack.knownIdentifiers.length,
      directUrlsSupplied: bundle.knowledgePack.knownDirectUrls.length,
      sourcePlansSupplied: plans.reduce((sum, plan) => sum + (plan?.preferredSourceIds.length ?? 0), 0),
      factsConsulted: plans.reduce((sum, plan) => sum + (plan?.knownFacts.length ?? 0), 0),
      variantsConsulted: bundle.knowledgePack.knownVariants.length,
      identifiersConsulted: bundle.knowledgePack.knownIdentifiers.length,
      directUrlsConsulted: 0,
      sourcePlansConsulted: plans.length,
    },
  };
}

export function runStageA(input: {
  simulationCase: CuratorSimulationCase;
  catalogIds: Set<string>;
  gitSha: string;
  runId: string;
  baseline?: { inputHash: string; evidenceHash: string; resolution: CuratorResolution } | null;
}): StageAResult {
  const { simulationCase } = input;
  const { bundle } = simulationCase;
  assertResearchKnowledgePack(bundle);
  const baseline = input.baseline;
  const reuse = Boolean(baseline && baseline.inputHash === bundle.inputHash && baseline.evidenceHash === bundle.evidenceHash);
  const resolution = reuse
    ? { ...baseline!.resolution, runId: input.runId, gitSha: input.gitSha }
    : resolveReviewBundle(bundle, { catalogIds: input.catalogIds, gitSha: input.gitSha, runId: input.runId });
  return {
    caseId: simulationCase.caseId,
    origin: simulationCase.origin,
    platform: simulationCase.platform,
    reviewItemId: bundle.reviewItemId,
    inputHash: bundle.inputHash,
    evidenceHash: bundle.evidenceHash,
    reusedBaseline: reuse,
    externalRequests: 0,
    resolution,
    knowledgeReuse: buildKnowledgeReuse(bundle),
    audit: [{
      phase: "STAGE_A",
      action: reuse ? "REUSE_IDENTICAL_BASELINE" : "RESOLVE_FROM_BUNDLE",
      detail: "PhysicalEvidenceBundleV1 plus deterministic repository knowledge; no external provider is available in Stage A.",
    }],
  };
}

export function buildEscalationQueue(cases: CuratorSimulationCase[], results: StageAResult[]): EscalationQueueEntry[] {
  const byCase = new Map(cases.map((row) => [row.caseId, row]));
  return results.filter((row) => row.resolution.decision === "DEFER").map((row) => {
    const simulationCase = byCase.get(row.caseId);
    if (!simulationCase) throw new Error(`MISSING_SIMULATION_CASE:${row.caseId}`);
    const bundle = simulationCase.bundle;
    return {
      caseId: row.caseId,
      reviewItemId: row.reviewItemId,
      platform: row.platform,
      inputHash: row.inputHash,
      evidenceHash: row.evidenceHash,
      workerEvidence: simulationCase.workerEvidence,
      firstPassReasoningSummary: row.resolution.reason,
      confirmedFacts: [...bundle.confirmed],
      rejectedHypotheses: [...bundle.rejected, ...bundle.conflicts],
      unresolvedFields: unique([...bundle.uncertain, ...bundle.evidenceGaps.map((gap) => gap.field)]),
      evidenceGaps: unique(bundle.evidenceGaps.map((gap) => gap.code)),
      recommendedNextActions: unique(bundle.evidenceGaps.flatMap((gap) => gap.recommendedSourceTypes)),
    };
  });
}

/** Ground truth deliberately never crosses this boundary. */
export function researchInputForCase(simulationCase: CuratorSimulationCase): Omit<CuratorSimulationCase, "groundTruth"> {
  const { groundTruth: _withheld, ...researchInput } = simulationCase;
  void _withheld;
  return researchInput;
}

export async function runAtomicCaseBatch<T>(input: {
  cases: Array<{ caseId: string }>;
  budgetUsd: number;
  initialCostUsd?: number;
  runCase: (row: { caseId: string }) => Promise<{ value: T; costUsd: number }>;
}): Promise<AtomicBatchResult<T>> {
  let cost = input.initialCostUsd ?? 0;
  const completed: T[] = [];
  let stoppedBeforeCaseId: string | null = null;
  for (const row of input.cases) {
    if (cost >= input.budgetUsd) {
      stoppedBeforeCaseId = row.caseId;
      break;
    }
    // The budget check is only here, before starting. The awaited case is atomic.
    const result = await input.runCase(row);
    completed.push(result.value);
    cost += Math.max(0, result.costUsd);
  }
  return {
    completed,
    stoppedBeforeCaseId,
    stopReason: stoppedBeforeCaseId ? "BUDGET_EXHAUSTED" : "QUEUE_EXHAUSTED",
    budgetUsd: input.budgetUsd,
    finalCostUsd: cost,
    overrunUsd: Math.max(0, cost - input.budgetUsd),
  };
}

export function buildFinalUnresolvedEntry(
  entry: EscalationQueueEntry,
  input: { now: string; runId: string | null; attemptCount?: number; remainingEvidenceGaps?: string[]; exhaustedActions?: string[] },
): FinalUnresolvedEntry {
  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_DEFER_TIMESTAMP");
  const next = new Date(now.getTime() + DEFAULT_DEFER_DAYS * 86_400_000).toISOString();
  return {
    ...entry,
    attemptCount: Math.max(1, Math.trunc(input.attemptCount ?? 1)),
    lastAttemptAt: now.toISOString(),
    lastResearchRunId: input.runId,
    remainingEvidenceGaps: unique(input.remainingEvidenceGaps ?? entry.evidenceGaps),
    exhaustedActions: unique(input.exhaustedActions ?? entry.recommendedNextActions),
    nextEligibleAt: next,
    reactivationTriggers: ["NEW_LISTING", "NEW_IMAGE", "NEW_IDENTIFIER", "CATALOG_CHANGED", "NEW_REGIONAL_VARIANT"],
  };
}

export function isDeferredCaseEligible(entry: FinalUnresolvedEntry, now: string, trigger?: string | null): boolean {
  if (trigger && entry.reactivationTriggers.includes(trigger as FinalUnresolvedEntry["reactivationTriggers"][number])) return true;
  return Date.parse(now) >= Date.parse(entry.nextEligibleAt);
}
