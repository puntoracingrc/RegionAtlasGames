import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("reserves AI quota atomically under concurrent requests", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-ai-usage-"));
  const previous = {
    appDataDir: process.env.APP_DATA_DIR,
    vercel: process.env.VERCEL,
    blobToken: process.env.BLOB_READ_WRITE_TOKEN,
    blobStoreId: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    const { consumeAiQuota, getAiUsageCount } = await import("./ai-listing-analysis");
    const results = await Promise.all(
      Array.from({ length: 40 }, () => consumeAiQuota("quota-user", "pro")),
    );
    assert.equal(results.filter((result) => result.allowed).length, 30);
    assert.equal(results.filter((result) => !result.allowed).length, 10);
    assert.equal(await getAiUsageCount("quota-user"), 30);
  } finally {
    if (previous.appDataDir === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = previous.appDataDir;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.blobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous.blobToken;
    if (previous.blobStoreId === undefined) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = previous.blobStoreId;
    await rm(directory, { recursive: true, force: true });
  }
});
