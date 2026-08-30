import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePriceReviewTriageFilter,
  normalizeTodoConsolasReviewItem,
  priceReviewCatalogPreview,
  priceReviewMatchesTriageFilter,
  priceReviewTextSignals,
  priceReviewTriageBucket,
  type PriceReviewItem,
} from "./admin-price-review";
import { todoConsolasListingMetadata } from "./todoconsolas-listing";

function review(overrides: Partial<PriceReviewItem> = {}): PriceReviewItem {
  return {
    id: "review-1",
    status: "pending",
    source: "todoconsolas",
    platformSlug: "ps5",
    listingTitle: "Juego PS5 (SP)",
    priceEur: 24.95,
    reason: "catalog_match_not_unique",
    ...overrides,
  };
}

test("uses persisted TodoConsolas triage buckets", () => {
  assert.equal(priceReviewTriageBucket(review({ triageBucket: "regional_variant" })), "regional_variant");
});

test("derives useful fallback buckets for old queue items", () => {
  assert.equal(priceReviewTriageBucket(review({ reason: "price_out_of_range" })), "price_anomaly");
  assert.equal(priceReviewTriageBucket(review({ reason: "catalog_region_not_exact" })), "regional_variant");
  assert.equal(priceReviewTriageBucket(review({ reason: "listing_region_missing" })), "missing_region");
  assert.equal(priceReviewTriageBucket(review()), "catalog_gap");
  assert.equal(
    priceReviewTriageBucket(review({ candidateCatalogId: "ps5-game" })),
    "manual_match",
  );
});

test("keeps non-TodoConsolas reviews in the actionable inbox", () => {
  const item = review({ source: "game-es-preowned" });
  assert.equal(priceReviewTriageBucket(item), "manual_match");
  assert.equal(priceReviewMatchesTriageFilter(item, "actionable"), true);
});

test("uses Wallapop description without confusing playable language with physical region", () => {
  assert.deepEqual(priceReviewTextSignals(review({
    source: "wallapop",
    listingTitle: "13 Sentinels Aegis Rim PS4",
    evidence: { description: "Edición física. PEGI 12. Juego en español." },
  })), {
    region: "PAL Europa",
    condition: null,
    unmatchedExtras: false,
  });
  assert.deepEqual(priceReviewTextSignals(review({
    source: "wallapop",
    listingTitle: "13 Sentinels Aegis Rim PS4",
    evidence: { description: "Caja y juego en español. Solo desprecintado." },
  })), {
    region: "PAL España",
    condition: "complete",
    unmatchedExtras: false,
  });
});

test("flags unmatched extras but keeps distinct normal listings independent", () => {
  assert.equal(priceReviewTextSignals(review({
    source: "wallapop",
    candidateCatalogId: "ps4-daymare-1994-sandcastle",
    listingTitle: "Daymare 1994 PS4 con libro de arte",
  })).unmatchedExtras, true);
  assert.equal(priceReviewTextSignals(review({
    source: "wallapop",
    candidateCatalogId: "ps4-daymare-1994-sandcastle",
    listingTitle: "Daymare 1994 PS4 precintado",
  })).unmatchedExtras, false);
});

test("actionable combines manual matches and missing regions only", () => {
  assert.equal(priceReviewMatchesTriageFilter(review({ triageBucket: "manual_match" }), "actionable"), true);
  assert.equal(priceReviewMatchesTriageFilter(review({ triageBucket: "missing_region" }), "actionable"), true);
  assert.equal(priceReviewMatchesTriageFilter(review({ triageBucket: "catalog_gap" }), "actionable"), false);
});

test("normalizes unknown API filters to the actionable inbox", () => {
  assert.equal(normalizePriceReviewTriageFilter("catalog_gap"), "catalog_gap");
  assert.equal(normalizePriceReviewTriageFilter("unexpected"), "actionable");
  assert.equal(normalizePriceReviewTriageFilter(null), "actionable");
});

test("adds the catalog cover and main metadata to a review candidate", () => {
  const preview = priceReviewCatalogPreview(review({
    platformSlug: "ps4",
    candidateCatalogId: "ps4-daymare-1994-sandcastle",
  }));
  assert.equal(preview?.title, "Daymare 1994 Sandcastle");
  assert.equal(preview?.region, "PAL España");
  assert.equal(preview?.coverUrl?.endsWith("/covers/ps4/daymare-1994-sandcastle.jpg"), true);
});

