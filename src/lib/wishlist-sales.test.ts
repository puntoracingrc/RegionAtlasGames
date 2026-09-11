import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildWishlistSales, wishlistListingKey } from "./wishlist-sales";
import { setCatalogGameWished } from "./wishlist-store";
import { markWishlistSalesSeen, readWishlistSales } from "./wishlist-sales-store";
import { addCatalogCopy, addCatalogGameToCollection } from "./collection-store";
import { cancelListing, createListingDraft, publishListing, updateListing } from "./listings";
import type { MarketplaceListing } from "./marketplace-types";

const game = "ps2-es-sces-50494";
const before = "2026-09-01T10:00:00Z";
const after = "2026-09-02T10:00:00Z";
const offer = (id: string, patch = {}) => ({ id, catalogId: game, sellerId: "seller", status: "active" as const, publishedAt: after, ...patch });

test("sale notices match the wished edition and exclude drafts, closed offers, older offers and the user's own listings", () => {
  const sales = buildWishlistSales("buyer", [{ catalogId: game, addedAt: before }], [
    offer("new"), offer("another-new"),
    offer("jp", { catalogId: "ps2-japon-final-fantasy-x" }),
    offer("draft", { status: "draft" }), offer("sold", { status: "sold" }), offer("cancelled", { status: "cancelled" }),
    offer("own", { sellerId: "buyer" }), offer("old", { publishedAt: "2026-08-01T10:00:00Z" }),
  ]);
  assert.equal(sales.unreadGameCount, 1);
  assert.equal(sales.games[0].listingCount, 3);
  assert.deepEqual(sales.games[0].unseenListingKeys, [wishlistListingKey(offer("new")), wishlistListingKey(offer("another-new"))]);
});

test("viewing one publication leaves later and other sellers' publications unread", () => {
  const viewed = offer("viewed");
  const wish = { catalogId: game, addedAt: before, seenListingKeys: [wishlistListingKey(viewed)] };
  assert.equal(buildWishlistSales("buyer", [wish], [viewed]).unreadGameCount, 0);
  assert.equal(buildWishlistSales("buyer", [wish], [viewed, offer("new")]).unreadGameCount, 1);
  assert.equal(buildWishlistSales("buyer", [wish], [offer("viewed", { publishedAt: "2026-09-03T10:00:00Z" })]).unreadGameCount, 1);
});

test("publish, read, later publish and cancellation persist through the real marketplace and wishlist stores", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "regionatlas-wishlist-sales-"));
  const keys = ["APP_DATA_DIR", "VERCEL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.APP_DATA_DIR = directory;
  for (const key of keys.slice(1)) delete process.env[key];
  try {
    await setCatalogGameWished("buyer", game, true);
    await setCatalogGameWished("another-buyer", game, true);
    const copy = await addCatalogGameToCollection("seller", game);
    assert.ok(!("error" in copy));
    const draft = await createListingDraft({ sellerId: "seller", sellerName: "QA seller", collectionItemId: copy.item.id });
    assert.ok(!("error" in draft));
    assert.equal((await readWishlistSales("buyer")).unreadGameCount, 0);

    async function prepareAndPublish(listing: MarketplaceListing) {
      await updateListing(listing.id, { askingPriceEur: 25, photos: [
        { slot: "cover-front", url: "/qa/front.jpg", width: 1200, height: 1600, bytes: 45_000, contentHash: "front", perceptualHash: "0000000000000000", uploadedAt: new Date().toISOString() },
        { slot: "cover-back", url: "/qa/back.jpg", width: 1200, height: 1600, bytes: 45_000, contentHash: "back", perceptualHash: "ffffffffffffffff", uploadedAt: new Date().toISOString() },
      ], aiAnalysis: { conditionVerdict: "QA fixture", conditionScore: 8, estimatedPriceEur: 25, notes: "Local test fixture", analyzedAt: new Date().toISOString(), model: "test-only", verificationStatus: "manual_verified" } });
      assert.deepEqual(await publishListing(listing.id, "seller"), { ok: true });
    }
    await prepareAndPublish(draft);
    const first = await readWishlistSales("buyer");
    assert.equal(first.unreadGameCount, 1);
    assert.equal((await readWishlistSales("another-buyer")).unreadGameCount, 1);
    await markWishlistSalesSeen("buyer", [{ catalogId: game, listingKeys: ["invented-future-publication"] }]);
    assert.equal((await readWishlistSales("buyer")).unreadGameCount, 1);

    const secondCopy = await addCatalogCopy("seller", game);
    assert.ok(!("error" in secondCopy));
    const secondDraft = await createListingDraft({ sellerId: "seller", sellerName: "QA seller", collectionItemId: secondCopy.item.id });
    assert.ok(!("error" in secondDraft));
    await prepareAndPublish(secondDraft);
    await markWishlistSalesSeen("buyer", [{ catalogId: game, listingKeys: first.games[0].unseenListingKeys }]);
    const remaining = await readWishlistSales("buyer");
    assert.equal(remaining.unreadGameCount, 1);
    assert.equal(remaining.games[0].unseenListingKeys.length, 1);
    assert.equal((await readWishlistSales("another-buyer")).games[0].unseenListingKeys.length, 2);
    await cancelListing(secondDraft.id, "seller");
    assert.equal((await readWishlistSales("buyer")).unreadGameCount, 0);
    assert.equal((await readWishlistSales("buyer")).games[0].listingCount, 1);
    await addCatalogGameToCollection("buyer", game);
    assert.deepEqual(await readWishlistSales("buyer"), { games: [], unreadGameCount: 0 });
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await rm(directory, { recursive: true, force: true });
  }
});
