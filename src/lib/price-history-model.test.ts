import assert from "node:assert/strict";
import test from "node:test";
import { mergePublishedPriceHistory, priceHistoryAt } from "./price-history-model";
import { getPublishedPriceHistory } from "./price-history";
import { planDirectPrice, type PriceReceipt, type PriceConnectorGame, type PriceSubmission } from "./direct-price-connector";

const at = "2026-09-19T21:05:31.105Z";
const receipt: PriceReceipt = {
  batchId: "batch", digest: "digest", catalogId: "ps4-hack-gu-last-recode", taskId: "task", publishedAt: at,
  conditions: [{ state: "complete", before: 65, mean: 75, after: 70, listings: [] }],
};

test("existing receipt restores .hack's 75 -> 65 -> 70 history, not mean 75 or delivered 73", () => {
  const game = { id: receipt.catalogId, priceConnectorReceipts: [receipt], estimatedPriceComplete: 70, estimatedTotalToSpainComplete: 73 } as PriceConnectorGame;
  const history = getPublishedPriceHistory(game);
  assert.deepEqual(history.map(point => point.complete), [75, 65, 70]);
  assert.equal(history.at(-1)?.at, at);
  assert.equal(history.at(-1)?.sealed, undefined);
});

test("receipts are scoped to exact catalog identity, deduplicated, ordered, and use final published amounts", () => {
  const history = mergePublishedPriceHistory(receipt.catalogId, [{ at, complete: 65 }], [
    { ...receipt, catalogId: "usa-other", conditions: [{ ...receipt.conditions[0], after: 999 }] },
    receipt, receipt,
  ]);
  assert.deepEqual(history, [{ at, complete: 70 }]);
  assert.deepEqual(mergePublishedPriceHistory("jp-other", [], [receipt]), []);
});

test("independent condition publications preserve observations without inventing points", () => {
  const second = { ...receipt, batchId: "sealed-batch", publishedAt: "2026-09-20T10:00:00Z", conditions: [{ ...receipt.conditions[0], state: "sealed" as const, after: 100 }] };
  const history = mergePublishedPriceHistory(receipt.catalogId, [], [second, receipt]);
  assert.equal(history[0].sealed, undefined);
  assert.equal(history[1].complete, undefined);
  assert.deepEqual(priceHistoryAt(history, Date.parse(second.publishedAt)), {
    at: "2026-09-20T10:00:00.000Z", complete: 70, sealed: 100,
  });
});

test("invalid dates and amounts cannot create fake graph points; explicit null remains a gap", () => {
  assert.deepEqual(mergePublishedPriceHistory("test", [
    { at: "bad-date", complete: 10 }, { at, complete: NaN, sealed: -5 },
    { at: "2026-08-01", complete: 0 }, { at, sealed: null },
  ]), [{ at, sealed: null }]);
});

test("new publication and retry expose one history event without another write", () => {
  const game = { id: "test", title: "Test", platformSlug: "ps4", region: "USA", estimatedPriceComplete: 65 } as PriceConnectorGame;
  const input: PriceSubmission = {
    schemaVersion: 1, batchId: "new", taskId: "task", catalogId: game.id, catalogTitle: game.title,
    platformSlug: game.platformSlug, region: game.region, currency: "EUR",
    conditions: [{ state: "complete", meanEur: 75, listings: [{ listingId: "one", url: "https://example.com/one", priceEur: 75 }] }],
  };
  const published = planDirectPrice(game, input, at);
  const retry = planDirectPrice(published.game, input, "2026-09-20T00:00:00Z");
  assert.equal(retry.alreadyApplied, true);
  assert.deepEqual(getPublishedPriceHistory(retry.game), [{ at, complete: 70 }]);
});
