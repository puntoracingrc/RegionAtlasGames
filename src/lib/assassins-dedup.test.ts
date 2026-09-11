import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import report from "../../data/research/owned-scans/2026-09-12-assassins-dedup.json";
import { catalog, getCatalogGame, listedCatalog, resolveCatalogIdParam } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import { getCatalogRouteRedirect } from "./catalog-route-redirects";
import { mergeCatalogPlatformGames } from "./catalog-overlay-merge";
import { normalizeCatalogGamePresentation } from "./catalog-presentation";
import { canonicalCatalogLink } from "./catalog-id-aliases";
import { catalogGameToCollectionItem, readUserCollection, saveUserCollectionItems } from "./collection-store";
import { reconcileCollectionWishlist } from "./wishlist-model";
import type { CatalogGame } from "./types";

test("nine reviewed duplicates disappear without changing the scanned IDs or either URL", () => {
  assert.equal(report.pairs.length, 9);
  for (const pair of report.pairs) {
    const game = getCatalogGame(pair.canonicalId)!;
    assert.equal(game.coverUrl, pair.preservedCoverUrl);
    assert.equal(catalogGamePath(game), pair.canonicalPath);
    assert.equal(getCatalogGame(pair.retiredId), game);
    assert.equal(resolveCatalogIdParam(decodeURIComponent(pair.retiredId)), game.id);
    assert.equal(getCatalogRouteRedirect(pair.oldPath.slice("/catalogo/".length))?.targetParam, pair.canonicalPath.slice("/catalogo/".length));
    assert.deepEqual(listedCatalog.filter(g => [pair.retiredId, pair.canonicalId].includes(g.id)).map(g => g.id), [game.id]);
    const oldOverlay = { ...pair.beforeRetired, listingStatus: "listed" } as CatalogGame;
    assert.deepEqual(mergeCatalogPlatformGames("ps4", [game], [oldOverlay]).map(g => g.id), [game.id]);
    assert.equal(game.recommendedPrice, pair.beforeCanonical.recommendedPrice);
  }
  for (const game of catalog.filter(game => /assassin.*creed/i.test(game.title))) {
    assert.match(game.title, /Assassin's Creed/);
    assert.doesNotMatch(game.title, /&#39;/);
  }
  const game = getCatalogGame(report.pairs[0].canonicalId)!;
  assert.match(normalizeCatalogGamePresentation({ ...game, title: "Assassins Creed III Remastered" }).title, /^Assassin's Creed/);
  assert.equal(getCatalogGame("ps4-assassin%27s-creed-mirage")!.id, "ps4-assassin%27s-creed-mirage");
});

test("all nine aliases preserve individual collection copies, photos, purchases and wishes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ra-assassins-dedup-"));
  const keys = ["APP_DATA_DIR", "VERCEL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.APP_DATA_DIR = directory;
  for (const key of keys.slice(1)) delete process.env[key];
  try {
    const items = report.pairs.flatMap(pair => {
      const base = catalogGameToCollectionItem(getCatalogGame(pair.canonicalId)!, []);
      return [pair.canonicalId, pair.retiredId].map((catalogId, i) => ({
        ...base, id: `${pair.canonicalId}-copy-${i}`, catalogId, buyPrice: 40 + i,
        notes: `Copy ${i}`, addedAt: "2025-01-02T12:00:00Z",
        photos: [{ slot: "cover-front" as const, url: `/private-${i}.jpg`, width: 800, height: 1000, bytes: 1234, uploadedAt: "2025-01-02T12:00:00Z" }],
      }));
    });
    const saved = await saveUserCollectionItems("assassins-dedup-test", items, { source: "fixture.json" });
    assert.ok(!("error" in saved));
    const after = await readUserCollection("assassins-dedup-test");
    assert.equal(after.items.length, 18);
    for (const item of after.items) {
      const old = items.find(original => original.id === item.id)!;
      assert.ok(old);
      assert.equal(item.catalogId, getCatalogGame(old.catalogId!)!.id);
      for (const key of ["id", "buyPrice", "notes", "addedAt", "photos"] as const) assert.deepEqual(item[key], old[key]);
    }
    for (const pair of report.pairs) {
      const state = { items: [], wishlist: [{ catalogId: pair.retiredId, addedAt: "2026-01-01", seenListingKeys: ["seen-listing"] }] };
      reconcileCollectionWishlist(state);
      assert.deepEqual(state.wishlist[0], { catalogId: pair.canonicalId, addedAt: "2026-01-01", seenListingKeys: ["seen-listing"] });
      const listing = { id: "sale", catalogId: pair.retiredId, price: 50 };
      assert.deepEqual(canonicalCatalogLink(listing), { ...listing, catalogId: pair.canonicalId });
    }
  } finally {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    await rm(directory, { recursive: true, force: true });
  }
});
