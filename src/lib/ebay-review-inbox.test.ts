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

const reviewed = (id: string, action: "accept" | "reject") => ({
  ...item(id, action === "accept" ? "accepted" : "rejected"),
  decision: { action, catalogId: "gameboy-target", reviewBatch: "visual-fixture", reviewer: "reviewer" },
});
const reviewedQueue = (items: PriceReviewItem[]) => ({
  ...queue(items), decisions: items.map((value) => ({ id: value.id, ...value.decision })),
});

test("versioned reviewed decisions resolve pending inbox and survive repeated reads", () => {
  const inbox = reviewedQueue([reviewed("old", "accept"), reviewed("new", "reject")]);
  const remote = queue([item("old")]);
  const merged = mergeEbayReviewInbox(remote, inbox);
  assert.deepEqual(merged.items.map((value) => value.status), ["accepted", "rejected"]);
  assert.equal(merged.decisions.length, 2);
  assert.deepEqual(mergeEbayReviewInbox(merged, inbox), merged);
  assert.equal(remote.items[0].status, "pending");
});

test("later live decision is authoritative over versioned visual batch", () => {
  const remote = reviewedQueue([reviewed("one", "reject")]);
  const inbox = reviewedQueue([reviewed("one", "accept")]);
  assert.deepEqual(mergeEbayReviewInbox(remote, inbox), remote);
});

test("unsigned terminal rows and inconsistent decision logs cannot auto-resolve", () => {
  const inbox = queue([reviewed("no-log", "accept"), item("no-reviewer", "accepted"), reviewed("mismatch", "accept")]);
  inbox.decisions = [{ id: "mismatch", action: "reject", reviewBatch: "visual-fixture", catalogId: "gameboy-target" }];
  const remote = queue([item("no-log")]);
  assert.deepEqual(mergeEbayReviewInbox(remote, inbox), remote);
});
