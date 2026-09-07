import assert from "node:assert/strict";
import test from "node:test";
import { mergeEbayReviewInbox } from "./ebay-review-inbox";
import type { PriceReviewItem, PriceReviewQueue } from "./admin-price-review";

const item = (id: string, status = "pending", source = "ebay-es") =>
  ({ id, status, source, listingTitle: id } as PriceReviewItem);
const queue = (items: PriceReviewItem[]): PriceReviewQueue =>
  ({ schemaVersion: 1, updatedAt: "test", items, decisions: [] });

test("existing reviews and decisions are authoritative; no duplicate or unrelated additions", () => {
  const remote = queue([item("accepted", "accepted"), item("rejected", "rejected"), item("existing", "pending", "wallapop")]);
  remote.decisions = [{ id: "archived", action: "reject" }];
  const inbox = queue([item("accepted"), item("rejected"), item("archived"), item("new"), item("new"), item("other", "pending", "wallapop")]);
  const merged = mergeEbayReviewInbox(remote, inbox);
  assert.deepEqual(merged.items.map((value) => value.id), ["accepted", "rejected", "existing", "new"]);
  assert.deepEqual(merged.items.slice(0, 3), remote.items);
  assert.deepEqual(merged.decisions, remote.decisions);
  assert.deepEqual(mergeEbayReviewInbox(merged, inbox), merged);
  assert.equal(remote.items.length, 3);
});

test("empty inbox preserves existing queue", () => {
  const remote = queue([item("one", "pending", "todoconsolas")]);
  assert.deepEqual(mergeEbayReviewInbox(remote, queue([])), remote);
});
