import assert from "node:assert/strict";
import test from "node:test";
import {
  inferRemoteJobErrorFromLog,
  type AdminPriceJobMeta,
} from "./admin-price-collect";

function runningJob(): AdminPriceJobMeta {
  return {
    jobId: "stale-job",
    status: "running",
    catalogId: "ps5-missing-game",
    startedAt: "2026-06-20T04:00:22.000Z",
  };
}

test("infers a missing-game failure without inventing a finish timestamp", () => {
  const inferred = inferRemoteJobErrorFromLog(
    runningJob(),
    "Juego no encontrado: ps5-missing-game\n",
  );

  assert.equal(inferred.status, "error");
  assert.equal(inferred.finishedAt, undefined);
  assert.equal(
    inferred.error,
    "Juego no encontrado en el worker: ps5-missing-game",
  );
});

test("preserves a real finish timestamp when enriching a failed job", () => {
  const inferred = inferRemoteJobErrorFromLog(
    {
      ...runningJob(),
      finishedAt: "2026-06-20T04:01:00.000Z",
    },
    "RuntimeError: collector failed\n",
  );

  assert.equal(inferred.status, "error");
  assert.equal(inferred.finishedAt, "2026-06-20T04:01:00.000Z");
  assert.equal(inferred.error, "RuntimeError: collector failed");
});

test("normalizes Windows line endings before rendering a worker log", () => {
  const normalized = inferRemoteJobErrorFromLog({
    ...runningJob(),
    status: "done",
    logTail: "Primera linea\r\nSegunda linea\rUltima linea",
  });

  assert.equal(normalized.logTail, "Primera linea\nSegunda linea\nUltima linea");
});
