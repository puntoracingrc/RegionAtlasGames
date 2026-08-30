import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPcWorkerUpdateRequest,
  isPcWorkerUpdateAction,
  normalizePcWorkerHealth,
  normalizePcWorkerUpdateStatus,
  resolvePcWorkerDeploymentSha,
} from "./price-worker-update";

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("builds a fixed official main update request", () => {
  const request = buildPcWorkerUpdateRequest(SHA, "update_only", {
    now: new Date("2026-08-29T16:00:00.000Z"),
    suffix: "test",
  });

  assert.equal(request.mode, "git_fast_forward_main_v1");
  assert.equal(request.repository, "puntoracingrc/RegionAtlasGames");
  assert.equal(request.branch, "main");
  assert.equal(request.targetSha, SHA);
  assert.equal(request.requestId, "worker-update-1788019200000-test");
  assert.equal(request.weeklyControl, undefined);
});

test("keeps the modern automatic sources bounded and review-only", () => {
  const request = buildPcWorkerUpdateRequest(SHA.toUpperCase(), "automatic_sources", {
    now: new Date("2026-08-29T16:00:00.000Z"),
    suffix: "pilot",
  });

  assert.equal(request.targetSha, SHA);
  assert.deepEqual(request.weeklyControl, {
    enabled: true,
    platforms: ["ps4", "ps5", "switch2"],
    pagesPerRun: 1,
    delaySeconds: 8,
    jitterSeconds: 3,
    backoffHours: 24,
    intervalDays: 7,
  });
});

test("rejects abbreviated commits and unknown actions", () => {
  assert.throws(() => buildPcWorkerUpdateRequest("0123456", "update_only"));
  assert.equal(resolvePcWorkerDeploymentSha("0123456"), null);
  assert.equal(resolvePcWorkerDeploymentSha(SHA.toUpperCase()), SHA);
  assert.equal(isPcWorkerUpdateAction("automatic_sources"), true);
  assert.equal(isPcWorkerUpdateAction("ps4_pilot"), true);
  assert.equal(isPcWorkerUpdateAction("run_command"), false);
});

test("normalizes public worker telemetry without trusting extra fields", () => {
  const health = normalizePcWorkerHealth({
    checkedAt: "2026-08-29T16:00:00Z",
    runnerId: "windows-pc-worker",
    hostname: "PC",
    secret: "must-not-surface",
    git: {
      ok: true,
      commitSha: SHA,
      branch: "main",
      clean: true,
      updateCapability: "git_fast_forward_main_v1",
    },
    todoConsolasWeekly: {
      enabled: true,
      platforms: "ps4",
      source: "admin_control",
    },
  });
  const status = normalizePcWorkerUpdateStatus({
    ok: false,
    status: "error",
    targetSha: SHA,
    error: "checkout sucio",
    internal: { token: "hidden" },
  });

  assert.equal(health.available, true);
  assert.equal(health.git.commitSha, SHA);
  assert.equal(health.todoConsolasWeekly.platforms, "ps4");
  assert.equal("secret" in health, false);
  assert.equal(status.status, "error");
  assert.equal(status.error, "checkout sucio");
  assert.equal("internal" in status, false);
});
