import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import test from "node:test";
import { consumeMagicLinkToken, createMagicLinkToken } from "./magic-link";

test("stores only a token hash and consumes a magic link once", async () => {
  const original = {
    appDataDir: process.env.APP_DATA_DIR,
    vercel: process.env.VERCEL,
    blobToken: process.env.BLOB_READ_WRITE_TOKEN,
    blobStoreId: process.env.BLOB_STORE_ID,
  };
  const dir = mkdtempSync(path.join(tmpdir(), "region-atlas-magic-link-"));

  process.env.APP_DATA_DIR = dir;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    const created = await createMagicLinkToken("User@Example.com");
    assert.equal("error" in created, false);
    if ("error" in created) return;

    const stored = readFileSync(path.join(dir, "auth", "magic-tokens.json"), "utf8");
    assert.equal(stored.includes(created.token), false);
    assert.match(stored, /"tokenHash":\s*"[a-f0-9]{64}"/);

    assert.deepEqual(await consumeMagicLinkToken(created.token), {
      email: "user@example.com",
    });
    assert.deepEqual(await consumeMagicLinkToken(created.token), {
      error: "Enlace no válido o ya utilizado.",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    restoreEnv("APP_DATA_DIR", original.appDataDir);
    restoreEnv("VERCEL", original.vercel);
    restoreEnv("BLOB_READ_WRITE_TOKEN", original.blobToken);
    restoreEnv("BLOB_STORE_ID", original.blobStoreId);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
