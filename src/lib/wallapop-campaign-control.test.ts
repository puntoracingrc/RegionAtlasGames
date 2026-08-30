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
      titles: Array.from({ length: 40 }, (_, index) => `Game ${index}`),
    },
  });

  assert.equal(campaign.available, true);
  assert.equal(campaign.settings.batchSize, 20);
  assert.equal(campaign.settings.maxBatchSize, 20);
  assert.equal(campaign.settings.pauseMinutes, 10);
  assert.deepEqual(campaign.settings.platforms, ["ps4", "ps5"]);
  assert.equal(campaign.settings.autoPublish, false);
  assert.equal(campaign.activeBatch?.catalogIds.length, 20);
  assert.equal(campaign.progress.byPlatform.ps4.processed, 20);
  assert.equal("secret" in campaign.settings, false);
});
