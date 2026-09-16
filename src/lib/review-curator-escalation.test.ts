import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEscalationQueue,
  buildFinalUnresolvedEntry,
  isDeferredCaseEligible,
  researchInputForCase,
  runAtomicCaseBatch,
  runStageA,
  type CuratorSimulationCase,
} from "./review-curator-escalation";
import { curatorHash, type PhysicalEvidenceBundleV1 } from "./review-curator";
import type { ResearchKnowledgePackV1 } from "./research-engine/knowledge-pack";

function bundle(overrides: Partial<PhysicalEvidenceBundleV1> = {}): PhysicalEvidenceBundleV1 {
  const base: PhysicalEvidenceBundleV1 = {
    schemaVersion: 1, reviewItemId: "case-1", queueVersion: "q1", inputHash: curatorHash("input"), evidenceHash: curatorHash("evidence"),
    source: "fixture", capturedAt: null, reason: null, triageBucket: null,
    listing: { id: "listing-1", url: null, title: "Example N64", description: null, searchQuery: null },
    catalog: { searchedCatalogId: "n64-example", candidateCatalogId: "n64-example", alternatives: [] },
    subject: { identity: "Example", platform: "n64", edition: "standard", physicalVariant: null },
    images: [], originalImages: [], productGraph: { nodes: [], relations: [] }, observations: [], identifiers: [],
    regional: { targetRegion: "PAL España", detectedRegion: "PAL España", marketBinding: "UNBOUND", evidence: [], packagingLanguages: [], distributors: [], ratingSystems: [] },
    condition: { bucket: "unknown", confidence: null, evidence: [], manualExpected: null, originalContentsExpected: [] },
    price: { amount: 10, shipping: null, currency: "EUR", estimatedTotalToSpain: null }, confidence: null,
    conflicts: [], confirmed: ["candidate_identity"], rejected: [], uncertain: ["market_region", "condition"],
    evidenceGaps: [{ field: "MARKET_REGION", code: "MISSING_MARKET_PROOF", missingProof: "Need physical market evidence", recommendedSourceTypes: ["EXACT_PHYSICAL_PHOTO"] }],
  };
  const routeOrder = ["LOCAL_KNOWLEDGE", "OWN_SCANS", "EXISTING_DIRECT_URLS", "EXACT_IDENTIFIERS", "SPECIALIZED_SOURCES", "OFFICIAL_SOURCES", "PHYSICAL_SPECIMENS", "GENERIC_SEARCH"] as const;
  const knowledgePack = {
    schemaVersion: 1, packId: "fixture-pack", generatedAt: "2026-09-16T00:00:00.000Z", subjectId: "fixture-subject",
    inputHash: overrides.inputHash ?? base.inputHash, evidenceHash: overrides.evidenceHash ?? base.evidenceHash,
    catalogContext: {}, knownVariants: [], knownIdentifiers: [], ownedScans: [], knownDirectUrls: [], existingEvidence: [],
    fieldPlans: { MARKET_REGION: { field: "MARKET_REGION", knownFacts: ["fixture"], knownConflicts: [], directUrls: [], preferredSourceIds: ["regionatlas-own-scan"], sourceCapabilities: [], exactQueries: [], forbiddenInferences: [], routeOrder } },
    forbiddenInferences: [], sourcePriority: routeOrder, researchTasks: base.evidenceGaps, loadedKnowledgeFiles: [],
  } as unknown as ResearchKnowledgePackV1;
  return { ...base, ...overrides, knowledgePack };
}

function simulationCase(): CuratorSimulationCase {
  const row = bundle();
  return { caseId: "case-1", origin: "MATURE_PLATFORM_WORKER", platform: "n64", bundle: row, workerEvidence: { listing: row.listing }, groundTruth: { decision: "REJECT" } };
}

