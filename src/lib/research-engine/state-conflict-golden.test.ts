import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { budgetAllows, budgetExhaustionReason, defaultResearchBudget, emptyResearchBudgetUsage, recordBudgetUse, recordModelUsage } from "./budget";
import { compareResearchCatalogBoundary, hashResearchCatalogBoundary } from "./catalog-immutability";
import { resolveResearchClaimRecords } from "./conflict-engine";
import { evaluateResearchGoldenSet } from "./golden-evaluator";
import { ResearchRunStore, createResearchState, durableTask } from "./state-store";
import type { ResearchClaimRecord, ResearchEvidenceRecord } from "./v2-types";

function evidence(id: string, sourceId: string, reliability: number): ResearchEvidenceRecord {
  return {
    id,
    runId: "run",
    taskId: "task",
    sourceId,
    sourceUrl: `https://${sourceId}.example/item`,
    canonicalUrl: `https://${sourceId}.example/item`,
    sourceType: "EXACT_PHYSICAL_PHOTO",
    host: `${sourceId}.example`,
    fetchedAt: "2026-09-16T00:00:00Z",
    evidenceType: "EXACT_PHYSICAL_PHOTO",
    subjectBinding: { game: "MATCH", platform: "MATCH", edition: "MATCH", variant: "UNKNOWN", component: "MATCH", risks: [] },
    relevantExcerpt: null,
    imageUrl: `https://${sourceId}.example/back.jpg`,
    imageHash: id,
    textHash: null,
    capabilities: ["BARCODE"],
    reliability,
    component: "BACK",
  };
}

function claim(id: string, evidenceId: string, sourceId: string, value: string): ResearchClaimRecord {
  return {
    id,
    runId: "run",
    taskId: "task",
    subjectId: "subject",
    gameId: "game",
    platformSlug: "ps5",
    editionId: "edition",
    variantId: null,
    component: "BACK",
    field: "BARCODE",
    value,
    sourceId,
    sourceUrl: `https://${sourceId}.example/item`,
    evidenceId,
    confidence: 0.95,
    status: "CANDIDATE",
    validationErrors: [],
    createdAt: "2026-09-16T00:00:00Z",
  };
}

test("claim reducer confirms exact evidence but preserves a strong competing value", () => {
  const oneEvidence = evidence("ev-a", "scan-a", 100);
  const confirmed = resolveResearchClaimRecords({
    field: "BARCODE",
    evidence: [oneEvidence],
    claims: [claim("claim-a", "ev-a", "scan-a", "4006381333931")],
  });
  assert.equal(confirmed.resolution.status, "CONFIRMED");
  assert.equal(confirmed.claims[0].status, "VALIDATED");

  const conflicting = resolveResearchClaimRecords({
    field: "BARCODE",
    evidence: [oneEvidence, evidence("ev-b", "scan-b", 100)],
    claims: [
      claim("claim-a", "ev-a", "scan-a", "4006381333931"),
      claim("claim-b", "ev-b", "scan-b", "5012345678900"),
    ],
  });
  assert.equal(conflicting.resolution.status, "CONFLICT");
  assert.equal(conflicting.conflicts.length, 1);
  assert.equal(conflicting.conflicts[0].severity, "HIGH");
  assert.ok(conflicting.claims.every((row) => row.status === "CONFLICT"));
});

test("budget defaults, counters, token and cost ceilings are enforced", () => {
  const p0 = defaultResearchBudget("P0");
  const p1 = defaultResearchBudget("P1");
  const p2 = defaultResearchBudget("P2");
  assert.deepEqual([p0.maxSearches, p1.maxSearches, p2.maxSearches], [20, 12, 6]);
  assert.deepEqual([p0.maxPages, p1.maxPages, p2.maxPages], [30, 20, 10]);
  assert.deepEqual([p0.maxImages, p1.maxImages, p2.maxImages], [20, 12, 6]);
  assert.deepEqual([p0.maxAgentTurns, p1.maxAgentTurns, p2.maxAgentTurns], [12, 8, 4]);
  let usage = emptyResearchBudgetUsage();
  usage = recordBudgetUse(usage, "searches", p2.maxSearches);
  assert.equal(budgetAllows(p2, usage, "searches"), false);
  assert.equal(budgetExhaustionReason(p2, usage), "SEARCH_BUDGET_EXHAUSTED");
  usage = recordModelUsage(usage, { provider: "openai", model: "cheap", calls: 1, inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.01 });
  assert.equal(usage.inputTokens, 10);
  assert.equal(usage.estimatedCostUsd, 0.01);
});

test("durable queue and run state survive a fresh store instance", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "regionatlas-research-state-"));
  try {
    const task = durableTask({ id: "task-1", subjectId: "pilot:subject", targetField: "BARCODE", question: "Which barcode?", priority: "P1" });
    const state = createResearchState({ runId: "run-1", taskId: task.id, subjectId: task.subjectId, targetField: task.targetField, priority: task.priority });
    state.queriesAttempted = ["first query"];
    state.normalizedQueries = ["first query"];
    const first = new ResearchRunStore(directory);
    await first.upsertTasks([task]);
    await first.writeState(state);

    const afterRestart = new ResearchRunStore(directory);
    assert.deepEqual(await afterRestart.readQueue(), [task]);
    assert.deepEqual(await afterRestart.readState("run-1"), state);
    const updated = await afterRestart.updateTask(task.id, { status: "IN_PROGRESS" });
    assert.equal(updated?.status, "IN_PROGRESS");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("catalog immutability boundary is stable for a read-only evaluation", async () => {
  const before = await hashResearchCatalogBoundary();
  await evaluateResearchGoldenSet();
  const after = await hashResearchCatalogBoundary();
  assert.deepEqual(compareResearchCatalogBoundary(before, after), { identical: true, changed: [] });
  assert.ok(before.files.some((file) => file.path === "data/catalog.json"));
  assert.ok(before.files.some((file) => file.path.startsWith("data/catalog-edition-guides")));
});

test("physical and N64 golden sets pass without entering runtime knowledge", async () => {
  const result = await evaluateResearchGoldenSet();
  assert.equal(result.document.runtimeUse, "FORBIDDEN");
  assert.equal(result.results.length, 15);
  assert.equal(result.failed, 0);
  assert.equal(result.results.filter((row) => row.group === "n64").length, 6);
});
