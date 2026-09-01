import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionPriceDiscrepancies,
  type CollectionPriceEstimateSample,
} from "./admin-collection-price-discrepancies";

function sample(
  userId: string,
  ownerEstimatedPrice: number,
  catalogPrice = 20,
): CollectionPriceEstimateSample {
  return {
    userId,
    catalogId: "ps4-example",
    title: "Example",
    platformSlug: "ps4",
    region: "ES",
    condition: "complete",
    ownerEstimatedPrice,
    catalogPrice,
  };
}

test("requires estimates from at least three distinct users", () => {
  assert.deepEqual(
    buildCollectionPriceDiscrepancies([sample("one", 50), sample("two", 55)]),
    [],
  );
});

test("flags a robust user median far from the catalog price", () => {
  const result = buildCollectionPriceDiscrepancies([
    sample("one", 40),
    sample("two", 42),
    sample("three", 44),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "catalog");
  assert.equal(result[0].userMedian, 42);
  assert.equal(result[0].userCount, 3);
});

test("flags strong disagreement between users without overweighting duplicate copies", () => {
  const result = buildCollectionPriceDiscrepancies([
    sample("one", 10, 30),
    sample("one", 20, 30),
    sample("two", 30, 30),
    sample("three", 60, 30),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "users");
  assert.equal(result[0].userCount, 3);
  assert.equal(result[0].userMin, 15);
  assert.equal(result[0].userMax, 60);
});
