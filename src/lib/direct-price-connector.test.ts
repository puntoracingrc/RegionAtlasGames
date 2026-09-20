import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { authorizePriceConnector, euroCents, meanEuro, parsePriceSubmission, planDirectPrice, preserveDirectPriceReceipts, PriceConnectorError, type PriceSubmission } from "./direct-price-connector";
import type { CatalogGame } from "./types";
import { mutateBlobJsonDocument } from "./json-document-store";
import type { get, head, put } from "@vercel/blob";

const base = { id: "ps4-test", title: "Test", platformSlug: "ps4", region: "PAL España", recommendedPrice: null, pcRefPrice: null, priceSource: null } as CatalogGame;
function input(overrides = {}): PriceSubmission {
  return parsePriceSubmission({ schemaVersion: 1, batchId: "batch-1", catalogId: base.id, catalogTitle: base.title, platformSlug: base.platformSlug, region: base.region, currency: "EUR", taskId: "task-1", conditions: [{ state: "complete", meanEur: 20, listings: [{ listingId: "ebay-1", url: "https://www.ebay.es/itm/123", priceEur: 20 }] }], ...overrides });
}
function errorStatus(operation: () => unknown, status: number) {
  assert.throws(operation, error => error instanceof PriceConnectorError && error.status === status);
}
test("missing condition inserts mean, existing condition blends once", () => {
  const first = planDirectPrice(base, input(), "2026-09-19T12:00:00Z");
  assert.equal(first.game.estimatedPriceComplete, 20);
  assert.equal(first.receipt.conditions[0].before, null);
  const previous = { ...base, estimatedPriceComplete: 10, estimatedPriceSealed: 99 };
  const blended = planDirectPrice(previous, input(), "2026-09-19T12:00:00Z");
  assert.equal(blended.game.estimatedPriceComplete, 15);
  assert.equal(blended.game.estimatedPriceSealed, 99);
  assert.equal(previous.estimatedPriceComplete, 10);
});
test("loose is stored and blended independently with its own shipping total", () => {
  const cartridge = { ...base, id: "n64-test", title: "Test N64", platformSlug: "n64" };
  const submission = input({ catalogId: cartridge.id, catalogTitle: cartridge.title, platformSlug: cartridge.platformSlug, conditions: [{ state: "loose", meanEur: 20, listings: [{ listingId: "loose-1", url: "https://www.wallapop.com/item/1", priceEur: 20 }] }] });
  const inserted = planDirectPrice({ ...cartridge, estimatedShippingToSpainLoose: 3.5 }, submission, "now");
  assert.equal(inserted.game.estimatedPriceLoose, 20);
  assert.equal(inserted.game.estimatedTotalToSpainLoose, 23.5);
  const blended = planDirectPrice({ ...cartridge, estimatedPriceLoose: 10 }, submission, "now");
  assert.equal(blended.game.estimatedPriceLoose, 15);
  assert.equal(blended.game.estimatedPriceComplete, undefined);
});
test("legacy complete and sealed read the immutable old state regardless of key order", () => {
  const submission = input({ conditions: [
    { state: "sealed", meanEur: 22.48, listings: [{ listingId: "new", url: "https://www.ebay.es/itm/2", priceEur: 22.48 }] },
    { state: "complete", meanEur: 22.95, listings: [{ listingId: "used", url: "https://www.ebay.es/itm/3", priceEur: 22.95 }] },
  ] });
  const result = planDirectPrice({ ...base, recommendedPrice: 17 }, submission, "now");
  assert.equal(result.game.estimatedPriceComplete, 19.98);
  assert.equal(result.game.estimatedPriceSealed, 22.48);
});
test("adding sealed alone preserves legacy complete", () => {
  const submission = input({ conditions: [{ state: "sealed", meanEur: 22.48, listings: [{ listingId: "new", url: "https://www.ebay.es/itm/2", priceEur: 22.48 }] }] });
  const result = planDirectPrice({ ...base, recommendedPrice: 17 }, submission, "now");
  assert.equal(result.game.estimatedPriceComplete, 17);
  assert.equal(result.game.estimatedPriceSealed, 22.48);
});
test("retry returns the same receipt and performs no second blend", () => {
  const first = planDirectPrice({ ...base, estimatedPriceComplete: 10 }, input(), "first");
  const retry = planDirectPrice(first.game, input(), "second");
  assert.equal(retry.alreadyApplied, true);
  assert.equal(retry.game, first.game);
  assert.deepEqual(retry.receipt, first.receipt);
  assert.equal(retry.game.estimatedPriceComplete, 15);
});
test("same batch with different content and repeated listing in a different batch are rejected", () => {
  const first = planDirectPrice(base, input(), "first");
  errorStatus(() => planDirectPrice(first.game, input({ taskId: "other-task" }), "second"), 409);
  errorStatus(() => planDirectPrice(first.game, input({ batchId: "batch-2" }), "second"), 409);
});
test("new observations can be inserted later without touching the other condition", () => {
  const first = planDirectPrice(base, input(), "first");
  const second = planDirectPrice(first.game, input({ batchId: "batch-2", conditions: [{ state: "complete", meanEur: 30, listings: [{ listingId: "new-listing", url: "https://www.ebay.es/itm/5", priceEur: 30 }] }] }), "second");
  assert.equal(second.game.estimatedPriceComplete, 25);
  assert.equal(second.game.priceConnectorReceipts?.length, 2);
});
test("strict schema guards money, averages, condition, duplicates and path traversal", () => {
  for (const bad of [-1, 0, NaN, Infinity, "1e2", "10 EUR", 1.005, null]) errorStatus(() => euroCents(bad), 400);
  assert.equal(euroCents("49.95"), 4995);
  assert.equal(meanEuro([{ listingId: "1", url: "x", priceEur: 49.95 }, { listingId: "2", url: "x", priceEur: 31.5 }]), 40.73);
  errorStatus(() => input({ currency: "USD" }), 400);
  errorStatus(() => input({ catalogId: "../index" }), 400);
  errorStatus(() => input({ catalogId: "%2e%2e%2findex" }), 400);
  errorStatus(() => input({ extraField: true }), 400);
  errorStatus(() => input({ conditions: [{ state: "used", meanEur: 20, listings: [] }] }), 400);
  errorStatus(() => input({ conditions: [{ state: "complete", meanEur: 21, listings: [{ listingId: "1", url: "https://example.com/1", priceEur: 20 }] }] }), 400);
  errorStatus(() => input({ conditions: [input().conditions[0], input().conditions[0]] }), 400);
});
test("accepts loose for cartridge platforms and rejects it for optical media", () => {
  const loose = {
    state: "loose",
    meanEur: 15,
    listings: [{ listingId: "cart-1", url: "https://www.ebay.es/itm/cart-1", priceEur: 15 }],
  };
  const cartridge = input({
    catalogId: "n64-test",
    catalogTitle: "Test N64",
    platformSlug: "n64",
    conditions: [loose],
  });
  assert.equal(cartridge.conditions[0].state, "loose");
  const planned = planDirectPrice(
    { ...base, id: "n64-test", title: "Test N64", platformSlug: "n64" },
    cartridge,
    "now",
  );
  assert.equal(planned.game.estimatedPriceLoose, 15);
  assert.equal(planned.game.recommendedPrice, 15);
  errorStatus(() => input({ conditions: [loose] }), 400);
});
test("identity gates exact edition, region and platform without regional keywords in listings", () => {
  errorStatus(() => planDirectPrice(base, input({ region: "USA" }), "now"), 409);
  errorStatus(() => planDirectPrice(base, input({ platformSlug: "ps5" }), "now"), 409);
  errorStatus(() => planDirectPrice(base, input({ catalogTitle: "Test Collector" }), "now"), 409);
  const usa = { ...base, region: "USA" };
  assert.equal(planDirectPrice(usa, input({ region: "USA" }), "now").game.hasEsPrice, false);
});
test("token is scoped, disabled by default and compared through its digest", () => {
  const token = "a".repeat(64);
  const env = { PRICE_CONNECTOR_ENABLED: "1", PRICE_CONNECTOR_TOKEN_SHA256: createHash("sha256").update(token).digest("hex") };
  assert.doesNotThrow(() => authorizePriceConnector(new Request("https://regionatlas.games", { headers: { Authorization: `Bearer ${token}` } }), env));
  errorStatus(() => authorizePriceConnector(new Request("https://regionatlas.games"), env), 401);
  errorStatus(() => authorizePriceConnector(new Request("https://regionatlas.games", { headers: { Authorization: `Bearer ${"b".repeat(64)}` } }), env), 401);
  errorStatus(() => authorizePriceConnector(new Request("https://regionatlas.games"), {}), 503);
});
test("other admin writes preserve the deduplication ledger", () => {
  const current = planDirectPrice(base, input(), "now").game;
  assert.deepEqual(preserveDirectPriceReceipts(current, { ...base, title: "Updated" }).priceConnectorReceipts, current.priceConnectorReceipts);
});
test("provisional estimates never turn verification on and preserve shipping separately", () => {
  const result = planDirectPrice({ ...base, estimatedShippingToSpainComplete: 4.99 }, input(), "now");
  assert.equal(result.game.estimatedPriceComplete, 20);
  assert.equal(result.game.estimatedTotalToSpainComplete, 24.99);
  assert.equal(result.game.priceRegionVerified, false);
  assert.match(result.game.priceSource ?? "", /provisional/);
});

