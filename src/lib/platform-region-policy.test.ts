import assert from "node:assert/strict";
import test from "node:test";
import {
  publicRegionLabelForPlatform,
  publicRegionLabelsForPlatform,
} from "@/lib/platform-region-policy";
import { getRegionDisplay } from "@/lib/region-display";
import { buildPlatformCatalogInsights } from "@/lib/platform-catalog-insights";

test("Neo Geo AES exposes only Western and Japanese region families", () => {
  assert.deepEqual(publicRegionLabelsForPlatform("neogeo"), ["Occidental", "Japonesa"]);
  assert.equal(getRegionDisplay("Occidental").shortLabel, "OCC");
  assert.equal(getRegionDisplay("Japonesa").flagCode, "JP");
});

test("Neo Geo CD exposes only Western and Japanese region families", () => {
  assert.deepEqual(publicRegionLabelsForPlatform("neogeocd"), ["Occidental", "Japonesa"]);
});

test("NEOGEO AES+ keeps its international and Japanese reissues separate", () => {
  assert.deepEqual(publicRegionLabelsForPlatform("neogeo-aes-plus"), [
    "Internacional",
    "Japonesa",
  ]);
  assert.equal(getRegionDisplay("Internacional").shortLabel, "INT");
  assert.equal(getRegionDisplay("Japonesa").flagCode, "JP");
});

test("Neo Geo Pocket exposes its three commercial regions with concise labels", () => {
  assert.deepEqual(publicRegionLabelsForPlatform("neogeopocket"), [
    "USA",
    "Europea",
    "Japonesa",
  ]);
  assert.equal(publicRegionLabelForPlatform("neogeopocket", "USA"), "USA");
  assert.equal(publicRegionLabelForPlatform("neogeopocket", "PAL Europa"), "Europea");
  assert.equal(publicRegionLabelForPlatform("neogeopocket", "Japón"), "Japonesa");

  const insights = buildPlatformCatalogInsights([
    { region: "USA" },
    { region: "PAL Europa" },
    { region: "Japón" },
  ], "neogeopocket");
  assert.deepEqual(insights.topRegions.map(({ label, flagRegion }) => ({ label, flagRegion })), [
    { label: "Europea", flagRegion: "PAL Europa" },
    { label: "USA", flagRegion: "NTSC USA" },
    { label: "Japonesa", flagRegion: "NTSC-J Japón" },
  ]);
});

test("other platforms keep their catalog-derived region policy", () => {
  assert.equal(publicRegionLabelsForPlatform("ps2"), null);
});
