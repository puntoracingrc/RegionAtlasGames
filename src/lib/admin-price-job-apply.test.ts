import assert from "node:assert/strict";
import test from "node:test";
import { validateWallapopBatchResult } from "./admin-price-job-apply";
import type { AdminPriceJobMeta } from "./admin-price-collect";
import type { CatalogGame } from "./types";

function batchJob(): AdminPriceJobMeta {
  return {
    jobId: "wallapop-batch-test",
    status: "done",
    source: "wallapop",
    catalogIds: ["ps4-alpha", "ps4-beta"],
    resultCatalogIds: ["ps4-alpha", "ps4-beta", "ps4-alpha-usa"],
    verifiedCatalogIds: ["ps4-alpha", "ps4-alpha-usa"],
    resultPath: "results/wallapop-batch-test/catalog-price-results.json",
    startedAt: "2026-08-30T12:00:00Z",
  };
}

function game(id: string): CatalogGame {
  return {
    id,
    title: id,
    platformSlug: "ps4",
    region: id.endsWith("-usa") ? "USA" : "PAL España",
    listingStatus: "listed",
  } as CatalogGame;
}

test("accepts a scoped Wallapop result including an explicitly routed regional variant", () => {
  const games = [game("ps4-alpha"), game("ps4-beta"), game("ps4-alpha-usa")];
  const result = validateWallapopBatchResult(
    {
      schemaVersion: 1,
      jobId: "wallapop-batch-test",
      source: "wallapop",
      platformSlug: "ps4",
      searchedCatalogIds: ["ps4-alpha", "ps4-beta"],
      catalogIds: ["ps4-alpha", "ps4-beta", "ps4-alpha-usa"],
      verifiedCatalogIds: ["ps4-alpha", "ps4-alpha-usa"],
      games,
    },
    batchJob(),
  );

  assert.ok(Array.isArray(result));
  assert.deepEqual(result.map((item) => item.id), games.map((item) => item.id));
});

test("rejects a Wallapop artifact that substitutes a searched game", () => {
  const result = validateWallapopBatchResult(
    {
      schemaVersion: 1,
      jobId: "wallapop-batch-test",
      source: "wallapop",
      platformSlug: "ps4",
      searchedCatalogIds: ["ps4-alpha", "ps4-attacker"],
      catalogIds: ["ps4-alpha", "ps4-beta", "ps4-alpha-usa"],
      verifiedCatalogIds: ["ps4-alpha"],
      games: [game("ps4-alpha"), game("ps4-beta"), game("ps4-alpha-usa")],
    },
    batchJob(),
  );

  assert.ok(!Array.isArray(result));
  assert.match(result.error, /tanda distinta/i);
});
