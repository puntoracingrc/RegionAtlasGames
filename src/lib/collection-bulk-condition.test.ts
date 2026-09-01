import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { updateCollectionConditionBulk } from "./collection-bulk-condition";
import {
  addCatalogCopy,
  addCatalogGameToCollection,
  getUserCollectionItem,
} from "./collection-store";
import { createListingDraft, getListing, updateListing } from "./listings";

type EnvironmentSnapshot = Record<string, string | undefined>;

function restoreEnvironment(snapshot: EnvironmentSnapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function assertResult<T extends object>(
  result: T,
): asserts result is Exclude<T, { error: string }> {
  if (result && typeof result === "object" && "error" in result) {
    assert.fail(String(result.error));
  }
}

test("bulk condition changes are atomic and synchronize draft listings", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-bulk-condition-"));
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
    const userId = "bulk-condition-owner";
    const catalogId = "ps4-13-sentinels-aegis-rim";
    const first = await addCatalogGameToCollection(userId, catalogId);
    const second = await addCatalogCopy(userId, catalogId);
    assertResult(first);
    assertResult(second);

    const draft = await createListingDraft({
      sellerId: userId,
      sellerName: "Coleccionista",
      collectionItemId: first.item.id,
    });
    assertResult(draft);

    const updated = await updateCollectionConditionBulk({
      userId,
      itemIds: [first.item.id, second.item.id],
      collectionCondition: "sealed",
    });
    assertResult(updated);
    assert.equal(updated.updatedCount, 2);
    assert.equal(updated.draftListingsSynced, 1);
    const firstUpdated = await getUserCollectionItem(userId, first.item.id);
    const secondUpdated = await getUserCollectionItem(userId, second.item.id);
    assert.equal(firstUpdated?.collectionCondition, "sealed");
    assert.equal(secondUpdated?.collectionCondition, "sealed");
    assert.equal(firstUpdated?.totalValue, firstUpdated?.estimatedPriceSealed);
    assert.equal(secondUpdated?.totalValue, secondUpdated?.estimatedPriceSealed);
    assert.equal((await getListing(draft.id))?.collectionCondition, "sealed");

    const noChange = await updateCollectionConditionBulk({
      userId,
      itemIds: [first.item.id, second.item.id],
      collectionCondition: "sealed",
    });
    assertResult(noChange);
    assert.equal(noChange.updatedCount, 0);

    assert.ok(await updateListing(draft.id, { status: "active" }));
    assert.deepEqual(
      await updateCollectionConditionBulk({
        userId,
        itemIds: [first.item.id, second.item.id],
        collectionCondition: "loose",
      }),
      {
        error: "Una copia tiene una venta activa o pendiente. Retírala de la selección.",
        status: 409,
      },
    );
    assert.equal((await getUserCollectionItem(userId, first.item.id))?.collectionCondition, "sealed");
    assert.equal((await getUserCollectionItem(userId, second.item.id))?.collectionCondition, "sealed");
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});

test("bulk condition changes reject states unsupported by any selected platform", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "region-atlas-bulk-condition-"));
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
    const userId = "bulk-condition-mixed-platforms";
    const ps4 = await addCatalogGameToCollection(userId, "ps4-13-sentinels-aegis-rim");
    const n64 = await addCatalogGameToCollection(userId, "n64-007-world-is-not-enough");
    assertResult(ps4);
    assertResult(n64);

    assert.deepEqual(
      await updateCollectionConditionBulk({
        userId,
        itemIds: [ps4.item.id, n64.item.id],
        collectionCondition: "game-manual",
      }),
      {
        error: "El estado elegido no está disponible para PS4.",
        status: 400,
      },
    );
    assert.equal((await getUserCollectionItem(userId, ps4.item.id))?.collectionCondition, "complete");
    assert.equal((await getUserCollectionItem(userId, n64.item.id))?.collectionCondition, "complete");
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});
