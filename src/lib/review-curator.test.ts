import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyResolutionToQueueDocument, assertFreshReviewInput, mapWorkerObservation, physicalEvidenceBundleFromReviewItem,
  priceObservationFromResolution, resolveReviewBundle, researchTasksFromBundle,
} from "./review-curator";

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "review-1", status: "pending", source: "ebay-es", platformSlug: "ps4", targetRegion: "PAL España",
    detectedRegion: "PAL España", catalogId: "ps4-game", candidateCatalogId: "ps4-game", listingTitle: "Game PS4",
    priceEur: 25, condition: "loose", reason: "missing_region", updatedAt: "2026-01-01T00:00:00Z",
    evidence: { aiConfidence: 0.95, externalId: "123", url: "https://example.test/123", regionEvidence: ["distributor_regional"], coverVision: { isTargetGame: true }, visualObservations: [
      { imageIndex: 1, component: "game", role: "disc", textSnippets: ["PS4"], productCodes: ["CUSA-12345"], barcodes: [], languages: [], ratingSystems: ["PEGI"], distributors: ["Distribuido en España"], editionMarkers: [] },
    ] }, ...overrides,
  };
}

test("ambiguous worker box maps fail-closed to UNKNOWN_COMPONENT", () => {
  assert.equal(mapWorkerObservation({ imageIndex: 1, component: "box", role: "back" }).component, "UNKNOWN_COMPONENT");
});

test("media, manual and vouchers retain safe component binding", () => {
  assert.equal(mapWorkerObservation({ component: "game", role: "cartridge" }).component, "CARTRIDGE_FRONT");
  assert.equal(mapWorkerObservation({ component: "manual", role: "manual" }).productNodeType, "DOCUMENT");
  assert.equal(mapWorkerObservation({ component: "supplement", textSnippets: ["Download required"] }).component, "DOWNLOAD_CARD");
});

test("bundle serialization preserves observations, identifiers and hashes", () => {
  const bundle = physicalEvidenceBundleFromReviewItem(item(), "queue-v1");
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.observations[0].component, "DISC");
  assert.equal(bundle.identifiers[0].value, "CUSA-12345");
  assert.equal(bundle.regional.marketBinding, "MARKET_BOUND");
  assert.match(bundle.evidenceHash, /^[a-f0-9]{64}$/);
});

test("Python and TypeScript share the contract hash fixture", () => {
  const fixture = JSON.parse(readFileSync("scripts/fixtures/review-curator-contract-item.json", "utf8"));
  const bundle = physicalEvidenceBundleFromReviewItem(fixture, "contract-v1");
  assert.equal(bundle.inputHash, "6a07b31cab1db0dc8136d8f017894aaacdf8c023610f516b38ae78f8523e952b");
  assert.equal(bundle.evidenceHash, "0a6c2bbc19e52d802e63cc10d4b3c76865645a2144520df84c9244975ce4f599");
});

test("common contract becomes gap-scoped Research Engine tasks", () => {
  const bundle = physicalEvidenceBundleFromReviewItem(item({ detectedRegion: null, evidence: { regionEvidence: ["back_cover_language"], visualObservations: [] } }), "v1");
  const tasks = researchTasksFromBundle(bundle);
  assert.ok(tasks.some((gap) => gap.field === "MARKET_REGION"));
});

test("accept existing requires market-bound identity and safe condition", () => {
  const bundle = physicalEvidenceBundleFromReviewItem(item(), "v1");
  const resolution = resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]), now: "2026-01-01T00:00:00Z" });
  assert.equal(resolution.decision, "ACCEPT_EXISTING");
  assert.equal(priceObservationFromResolution(bundle, resolution).catalogId, "ps4-game");
});

test("language-only evidence defers and seller country never binds market", () => {
  const candidate = item({ evidence: { aiConfidence: 0.99, originCountry: "ES", regionEvidence: ["back_cover_language"], visualObservations: [{ imageIndex: 1, component: "game", role: "disc", languages: ["es"] }] } });
  const bundle = physicalEvidenceBundleFromReviewItem(candidate, "v1");
  assert.equal(bundle.regional.marketBinding, "LANGUAGE_ONLY");
  assert.equal(resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]) }).decision, "DEFER");
});

test("a generic distributor name does not bind a market", () => {
  const candidate = item({ evidence: { aiConfidence: 0.99, regionEvidence: [], coverVision: { isTargetGame: true }, visualObservations: [{ imageIndex: 1, component: "game", role: "disc", distributors: ["Ubisoft"] }] } });
  const bundle = physicalEvidenceBundleFromReviewItem(candidate, "v1");
  assert.equal(bundle.regional.marketBinding, "UNBOUND");
  assert.equal(resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]) }).decision, "DEFER");
});

test("wrong product, platform and manual-only listings reject", () => {
  for (const listingTitle of ["GAME FRIDGE MAGNET IMAN NEVERA", "PC Windows Game", "FIFA 10 PS3", "FIFA 11 PS2", "Super Nintendo SNES Game", "Manual only Game PS4"]) {
    const bundle = physicalEvidenceBundleFromReviewItem(item({ listingTitle }), "v1");
    assert.equal(resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]) }).decision, "REJECT");
  }
});

