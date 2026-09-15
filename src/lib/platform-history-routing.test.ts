import assert from "node:assert/strict";
import test from "node:test";
import buildSitemap from "../app/sitemap";
import { hasPublicCatalogGames } from "./catalog";
import {
  getPlatformHistoryData,
  platformHistoryPath,
} from "./platform-history";

test("builds stable editorial paths for platform histories and hardware", () => {
  assert.equal(platformHistoryPath("ps3"), "/historia-plataformas/ps3");
  assert.equal(
    platformHistoryPath("xboxseries", {
      hardware: "peripherals",
      section: "rog-xbox-ally",
    }),
    "/historia-plataformas/xboxseries?hardware=peripherals#rog-xbox-ally",
  );
});

test("publishes history routes separately from catalog-only platform routes", async () => {
  const paths = new Set((await buildSitemap()).map((entry) => new URL(entry.url).pathname));
  assert.ok(paths.has("/historia-plataformas"));

  for (const history of getPlatformHistoryData().platforms) {
    assert.ok(paths.has(platformHistoryPath(history.platformSlug)), history.platformSlug);
    if (!hasPublicCatalogGames(history.platformSlug)) {
      assert.ok(!paths.has(`/plataforma/${history.platformSlug}`), history.platformSlug);
    }
  }
});