test("a concurrent publisher winning CAS cannot cause a second application", async () => {
  const submission = input();
  let stored = planDirectPrice({ ...base, estimatedPriceComplete: 10 }, submission, "peer").game;
  const winner = stored;
  stored = { ...base, estimatedPriceComplete: 10 };
  let version = "v1";
  let attemptedWrites = 0;
  const metadata = () => ({ url: "https://example.private.blob.vercel-storage.com/game.json", downloadUrl: "https://example.private.blob.vercel-storage.com/game.json", pathname: "game.json", size: Buffer.byteLength(JSON.stringify(stored)), uploadedAt: new Date(0), contentType: "application/json", contentDisposition: "", cacheControl: "private", etag: version });
  const dependencies = {
    get: (async () => ({ statusCode: 200, stream: new Response(JSON.stringify(stored)).body!, headers: new Headers(), blob: metadata() })) as typeof get,
    head: (async () => metadata()) as typeof head,
    put: (async (_pathname, _body, options) => {
      attemptedWrites++;
      assert.equal(options.ifMatch, "v1");
      stored = winner;
      version = "v2";
      const conflict = new Error("A different request committed first");
      conflict.name = "BlobPreconditionFailedError";
      throw conflict;
    }) as typeof put,
    wait: async () => undefined,
  };
  const result = await mutateBlobJsonDocument({ pathname: "game.json", empty: () => base, parse: raw => JSON.parse(raw) as CatalogGame }, current => {
    const plan = planDirectPrice(current, submission, "local");
    return { next: plan.game, result: plan, changed: !plan.alreadyApplied };
  }, 3, dependencies);
  assert.equal(result.alreadyApplied, true);
  assert.equal(result.game.estimatedPriceComplete, 15);
  assert.equal(result.game.priceConnectorReceipts?.length, 1);
  assert.equal(attemptedWrites, 1);
});