test("a game bundle mentioning an included figure is not rejected from title alone", () => {
  const bundle = physicalEvidenceBundleFromReviewItem(item({ listingTitle: "Game PS4 + figura coleccionista", evidence: { regionEvidence: [] } }), "v1");
  assert.equal(resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]) }).decision, "DEFER");
});

test("negative vision identity rejects before regional or price routing", () => {
  const candidate = item({ evidence: { aiConfidence: 0.99, regionEvidence: ["distributor_regional"], coverVision: { isTargetGame: false, identity: { editionMatches: false } }, visualObservations: [] } });
  const bundle = physicalEvidenceBundleFromReviewItem(candidate, "v1");
  assert.equal(resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]) }).decision, "REJECT");
});

test("reroute requires a market-bound existing alternative", () => {
  const candidate = item({ detectedRegion: "PAL Europa", evidence: { aiConfidence: 0.97, regionEvidence: ["sku_regional"], coverVision: { isTargetGame: true }, matchAlternatives: [{ catalogId: "ps4-eu", region: "PAL Europa" }], visualObservations: [{ imageIndex: 1, component: "game", role: "disc" }] } });
  const bundle = physicalEvidenceBundleFromReviewItem(candidate, "v1");
  const resolution = resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game", "ps4-eu"]) });
  assert.equal(resolution.decision, "REROUTE_EXISTING");
  assert.equal(resolution.resolvedCatalogId, "ps4-eu");
});

test("new variants remain proposals and never price observations", () => {
  const bundle = physicalEvidenceBundleFromReviewItem(item({ catalogId: null, candidateCatalogId: "missing-id" }), "v1");
  const resolution = resolveReviewBundle(bundle, { catalogIds: new Set() });
  assert.equal(resolution.decision, "PROPOSE_NEW_VARIANT");
  assert.throws(() => priceObservationFromResolution(bundle, resolution));
});

test("complete requires visible media and package", () => {
  const bundle = physicalEvidenceBundleFromReviewItem(item({ condition: "complete" }), "v1");
  assert.equal(resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]) }).decision, "DEFER");
});

test("sealed requires an observed physical seal", () => {
  const unsupported = physicalEvidenceBundleFromReviewItem(item({ condition: "sealed" }), "v1");
  assert.equal(resolveReviewBundle(unsupported, { catalogIds: new Set(["ps4-game"]) }).decision, "DEFER");
  const supported = physicalEvidenceBundleFromReviewItem(item({ condition: "sealed", evidence: {
    aiConfidence: 0.95,
    regionEvidence: ["distributor_regional"],
    coverVision: { isTargetGame: true },
    visualObservations: [{ imageIndex: 1, component: "seal", role: "seal" }],
  } }), "v1");
  assert.equal(resolveReviewBundle(supported, { catalogIds: new Set(["ps4-game"]) }).decision, "ACCEPT_EXISTING");
});

test("stale hashes and status fail closed", () => {
  const original = item();
  const bundle = physicalEvidenceBundleFromReviewItem(original, "v1");
  assert.doesNotThrow(() => assertFreshReviewInput(original, bundle));
  assert.throws(() => assertFreshReviewInput({ ...original, priceEur: 30 }, bundle), /STALE_REVIEW_INPUT/);
  assert.throws(() => assertFreshReviewInput({ ...original, status: "accepted" }, bundle), /STALE_REVIEW_INPUT/);
});

test("queue application is idempotent, keeps history and emits normal price input", () => {
  const original = item();
  const bundle = physicalEvidenceBundleFromReviewItem(original, "v1");
  const resolution = resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]), runId: "run-1", now: "2026-01-01T00:00:00Z" });
  const queue = { schemaVersion: 1, updatedAt: "v1", items: [original], decisions: [] as Array<Record<string, unknown>> };
  const first = applyResolutionToQueueDocument(queue, bundle, resolution, "2026-01-01T00:00:01Z");
  assert.equal(first.applied, true);
  assert.equal(first.priceObservation?.catalogId, "ps4-game");
  assert.equal(queue.decisions.length, 1);
  const second = applyResolutionToQueueDocument(queue, bundle, resolution, "2026-01-01T00:00:02Z");
  assert.equal(second.applied, false);
  assert.equal(queue.decisions.length, 1);
});

test("defer persists exponential eligibility metadata and can be retried when eligible", () => {
  const original = item({ evidence: { regionEvidence: ["back_cover_language"], coverVision: { isTargetGame: true }, visualObservations: [] } });
  const bundle = physicalEvidenceBundleFromReviewItem(original, "v1");
  const resolution = resolveReviewBundle(bundle, { catalogIds: new Set(["ps4-game"]), runId: "run-defer", now: "2026-01-01T00:00:00Z" });
  const queue = { schemaVersion: 1, updatedAt: "v1", items: [original], decisions: [] as Array<Record<string, unknown>> };
  const result = applyResolutionToQueueDocument(queue, bundle, resolution, "2026-01-01T00:00:00Z");
  assert.equal(result.applied, true);
  assert.equal(queue.items[0].status, "deferred");
  assert.equal(queue.items[0].attemptCount, 1);
  assert.equal(queue.items[0].nextEligibleAt, "2026-01-02T00:00:00.000Z");
  const retryBundle = physicalEvidenceBundleFromReviewItem(queue.items[0], "v1");
  assert.doesNotThrow(() => assertFreshReviewInput(queue.items[0], retryBundle));
});