test("Stage A is evidence-only and only DEFER is escalated", () => {
  const row = simulationCase();
  const result = runStageA({ simulationCase: row, catalogIds: new Set(["n64-example"]), gitSha: "abc", runId: "run" });
  assert.equal(result.externalRequests, 0);
  assert.equal(result.resolution.braveCalls, 0);
  assert.equal(result.resolution.openAiCalls, 0);
  assert.equal(result.resolution.decision, "DEFER");
  assert.equal(buildEscalationQueue([row], [result]).length, 1);
  const rejected = runStageA({ simulationCase: { ...row, bundle: bundle({ listing: { ...row.bundle.listing, title: "Fridge magnet N64" } }) }, catalogIds: new Set(), gitSha: "abc", runId: "run" });
  assert.equal(rejected.resolution.decision, "REJECT");
  assert.equal(buildEscalationQueue([row], [rejected]).length, 0);
});

test("Stage A fails closed when the shared knowledge pack is missing", () => {
  const row = simulationCase();
  const withoutPack = { ...row, bundle: { ...row.bundle, knowledgePack: undefined } };
  assert.throws(
    () => runStageA({ simulationCase: withoutPack, catalogIds: new Set(), gitSha: "abc", runId: "run" }),
    /MISSING_RESEARCH_KNOWLEDGE_PACK/,
  );
});

test("unchanged Stage A baseline is reused but changed evidence is recomputed", () => {
  const row = simulationCase();
  const first = runStageA({ simulationCase: row, catalogIds: new Set(), gitSha: "a", runId: "first" });
  const reused = runStageA({ simulationCase: row, catalogIds: new Set(), gitSha: "b", runId: "second", baseline: { inputHash: row.bundle.inputHash, evidenceHash: row.bundle.evidenceHash, resolution: first.resolution } });
  assert.equal(reused.reusedBaseline, true);
  assert.equal(reused.resolution.runId, "second");
  const changed = runStageA({ simulationCase: { ...row, bundle: bundle({ evidenceHash: curatorHash("changed") }) }, catalogIds: new Set(), gitSha: "b", runId: "third", baseline: { inputHash: row.bundle.inputHash, evidenceHash: row.bundle.evidenceHash, resolution: first.resolution } });
  assert.equal(changed.reusedBaseline, false);
});

test("case budget is checked between cases and an active case completes atomically", async () => {
  const started: string[] = [];
  const result = await runAtomicCaseBatch({
    cases: [{ caseId: "a" }, { caseId: "b" }], budgetUsd: 3,
    runCase: async (row) => { started.push(row.caseId); return { value: row.caseId, costUsd: 3.1 }; },
  });
  assert.deepEqual(started, ["a"]);
  assert.deepEqual(result.completed, ["a"]);
  assert.equal(result.stoppedBeforeCaseId, "b");
  assert.ok(result.overrunUsd > 0);
});

test("final DEFER persists with backoff and can reactivate on evidence trigger", () => {
  const row = simulationCase();
  const stage = runStageA({ simulationCase: row, catalogIds: new Set(), gitSha: "a", runId: "r" });
  const entry = buildEscalationQueue([row], [stage])[0];
  const deferred = buildFinalUnresolvedEntry(entry, { now: "2026-09-16T00:00:00.000Z", runId: "deep-1" });
  assert.equal(deferred.nextEligibleAt, "2026-10-16T00:00:00.000Z");
  assert.equal(isDeferredCaseEligible(deferred, "2026-09-17T00:00:00.000Z"), false);
  assert.equal(isDeferredCaseEligible(deferred, "2026-09-17T00:00:00.000Z", "NEW_IMAGE"), true);
});

test("ground truth is withheld while worker evidence and component observations survive", () => {
  const observation = { id: "o1", imageIndex: 1, component: "MANUAL_FRONT" as const, productNodeType: "DOCUMENT" as const, role: "manual", textSnippets: ["NUS-P-NMVE-EUR"], productCodes: ["NUS-P-NMVE-EUR"], barcodes: [], languages: ["ES"], ratingSystems: [], distributors: [], editionMarkers: [] };
  const row = simulationCase();
  row.bundle = bundle({ observations: [observation] });
  const research = researchInputForCase(row);
  assert.equal("groundTruth" in research, false);
  assert.deepEqual(research.bundle.observations, [observation]);
  assert.deepEqual(research.workerEvidence, row.workerEvidence);
});
