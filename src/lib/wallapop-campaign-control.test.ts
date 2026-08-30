import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWallapopCampaignControlRequest,
  isWallapopCampaignAction,
  normalizeWallapopCampaignStatus,
  WALLAPOP_CAMPAIGN_CONTROL_MODE,
  WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE,
  WALLAPOP_CAMPAIGN_PLATFORMS,
} from "./wallapop-campaign-control";

test("builds a fixed bounded Wallapop control request", () => {
  const request = buildWallapopCampaignControlRequest("enable", {
    now: new Date("2026-08-30T12:00:00.000Z"),
    suffix: "test",
  });
  assert.equal(request.mode, WALLAPOP_CAMPAIGN_CONTROL_MODE);
  assert.equal(request.requestId, "wallapop-control-1788091200000-test");
  assert.equal(request.batchSize, WALLAPOP_CAMPAIGN_MAX_BATCH_SIZE);
  assert.equal(request.pauseMinutes, 10);
  assert.deepEqual(request.platforms, [...WALLAPOP_CAMPAIGN_PLATFORMS]);
});

test("accepts only the three campaign controls", () => {
  assert.equal(isWallapopCampaignAction("enable"), true);
  assert.equal(isWallapopCampaignAction("disable"), true);
  assert.equal(isWallapopCampaignAction("restart"), true);
  assert.equal(isWallapopCampaignAction("run-command"), false);
});

test("normalizes telemetry and never exposes an oversized batch", () => {
  const campaign = normalizeWallapopCampaignStatus({
    enabled: true,
    status: "batch_running",
    campaignId: "campaign-1",
    settings: {
      platforms: ["ps4", "ps5", "attacker"],
      targetRegion: "PAL España",
      batchSize: 200,
      maxBatchSize: 200,
      pauseMinutes: 2,
      jitterMinutes: 3,
      secret: "hidden",
    },
    progress: {
      processedGames: 20,
      totalGames: 8843,
      completedPlatforms: 0,
      totalPlatforms: 5,
      byPlatform: { ps4: { processed: 20, total: 3042 } },
    },
    activeBatch: {
      jobId: "wallapop-job-1",
      platformSlug: "ps4",
      catalogIds: Array.from({ length: 40 }, (_, index) => `ps4-${index}`),
      titles: ["Assassin&amp;#39;s Creed", ...Array.from({ length: 39 }, (_, index) => `Game ${index}`)],
    },
    lastBatch: {
      jobId: "wallapop-job-0",
      platformSlug: "ps4",
      catalogIds: ["ps4-assassins-creed"],
      titles: ["Assassin&#39;s Creed"],
      collectorStats: {
        games_requested: 20,
        games_with_listings: 4,
        listings: 18,
        listings_verified: 12,
        games_no_results: 10,
      },
      searchDiagnostics: [{
        catalogId: "ps4-assassins-creed",
        title: "Assassin&#39;s Creed",
        outcome: "mostly_discarded",
        candidateCount: 30,
        acceptedListings: 2,
        verifiedListings: 1,
        discardRatePct: 93,
        priceDecision: "awaiting_more_verified_listings",
        attempts: Array.from({ length: 12 }, (_, index) => ({
          query: `Assassin&#39;s Creed query ${index}`,
          results: index,
        })),
      }],
    },
    priceResults: {
      changedGames: 6,
      changedCatalogIds: ["ps4-one", "ps4-two"],
      batchesWithChanges: 5,
    },
  });

  assert.equal(campaign.available, true);
  assert.equal(campaign.settings.batchSize, 20);
  assert.equal(campaign.settings.maxBatchSize, 20);
  assert.equal(campaign.settings.pauseMinutes, 10);
  assert.deepEqual(campaign.settings.platforms, ["ps4", "ps5"]);
  assert.equal(campaign.settings.autoPublish, false);
  assert.equal(campaign.activeBatch?.catalogIds.length, 20);
  assert.equal(campaign.activeBatch?.titles[0], "Assassin's Creed");
  assert.equal(campaign.lastBatch?.collectorStats.gamesWithListings, 4);
  assert.equal(campaign.lastBatch?.searchDiagnostics[0]?.attempts.length, 8);
  assert.equal(campaign.lastBatch?.searchDiagnostics[0]?.attempts[0]?.query, "Assassin's Creed query 0");
  assert.equal(campaign.lastBatch?.searchDiagnostics[0]?.priceDecision, "awaiting_more_verified_listings");
  assert.equal(campaign.priceResults.changedGames, 6);
  assert.equal(campaign.progress.byPlatform.ps4.processed, 20);
  assert.equal("secret" in campaign.settings, false);
});
