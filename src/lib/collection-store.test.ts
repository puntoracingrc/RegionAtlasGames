import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getCatalogGame } from "./catalog";
import {
  addCatalogGameToCollection,
  catalogGameToCollectionItem,
  getOwnedCatalogIds,
  readUserCollection,
  saveUserCollectionItems,
} from "./collection-store";
import type { CollectionItem } from "./types";

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
  return {
    ...catalogGameToCollectionItem(game, []),
    id,
    catalogId: null,
    catalogMatched: false,
    inRetroCatalog: false,
    quantity: 2,
    buyPrice: 35,
    notes: "Importado antes de activar PS5",
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
    assert.equal(repaired.items.length, 1);
    assert.equal(repaired.items[0]?.catalogId, "ps5-astro-bot");
    assert.equal(repaired.items[0]?.catalogMatched, true);
    assert.equal(repaired.items[0]?.inRetroCatalog, true);
    assert.equal(repaired.items[0]?.quantity, 2);
    assert.equal(repaired.items[0]?.buyPrice, 35);
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
    assert.equal(result.item.quantity, 2);
    assert.equal(result.item.buyPrice, 35);

    const collection = await readUserCollection("legacy-ps5-add");
    assert.equal(collection.items.length, 1);
    assert.equal(collection.items[0]?.catalogId, "ps5-astro-bot");
  } finally {
    restoreEnvironment(env);
    await rm(directory, { recursive: true, force: true });
  }
});
