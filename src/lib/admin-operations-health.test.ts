import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCollectors,
  classifyHygieneAudit,
  classifyRunnerQueue,
  classifyStagingAutomation,
  classifyWorkflowRun,
  worstAdminHealthSignal,
  type AdminWorkflowRun,
} from "./admin-operations-health";
import { mapWithConcurrency } from "./catalog-staging-storage";
import type { CatalogStagingIndex } from "./catalog-staging-types";
import type { LocalGameRunnerJob } from "./local-game-runner-jobs";

const NOW = new Date("2026-08-29T12:00:00.000Z");

function workflow(input: Partial<AdminWorkflowRun> = {}): AdminWorkflowRun {
  return {
    id: 1,
    name: "Test",
    status: "completed",
    conclusion: "success",
    event: "schedule",
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T08:10:00.000Z",
    url: "https://example.test/run/1",
    headSha: "abc",
    ...input,
  };
}

function staging(input: Partial<CatalogStagingIndex> = {}): CatalogStagingIndex {
  return {
    updatedAt: "2026-08-29T10:00:00.000Z",
    pcIds: [1, 2],
    byPlatform: {
      ps5: { games: 2, units: 2, pendingEnrich: 2, enriched: 0, promoted: 0 },
    },
    ...input,
  };
}

function runnerJob(input: Partial<LocalGameRunnerJob> = {}): LocalGameRunnerJob {
  return {
    id: "job-1",
    jobType: "catalog_enrichment",
    status: "pending",
    source: "catalog-ai",
    platformSlug: "ps5",
    offerType: "new",
    limit: 5,
    startPage: 0,
    maxPages: 1,
    skipRecentDays: 0,
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T08:00:00.000Z",
    ...input,
  };
}

test("workflow health distinguishes success, stale and failure", () => {
  assert.equal(classifyWorkflowRun(workflow(), { label: "Daily", expectedWithinHours: 24, now: NOW }).level, "ok");
  assert.equal(
    classifyWorkflowRun(workflow({ updatedAt: "2026-08-27T08:00:00.000Z" }), {
      label: "Daily",
      expectedWithinHours: 24,
      now: NOW,
    }).level,
    "watch",
  );
  assert.equal(
    classifyWorkflowRun(workflow({ conclusion: "failure" }), { label: "Daily", now: NOW }).level,
    "action",
  );
});

test("staging with pending work and no cron telemetry is actionable", () => {
  const signal = classifyStagingAutomation(staging(), NOW);
  assert.equal(signal.level, "action");
  assert.match(signal.detail, /2 fichas pendientes/);
});

test("recent staging cron and an empty queue are healthy", () => {
  const signal = classifyStagingAutomation(
    staging({
      lastEnrichmentRun: {
        startedAt: "2026-08-29T09:00:00.000Z",
        completedAt: "2026-08-29T09:01:00.000Z",
        elapsedMs: 60_000,
        scanned: 4,
        attempted: 2,
        enriched: 2,
        failed: 0,
        stoppedByBudget: false,
      },
    }),
    NOW,
  );
  assert.equal(signal.level, "ok");
  assert.equal(classifyRunnerQueue([], NOW).level, "ok");
});

test("runner queue escalates after 24 hours", () => {
  assert.equal(classifyRunnerQueue([runnerJob()], NOW).level, "watch");
  assert.equal(
    classifyRunnerQueue(
      [runnerJob({ createdAt: "2026-08-27T08:00:00.000Z", updatedAt: "2026-08-27T08:00:00.000Z" })],
      NOW,
    ).level,
    "action",
  );
});

test("paused collectors and an old hygiene report are explicit", () => {
  assert.equal(classifyCollectors({ total: 15, manualActive: 0, rotationActive: 0 }).level, "paused");
  assert.equal(
    classifyHygieneAudit({ status: "done", finishedAt: "2026-06-01T00:00:00.000Z" }, NOW).level,
    "watch",
  );
});

test("worst signal prioritizes action", () => {
  assert.equal(
    worstAdminHealthSignal([
      { level: "ok", label: "ok", detail: "ok" },
      { level: "action", label: "bad", detail: "bad" },
      { level: "watch", label: "watch", detail: "watch" },
    ]).label,
    "bad",
  );
});

test("unknown state is not hidden behind a healthy signal", () => {
  assert.equal(
    worstAdminHealthSignal([
      { level: "ok", label: "ok", detail: "ok" },
      { level: "unknown", label: "unknown", detail: "unknown" },
    ]).level,
    "unknown",
  );
});

test("bounded concurrency preserves order and respects the limit", async () => {
  let active = 0;
  let maxActive = 0;
  const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5 * (7 - value)));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(values, [2, 4, 6, 8, 10, 12]);
  assert.equal(maxActive, 3);
});
