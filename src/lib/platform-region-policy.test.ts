import assert from "node:assert/strict";
import test from "node:test";
import { publicRegionLabelsForPlatform } from "@/lib/platform-region-policy";
import { getRegionDisplay } from "@/lib/region-display";

test("Neo Geo AES exposes only Western and Japanese region families", () => {
  assert.deepEqual(publicRegionLabelsForPlatform("neogeo"), ["Occidental", "Japonesa"]);
  assert.equal(getRegionDisplay("Occidental").shortLabel, "OCC");
  assert.equal(getRegionDisplay("Japonesa").flagCode, "JP");
});

test("NEOGEO AES+ keeps its international and Japanese reissues separate", () => {
  assert.deepEqual(publicRegionLabelsForPlatform("neogeo-aes-plus"), [
    "Internacional",
    "Japonesa",
  ]);
  assert.equal(getRegionDisplay("Internacional").shortLabel, "INT");
  assert.equal(getRegionDisplay("Japonesa").flagCode, "JP");
});

test("other platforms keep their catalog-derived region policy", () => {
  assert.equal(publicRegionLabelsForPlatform("ps2"), null);
});