test("falls back to a catalog match alternative for the visual preview", () => {
  const preview = priceReviewCatalogPreview(review({
    evidence: {
      matchAlternatives: [{ catalogId: "ps4-daymare-1994-sandcastle", score: 0.91 }],
    },
  }));
  assert.equal(preview?.id, "ps4-daymare-1994-sandcastle");
});

test("interprets TodoConsolas KC and SP without changing the original title", () => {
  const listingTitle = "Final Fantasy VII Remake Intergrade KC Switch 2 (SP)";
  assert.deepEqual(todoConsolasListingMetadata(listingTitle, "switch2"), {
    displayTitle: "Final Fantasy VII Remake Intergrade",
    sourceRegionCode: "SP",
    sourceRegionLabel: "PAL España",
    detectedRegion: "PAL España",
    gameKeyCard: true,
    fullySpanishVersion: true,
  });

  const normalized = normalizeTodoConsolasReviewItem(review({
    platformSlug: "switch2",
    listingTitle,
    detectedRegion: null,
    evidence: { regionEvidence: ["listing_title_region"] },
  }));
  assert.equal(normalized.listingTitle, listingTitle);
  assert.equal(normalized.detectedRegion, "PAL España");
  assert.equal(normalized.evidence?.displayTitle, "Final Fantasy VII Remake Intergrade");
  assert.equal(normalized.evidence?.gameKeyCard, true);
  assert.equal(normalized.evidence?.sourceRegionCode, "SP");
  assert.equal(normalized.evidence?.sourceRegionLabel, "PAL España");
  assert.equal(normalized.evidence?.fullySpanishVersion, true);
  assert.deepEqual(normalized.evidence?.regionEvidence, ["tcns_suffix_sp", "listing_title_region"]);
});

test("does not treat literal KC in another platform title as a Game-Key Card", () => {
  assert.deepEqual(todoConsolasListingMetadata("KC Returns PS5 (SP)", "ps5"), {
    displayTitle: "KC Returns",
    sourceRegionCode: "SP",
    sourceRegionLabel: "PAL España",
    detectedRegion: "PAL España",
    gameKeyCard: false,
    fullySpanishVersion: true,
  });
});

test("accepts PS as a defensive TodoConsolas alias for PAL España on PlayStation", () => {
  assert.deepEqual(todoConsolasListingMetadata("Astro Bot PS5 (PS)", "ps5"), {
    displayTitle: "Astro Bot",
    sourceRegionCode: "PS",
    sourceRegionLabel: "PAL España",
    detectedRegion: "PAL España",
    gameKeyCard: false,
    fullySpanishVersion: true,
  });
});

test("accepts ESP as an explicit TodoConsolas code for PAL España", () => {
  const metadata = todoConsolasListingMetadata("Astro Bot PS5 (ESP)", "ps5");
  assert.equal(metadata.displayTitle, "Astro Bot");
  assert.equal(metadata.detectedRegion, "PAL España");
  assert.equal(metadata.fullySpanishVersion, true);
});

test("keeps EU, IT and PL as distinct TodoConsolas regional signals", () => {
  assert.equal(todoConsolasListingMetadata("Juego PS5 (EU)", "ps5").detectedRegion, "PAL Europa");
  assert.equal(todoConsolasListingMetadata("Juego PS5 (FR)", "ps5").detectedRegion, "PAL Francia");
  assert.equal(todoConsolasListingMetadata("Juego PS5 (IT)", "ps5").detectedRegion, "PAL Italia");
  assert.deepEqual(todoConsolasListingMetadata("Juego PS5 (PL)", "ps5"), {
    displayTitle: "Juego",
    sourceRegionCode: "PL",
    sourceRegionLabel: "PAL Portugal",
    detectedRegion: "PAL Portugal",
    gameKeyCard: false,
    fullySpanishVersion: false,
  });
  assert.equal(todoConsolasListingMetadata("Juego PS5 (AS)", "ps5").detectedRegion, "Asia");
});
