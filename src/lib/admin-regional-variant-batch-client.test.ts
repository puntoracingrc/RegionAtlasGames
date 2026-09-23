import assert from "node:assert/strict";
import test from "node:test";
import { RegionalBatchSubmissionError, submitRegionalVariantBatch } from "./admin-regional-variant-batch-client";

const body = {
  title: "Example",
  platformSlug: "ps4",
  physicalVariant: "Standard",
  publishNow: true,
  groups: [{ markets: ["US", "CA"], barcode: "012345678905" }, { markets: ["JP"] }],
};

function fakeFetch(handler: (action: string, rowIndex?: number) => Response): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { action: string; rowIndex?: number };
    return handler(request.action, request.rowIndex);
  }) as typeof fetch;
}

test("large Admin submissions use one row per request and finalize once", async () => {
  const calls: string[] = [];
  const progress: string[] = [];
  const result = await submitRegionalVariantBatch(body, (completed, total) => {
    progress.push(`${completed}/${total}`);
  }, fakeFetch((action, rowIndex) => {
    calls.push(`${action}:${rowIndex ?? "-"}`);
    return Response.json({ ok: true, rowIndex, redirect: "/catalogo/example" });
  }));
  assert.deepEqual(calls, ["row:0", "row:1", "row:2", "finalize:-"]);
  assert.deepEqual(progress, ["0/3", "1/3", "2/3", "3/3"]);
  assert.equal(result.regionalRecordCount, 3);
  assert.equal(result.redirect, "/catalogo/example");
});

test("a timed-out row advances only after an exact published match", async () => {
  const calls: string[] = [];
  const result = await submitRegionalVariantBatch(body, () => {}, fakeFetch((action, rowIndex) => {
    calls.push(`${action}:${rowIndex ?? "-"}`);
    if (action === "row" && rowIndex === 1) return new Response("Gateway Timeout", { status: 504 });
    if (action === "status") return Response.json({ ok: true, rowIndex, status: "MATCHING", redirect: "/catalogo/example" });
    return Response.json({ ok: true, rowIndex, redirect: "/catalogo/example" });
  }));
  assert.deepEqual(calls, ["row:0", "row:1", "status:1", "row:2", "finalize:-"]);
  assert.equal(result.regionalRecordCount, 3);
});

test("an uncertain or conflicting row stops without resending it or later rows", async () => {
  const calls: string[] = [];
  await assert.rejects(
    submitRegionalVariantBatch(body, () => {}, fakeFetch((action, rowIndex) => {
      calls.push(`${action}:${rowIndex ?? "-"}`);
      if (action === "row" && rowIndex === 1) return new Response("Gateway Timeout", { status: 504 });
      if (action === "status") return Response.json({ ok: true, rowIndex, status: "CONFLICT" });
      return Response.json({ ok: true, rowIndex });
    })),
    /Identidad 2 de 3.*no coinciden/,
  );
  assert.deepEqual(calls, ["row:0", "row:1", "status:1"]);
});

test("a normal duplicate conflict is not mistaken for timeout recovery", async () => {
  const calls: string[] = [];
  await assert.rejects(
    submitRegionalVariantBatch(body, () => {}, fakeFetch((action, rowIndex) => {
      calls.push(`${action}:${rowIndex ?? "-"}`);
      return Response.json({ error: "Ya existe" }, { status: 409 });
    })),
    /Ya existe/,
  );
  assert.deepEqual(calls, ["row:0"]);
});

test("a missing timed-out row offers resume without repeating published predecessors", async () => {
  const firstCalls: string[] = [];
  await assert.rejects(
    submitRegionalVariantBatch(body, () => {}, fakeFetch((action, rowIndex) => {
      firstCalls.push(`${action}:${rowIndex ?? "-"}`);
      if (action === "row" && rowIndex === 1) return new Response("Gateway Timeout", { status: 504 });
      if (action === "status") return Response.json({ ok: true, rowIndex, status: "MISSING" });
      return Response.json({ ok: true, rowIndex });
    })),
    (error: unknown) => error instanceof RegionalBatchSubmissionError && error.rowIndex === 1 && error.retryable,
  );
  assert.deepEqual(firstCalls, ["row:0", "row:1", "status:1"]);

  const resumeCalls: string[] = [];
  await submitRegionalVariantBatch(body, () => {}, fakeFetch((action, rowIndex) => {
    resumeCalls.push(`${action}:${rowIndex ?? "-"}`);
    if (action === "status") return Response.json({ ok: true, rowIndex, status: "MATCHING" });
    return Response.json({ ok: true, rowIndex });
  }), 1);
  assert.deepEqual(resumeCalls, ["status:0", "row:1", "row:2", "finalize:-"]);
});

test("a lost connection never offers a resend while the server may still be writing", async () => {
  const calls: string[] = [];
  const fetcher = (async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { action: string; rowIndex?: number };
    calls.push(`${request.action}:${request.rowIndex ?? "-"}`);
    if (request.action === "row") throw new TypeError("Failed to fetch");
    return Response.json({ ok: true, rowIndex: request.rowIndex, status: "MISSING" });
  }) as typeof fetch;
  await assert.rejects(
    submitRegionalVariantBatch(body, () => {}, fetcher),
    (error: unknown) => error instanceof RegionalBatchSubmissionError && error.rowIndex === 0 && !error.retryable,
  );
  assert.deepEqual(calls, ["row:0", "status:0"]);
});
