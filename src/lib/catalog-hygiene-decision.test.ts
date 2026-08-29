import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogHygieneDecision,
  summarizeCatalogHygiene,
} from "./catalog-hygiene-decision";

test("keeps identifiers stable and decodes only presentation text", () => {
  assert.equal(catalogHygieneDecision({ field: "id" }), "preserve_identifier");
  assert.equal(
    catalogHygieneDecision({ field: "evidence.matchAlternatives[0].catalogId" }),
    "preserve_identifier",
  );
  assert.equal(catalogHygieneDecision({ field: "title" }), "runtime_decode");
  assert.equal(catalogHygieneDecision({ field: "pcPath" }), "preserve_source_path");
});

test("blocks a proposed identifier collision", () => {
  assert.equal(
    catalogHygieneDecision({
      field: "id",
      value: "ps4-old%27id",
      suggestedId: "ps4-old-id",
      suggestedIdExists: true,
    }),
    "manual_collision",
  );
});

test("summarizes unique records instead of inflating field findings", () => {
  const summary = summarizeCatalogHygiene([
    { source: "catalog", recordId: "game-1", field: "id" },
    { source: "catalog", recordId: "game-1", field: "slug" },
    { source: "catalog", recordId: "game-1", field: "title" },
    { source: "game-details", recordId: "game-1", field: "$key" },
    { source: "catalog", recordId: "game-2", field: "pcPath" },
  ]);

  assert.equal(summary.catalogRecords, 2);
  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.preservedIdentifierRecords, 1);
  assert.equal(summary.runtimeProtectedRecords, 1);
  assert.equal(summary.preservedSourcePathRecords, 1);
});
