import assert from "node:assert/strict";
import test from "node:test";
import { classifyRetrievalFailure, isInfrastructureRetrievalFailure, isRetryableRetrievalFailure } from "./retrieval-resilience";

test("fault injection classifies source and provider failures without semantic failure", () => {
  const cases = [
    [new DOMException("timed out", "TimeoutError"), "SOURCE_TIMEOUT"],
    [new Error("RESEARCH_PAGE_HTTP_403"), "SOURCE_BLOCKED"],
    [new Error("RESEARCH_PAGE_HTTP_404"), "SOURCE_NOT_FOUND"],
    [new Error("SERPAPI_HTTP_429"), "SOURCE_RATE_LIMITED"],
    [new Error("SERPAPI_AUTH_ERROR"), "PROVIDER_AUTHENTICATION_FAILED"],
    [new Error("GOOGLE_SEARCH_HTTP_503"), "PROVIDER_TEMPORARILY_UNAVAILABLE"],
    [new Error("SERPAPI_QUOTA_EXHAUSTED"), "PROVIDER_QUOTA_EXHAUSTED"],
    [new Error("IMAGE_UNAVAILABLE"), "IMAGE_UNAVAILABLE"],
  ] as const;
  for (const [error, expected] of cases) {
    const code = classifyRetrievalFailure(error);
    assert.equal(code, expected);
    assert.equal(isInfrastructureRetrievalFailure(code), true);
  }
  assert.equal(isRetryableRetrievalFailure("SOURCE_TIMEOUT"), true);
  assert.equal(isRetryableRetrievalFailure("SOURCE_RATE_LIMITED"), true);
  assert.equal(isRetryableRetrievalFailure("PROVIDER_AUTHENTICATION_FAILED"), false);
  assert.equal(isRetryableRetrievalFailure("PROVIDER_QUOTA_EXHAUSTED"), false);
});

test("unclassified local defects remain INTERNAL_ERROR and may fail the worker", () => {
  const code = classifyRetrievalFailure(new Error("STATE_CORRUPTION_INVARIANT"));
  assert.equal(code, "INTERNAL_ERROR");
  assert.equal(isInfrastructureRetrievalFailure(code), false);
});
