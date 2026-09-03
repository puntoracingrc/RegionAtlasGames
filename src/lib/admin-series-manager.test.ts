import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("keeps bundled saga memberships when runtime data files are unavailable", async () => {
  const originalCwd = process.cwd();
  const temporaryCwd = mkdtempSync(path.join(os.tmpdir(), "region-atlas-series-"));
  const overlayPath = path.join(temporaryCwd, "data", "admin", "series-overlay.json");

  mkdirSync(path.dirname(overlayPath), { recursive: true });
  writeFileSync(
    overlayPath,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      series: {
        "fifa-ea-sports-fc": {
          slug: "fifa-ea-sports-fc",
          name: "FIFA/EA Sports FC",
          gameIds: [],
        },
      },
      assignments: {},
    }),
  );

  process.chdir(temporaryCwd);
  try {
    const { listPublicSeriesIndexEntries } = await import("./admin-series-manager");
    const entries = await listPublicSeriesIndexEntries();
    const fifa = entries.find((entry) => entry.slug === "fifa-ea-sports-fc");

    assert.ok(entries.length > 400);
    assert.ok(fifa);
    assert.ok(fifa.gameCount > 0);
    assert.equal(fifa.gameCount, fifa.gameIds.length);
  } finally {
    process.chdir(originalCwd);
    rmSync(temporaryCwd, { recursive: true, force: true });
  }
});