for (const id of ["ps4-let%27s-sing-abba", "ps4-the-binding-of-isaac-afterbirth&#43;"]) {
  test(`recovering a stored encoded-ID receipt does not blend twice: ${id}`, async () => {
    const game = { ...base, id, estimatedPriceComplete: 10 };
    const submission = input({ catalogId: id });
    const first = planDirectPrice(game, submission, "first");
    const raw = JSON.stringify(first.game);
    const pathname = `region-atlas/catalog/overlay/games/${id}.json`;
    const metadata = { url: "https://example.private.blob.vercel-storage.com/game.json", downloadUrl: "https://example.private.blob.vercel-storage.com/game.json", pathname, size: Buffer.byteLength(raw), uploadedAt: new Date(0), contentType: "application/json", contentDisposition: "", cacheControl: "private", etag: "v1" };
    const dependencies = {
      get: (async requested => {
        const deliveredKey = decodeURIComponent(new URL(`https://example.private.blob.vercel-storage.com/${requested}`).pathname.slice(1));
        if (deliveredKey !== pathname) return null;
        return { statusCode: 200, stream: new Response(raw).body!, headers: new Headers(), blob: metadata };
      }) as typeof get,
      head: (async requested => { assert.equal(requested, pathname); return metadata; }) as typeof head,
      put: (async () => { assert.fail("A stored receipt must prevent another write/blend"); }) as typeof put,
      wait: async () => undefined,
    };
    const result = await mutateBlobJsonDocument({ pathname, empty: () => game, parse: text => JSON.parse(text) as CatalogGame }, current => {
      const plan = planDirectPrice(current, submission, "retry");
      return { next: plan.game, result: plan, changed: !plan.alreadyApplied };
    }, 1, dependencies);
    assert.equal(result.alreadyApplied, true);
    assert.equal(result.game.estimatedPriceComplete, 15);
    assert.deepEqual(result.receipt, first.receipt);
    assert.equal(result.game.priceConnectorReceipts?.length, 1);
  });
}
