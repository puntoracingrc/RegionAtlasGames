import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getCatalogGame } from "./catalog";
import {
  addCatalogGameToCollection,
  addCatalogCopy,
  catalogGameToCollectionItem,
  getUserCollectionItem,
  getUserCollectionViews,
  getOwnedCatalogIds,
  readUserCollection,
  recordCompletedCollectionSale,
  removeUserCollectionPhoto,
  saveUserCollectionItems,
  summarizeCollection,
  updateUserCollectionItemDetails,
  upsertUserCollectionPhoto,
} from "./collection-store";
import { COLLECTION_PHOTO_SLOTS } from "./collection-photos";
import {
  readCollectionPhotoFile,
  saveCollectionPhotoFile,
} from "./collection-photo-storage";
import { primaryConditionPrice } from "./condition-prices";
import type { CollectionItem, CollectionPhoto } from "./types";

type EnvironmentSnapshot = Record<string, string | undefined>;

function restoreEnvironment(snapshot: EnvironmentSnapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function legacyImportedPs5Item(id: string): CollectionItem {
  const game = getCatalogGame("ps5-astro-bot");
  assert.ok(game);
  const item = {
    ...catalogGameToCollectionItem(game, []),
    id,
    catalogId: null,
    catalogMatched: false,
    inRetroCatalog: false,
    quantity: 2,
    buyPrice: 35,
    notes: "Importado antes de activar PS5",
  };
  return {
    ...item,
    totalValue: item.totalValue == null ? null : item.totalValue * item.quantity,
  };
}

test("repairs an exact legacy PS5 match and exposes it as owned", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-collection-"));
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    const saved = await saveUserCollectionItems(
      "legacy-ps5-owner",
      [legacyImportedPs5Item("legacy-astro-bot")],
      { source: "collection.csv" },
    );
    assert.ok(!("error" in saved));

    assert.deepEqual(await getOwnedCatalogIds("legacy-ps5-owner"), ["ps5-astro-bot"]);

    const repaired = await readUserCollection("legacy-ps5-owner");
    assert.equal(repaired.items.length, 2);
    assert.equal(repaired.items[0]?.catalogId, "ps5-astro-bot");
    assert.equal(repaired.items[0]?.catalogMatched, true);
    assert.equal(repaired.items[0]?.inRetroCatalog, true);
    assert.equal(repaired.items[0]?.quantity, 1);
    assert.equal(repaired.items[1]?.quantity, 1);
    assert.notEqual(repaired.items[0]?.id, repaired.items[1]?.id);
    assert.equal(repaired.items[0]?.buyPrice, 35);
    assert.equal(repaired.items[1]?.buyPrice, 35);
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});

test("adding an exact imported game links it without creating a duplicate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-collection-"));
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    const saved = await saveUserCollectionItems(
      "legacy-ps5-add",
      [legacyImportedPs5Item("legacy-astro-bot")],
      { source: "collection.csv" },
    );
    assert.ok(!("error" in saved));

    const result = await addCatalogGameToCollection("legacy-ps5-add", "ps5-astro-bot");
    assert.ok(!("error" in result));
    assert.equal(result.linkedExisting, true);
    assert.equal(result.item.id, "legacy-astro-bot");
    assert.equal(result.item.quantity, 1);
    assert.equal(result.item.buyPrice, 35);

    const collection = await readUserCollection("legacy-ps5-add");
    assert.equal(collection.items.length, 2);
    assert.equal(collection.items[0]?.catalogId, "ps5-astro-bot");
    assert.equal(collection.items[1]?.catalogId, "ps5-astro-bot");
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});

test("refreshes linked collection values from current catalog prices", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-collection-"));
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    const game = getCatalogGame("ps4-bleach-rebirth-of-souls");
    assert.ok(game);
    const completePrice = primaryConditionPrice(game) ?? game.recommendedPrice;
    assert.ok(completePrice != null);
    assert.ok(game.estimatedPriceSealed != null);

    const staleBase = catalogGameToCollectionItem(game, []);
    const stalePrices = {
      recommendedPrice: null,
      totalValue: null,
      hasEsPrice: false,
      estimatedPriceLoose: null,
      estimatedPriceGameManual: null,
      estimatedPriceComplete: null,
      estimatedPriceSealed: null,
      estimatedPriceNewRetail: null,
      priceSource: null,
      priceDataSources: null,
      updatedAt: null,
    };
    const openItem: CollectionItem = {
      ...staleBase,
      ...stalePrices,
      id: "stale-open-copy",
      sealed: false,
      quantity: 2,
    };
    const sealedItem: CollectionItem = {
      ...staleBase,
      ...stalePrices,
      id: "stale-sealed-copy",
      sealed: true,
      quantity: 1,
    };

    const saved = await saveUserCollectionItems(
      "stale-price-owner",
      [openItem, sealedItem],
      { source: "collection.csv" },
    );
    assert.ok(!("error" in saved));

    const views = await getUserCollectionViews("stale-price-owner");
    assert.equal(views.length, 3);
    assert.equal(views[0]?.recommendedPrice, completePrice);
    assert.equal(views[0]?.quantity, 1);
    assert.equal(views[0]?.totalValue, completePrice);
    assert.equal(views[0]?.hasEsPrice, true);
    assert.equal(views[1]?.recommendedPrice, completePrice);
    assert.equal(views[1]?.totalValue, completePrice);
    assert.equal(views[1]?.hasEsPrice, true);
    assert.equal(views[2]?.recommendedPrice, game.estimatedPriceSealed);
    assert.equal(views[2]?.totalValue, game.estimatedPriceSealed);
    assert.equal(views[2]?.hasEsPrice, true);

    const summary = summarizeCollection(views);
    assert.equal(summary.totalItems, 1);
    assert.equal(summary.totalUnits, 3);
    assert.equal(summary.withEsPrice, 1);
    assert.equal(
      summary.totalRecommendedValue,
      Math.round((completePrice * 2 + game.estimatedPriceSealed) * 100) / 100,
    );
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});

