import assert from "node:assert/strict";
import test from "node:test";
import { scanResearchCatalog } from "./catalog-scanner";

test("catalog scanner produces a prioritized research-only queue", () => {
  const result = scanResearchCatalog({
    query: "Assassin's Creed",
    limit: 50,
    now: new Date("2026-09-15T20:00:00Z"),
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.mode, "research-only");
  assert.ok(result.summary.scanned > 0);
  assert.ok(result.items.length <= 50);
  assert.ok(result.items.every((item) => item.subject.title.toLowerCase().includes("assassin")));

  for (let index = 1; index < result.items.length; index += 1) {
    assert.ok(result.items[index - 1].debtScore >= result.items[index].debtScore);
  }
});

test("platform-filtered scan stays within the requested platform", () => {
  const result = scanResearchCatalog({
    platformSlug: "ps5",
    query: "Assassin's Creed",
    limit: 100,
    now: new Date("2026-09-15T20:00:00Z"),
  });
  assert.ok(result.summary.scanned > 0);
  assert.ok(result.items.every((item) => item.subject.platformSlug === "ps5"));
});
