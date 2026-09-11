import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { catalog, getCatalogGame, listedCatalog, resolveCatalogIdParam } from "./catalog";
import { canonicalCatalogLink } from "./catalog-id-aliases";
import { catalogGamePath } from "./catalog-path";
import { getCatalogRouteRedirect } from "./catalog-route-redirects";
import { mergeCatalogGameWithOverlay, mergeCatalogPlatformGames } from "./catalog-overlay-merge";
import { withOwnedScanDetails } from "./catalog-owned-scans";
import { reconcileCollectionWishlist } from "./wishlist-model";
import { catalogGameToCollectionItem, readUserCollection, saveUserCollectionItems } from "./collection-store";
import type { GameDetails } from "./types";
import type { CollectionWishlistState } from "./wishlist-model";

const oldId = "ps4-deadpool-masacre", canonicalId = "ps4-deadpool";

test("Deadpool has one Spanish edition, retaining the owned ID, prices and both URLs", () => {
  const game = getCatalogGame(canonicalId)!;
  assert.deepEqual(listedCatalog.filter(g => [oldId, canonicalId].includes(g.id)).map(g => g.id), [canonicalId]);
  assert.equal(game.title, "Masacre (Deadpool)");
  assert.equal(game.estimatedPriceComplete, 206.67);
  assert.equal(catalogGamePath(game), "/catalogo/deadpool-ps4-pal-es");
  assert.equal(getCatalogGame(oldId), game);
  assert.equal(resolveCatalogIdParam(oldId), canonicalId);
  assert.equal(getCatalogRouteRedirect("deadpool-masacre-ps4-pal-es")?.targetCatalogId, canonicalId);
  assert.equal(getCatalogGame("ps4-usa-deadpool")?.region, "USA");
  const old = catalog.find(g => g.id === oldId)!;
  const staleOverlay = { ...old, listingStatus: "listed" as const };
  assert.equal(mergeCatalogGameWithOverlay(game, staleOverlay), game);
  assert.equal(mergeCatalogGameWithOverlay(game, { ...game, estimatedPriceComplete: null, recommendedPrice: null, updatedAt: null }).estimatedPriceComplete, 206.67);
  assert.equal(mergeCatalogGameWithOverlay(game, { ...game, estimatedPriceComplete: 199, updatedAt: "2026-09-12T12:00:00Z" }).estimatedPriceComplete, 199);
  assert.deepEqual(mergeCatalogPlatformGames("ps4", [game], [staleOverlay]).map(g => g.id), [canonicalId]);
  assert.equal(withOwnedScanDetails(game, { reference: "BLES-01789" } as GameDetails)?.reference, null);
});

test("the duplicate alias preserves individual collection copies, purchase data and photos", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ra-dedup-"));
  const keys = ["APP_DATA_DIR", "VERCEL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.APP_DATA_DIR = directory;
  for (const key of keys.slice(1)) delete process.env[key];
  try {
    const base = catalogGameToCollectionItem(getCatalogGame(canonicalId)!, []);
    const items = [canonicalId, oldId].map((catalogId, index) => ({
      ...base, id: `individual-copy-${index}`, catalogId,
      addedAt: "2025-01-01T12:00:00Z", buyPrice: 50 + index, notes: `Copy ${index}`,
      photos: [{ slot: "cover-front" as const, url: `/private-copy-${index}.jpg`, width: 800, height: 1000, bytes: 12345, uploadedAt: "2025-01-01T12:00:00Z" }],
    }));
    const saved = await saveUserCollectionItems("dedup-test", items, { source: "test.json" });
    assert.ok(!("error" in saved));
    const repaired = await readUserCollection("dedup-test");
    assert.equal(repaired.items.length, 2);
    for (const item of repaired.items) {
      const original = items.find(before => before.id === item.id)!;
      assert.ok(original);
      assert.equal(item.catalogId, canonicalId);
      for (const field of ["id", "addedAt", "buyPrice", "notes", "photos"] as const) assert.deepEqual(item[field], original[field]);
    }
  } finally {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    await rm(directory, { recursive: true, force: true });
  }
});

test("wishlist merging retains the earliest date and all seen notices; listings keep their identity", () => {
  const state: CollectionWishlistState & { items: [] } = { items: [], wishlist: [
    { catalogId: canonicalId, addedAt: "2026-09-01", seenListingKeys: ["listing-a:date"] },
    { catalogId: oldId, addedAt: "2026-08-01", seenListingKeys: ["listing-b:date"] },
  ] };
  assert.equal(reconcileCollectionWishlist(state), true);
  assert.deepEqual(state.wishlist, [{ catalogId: canonicalId, addedAt: "2026-08-01", seenListingKeys: ["listing-a:date", "listing-b:date"] }]);
  assert.equal(reconcileCollectionWishlist(state), false);
  const listing = { id: "listing-a", catalogId: oldId, price: 99, photos: ["original-photo"], sellerId: "seller" };
  assert.deepEqual(canonicalCatalogLink(listing), { ...listing, catalogId: canonicalId });
  assert.equal(listing.catalogId, oldId);
});