test("manages individual copies and applies completed sales once", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-collection-"));
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    const userId = "individual-copies-owner";
    const catalogId = "ps4-13-sentinels-aegis-rim";
    const first = await addCatalogGameToCollection(userId, catalogId);
    assert.ok(!("error" in first));
    const second = await addCatalogCopy(userId, catalogId);
    assert.ok(!("error" in second));

    const updated = await updateUserCollectionItemDetails(userId, first.item.id, {
      collectionCondition: "sealed",
      buyPrice: 18.5,
      ownerEstimatedPrice: 72,
      purchasedAt: "2026-08-12T00:00:00.000Z",
      addedAt: "2026-08-13T00:00:00.000Z",
      notes: "Primera copia precintada",
    });
    assert.ok(!("error" in updated));
    assert.equal(updated.item.quantity, 1);
    assert.equal(updated.item.sealed, true);
    assert.equal(updated.item.buyPrice, 18.5);
    assert.equal(updated.item.ownerEstimatedPrice, 72);
    assert.equal(updated.item.purchasedAt, "2026-08-12T00:00:00.000Z");

    const salePhoto: CollectionPhoto = {
      slot: "cover-front",
      url: `/api/user/collection/copies/${first.item.id}/photos/cover-front?v=1`,
      width: 900,
      height: 1200,
      bytes: 13,
      uploadedAt: "2026-09-01T08:00:00.000Z",
    };
    await saveCollectionPhotoFile(
      userId,
      first.item.id,
      salePhoto.slot,
      Buffer.from("private photo"),
    );
    assert.ok(!("error" in await upsertUserCollectionPhoto(
      userId,
      first.item.id,
      salePhoto,
    )));
    assert.ok(await readCollectionPhotoFile(userId, first.item.id, salePhoto.slot));

    const views = await getUserCollectionViews(userId);
    assert.equal(views.length, 2);
    assert.equal(views.reduce((sum, item) => sum + item.quantity, 0), 2);
    const game = getCatalogGame(catalogId);
    assert.ok(game?.estimatedPriceSealed != null);
    assert.equal(views[0]?.recommendedPrice, game.estimatedPriceSealed);
    assert.equal(views[0]?.totalValue, game.estimatedPriceSealed);

    assert.deepEqual(
      await recordCompletedCollectionSale(userId, first.item.id, "sale-one"),
      { adjusted: true, remaining: 0 },
    );
    assert.deepEqual(
      await recordCompletedCollectionSale(userId, first.item.id, "sale-one"),
      { adjusted: false, remaining: 0 },
    );
    assert.equal(await getUserCollectionItem(userId, first.item.id), undefined);
    assert.equal(await readCollectionPhotoFile(userId, first.item.id, salePhoto.slot), null);
    assert.equal((await readUserCollection(userId)).items.length, 1);
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});

test("stores up to six ordered private photo slots per individual copy", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-collection-"));
  const env: EnvironmentSnapshot = {
    APP_DATA_DIR: process.env.APP_DATA_DIR,
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
  };
  process.env.APP_DATA_DIR = directory;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;

  try {
    assert.deepEqual(COLLECTION_PHOTO_SLOTS, [
      "cover-front",
      "cover-back",
      "detail-1",
      "detail-2",
      "detail-3",
      "detail-4",
    ]);

    const userId = "photo-copy-owner";
    const result = await addCatalogGameToCollection(
      userId,
      "ps4-13-sentinels-aegis-rim",
    );
    assert.ok(!("error" in result));

    const detail: CollectionPhoto = {
      slot: "detail-2",
      url: "/private/detail-2?v=1",
      width: 1200,
      height: 900,
      bytes: 98_000,
      uploadedAt: "2026-09-01T08:00:00.000Z",
    };
    const front: CollectionPhoto = {
      slot: "cover-front",
      url: "/private/front?v=1",
      width: 900,
      height: 1200,
      bytes: 102_000,
      uploadedAt: "2026-09-01T08:01:00.000Z",
    };
    assert.ok(!("error" in await upsertUserCollectionPhoto(userId, result.item.id, detail)));
    assert.ok(!("error" in await upsertUserCollectionPhoto(userId, result.item.id, front)));

    let stored = await getUserCollectionItem(userId, result.item.id);
    assert.deepEqual(stored?.photos?.map((photo) => photo.slot), ["cover-front", "detail-2"]);

    const replacement = {
      ...front,
      url: "/private/front?v=2",
      uploadedAt: "2026-09-01T08:02:00.000Z",
    };
    assert.ok(!("error" in await upsertUserCollectionPhoto(userId, result.item.id, replacement)));
    stored = await getUserCollectionItem(userId, result.item.id);
    assert.equal(stored?.photos?.length, 2);
    assert.equal(stored?.photos?.[0]?.url, replacement.url);

    assert.ok(!("error" in await removeUserCollectionPhoto(userId, result.item.id, "detail-2")));
    stored = await getUserCollectionItem(userId, result.item.id);
    assert.deepEqual(stored?.photos?.map((photo) => photo.slot), ["cover-front"]);
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});
