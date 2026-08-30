import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateListingVisionEvidence,
  listingAnalysisIsVerified,
} from "./marketplace-verification";

const acceptedEvidence = {
  advertisedGameMatches: true,
  platformMatches: true,
  coverFrontVisible: true,
  coverBackVisible: true,
  sameImageRepeated: false,
  regionMatches: true,
  gameMatchConfidence: 0.94,
  regionMatchConfidence: 0.88,
};

test("verification accepts two distinct matching views with sufficient confidence", () => {
  assert.deepEqual(evaluateListingVisionEvidence(acceptedEvidence), {
    status: "verified",
    reasons: [],
  });
});

test("verification sends duplicates and uncertain regions to manual review", () => {
  const decision = evaluateListingVisionEvidence({
    ...acceptedEvidence,
    sameImageRepeated: true,
    regionMatches: null,
    regionMatchConfidence: 0.4,
  });
  assert.equal(decision.status, "review_required");
  assert.ok(decision.reasons.some((reason) => reason.includes("misma vista")));
  assert.ok(decision.reasons.some((reason) => reason.includes("región")));
});

test("only explicit automatic or manual verification is publishable", () => {
  const base = {
    conditionVerdict: "Buen estado",
    conditionScore: 0.8,
    estimatedPriceEur: 20,
    notes: "",
    analyzedAt: new Date(0).toISOString(),
    model: "test",
  };
  assert.equal(listingAnalysisIsVerified({ ...base, verificationStatus: "verified" }), true);
  assert.equal(listingAnalysisIsVerified({ ...base, verificationStatus: "manual_verified" }), true);
  assert.equal(listingAnalysisIsVerified({ ...base, verificationStatus: "review_required" }), false);
  assert.equal(listingAnalysisIsVerified(base), false);
});
