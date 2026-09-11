import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getCatalogGame } from "./catalog";
import { addCatalogCopy, addCatalogGameToCollection, catalogGameToCollectionItem, readUserCollection, removeCatalogGameFromCollection, saveUserCollectionItems, updateUserCollection } from "./collection-store";
import { acknowledgeWishlistAchievements, readUserWishlist, setCatalogGameWished } from "./wishlist-store";

const first = "ps5-astro-bot";
const second = "ps4-13-sentinels-aegis-rim";

async function isolated(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "regionatlas-wishlist-test-"));
  const keys = ["APP_DATA_DIR", "VERCEL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.APP_DATA_DIR = directory;
  for (const key of keys.slice(1)) delete process.env[key];
  try { await run(directory); }
  finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await rm(directory, { recursive: true, force: true });
  }
}

test("wishlist changes persist, are idempotent and belong only to their owner", () => isolated(async (directory) => {
  await Promise.all([setCatalogGameWished("alice", first, true), setCatalogGameWished("alice", second, true), setCatalogGameWished("alice", first, true)]);
  const alice = await readUserWishlist("alice");
  assert.deepEqual(new Set(alice.wishlist.map((entry) => entry.catalogId)), new Set([first, second]));
  assert.equal(alice.wishlist.length, 2);
  assert.deepEqual(await readUserWishlist("bob"), { wishlist: [], achievements: [] });
  const disk = JSON.parse(await readFile(path.join(directory, "collections/alice.json"), "utf8"));
  assert.equal(disk.wishlist.length, 2);
  await setCatalogGameWished("alice", first, false);
  await setCatalogGameWished("alice", first, false);
  assert.deepEqual((await readUserWishlist("alice")).wishlist.map((entry) => entry.catalogId), [second]);
  assert.equal("error" in await setCatalogGameWished("alice", "missing-game", true), true);
}));

test("acquiring a desired game removes it and records exactly one durable celebration", () => isolated(async () => {
  await setCatalogGameWished("collector", first, true);
  const added = await addCatalogGameToCollection("collector", first);
  assert.ok(!("error" in added));
  const state = await readUserWishlist("collector");
  assert.deepEqual(state.wishlist, []);
  assert.equal(state.achievements.length, 1);
  assert.equal(state.achievements[0].games[0].collectionItemId, added.item.id);
  assert.equal(state.achievements[0].games[0].catalogId, first);
  const alreadyOwned = await setCatalogGameWished("collector", first, true);
  assert.ok("error" in alreadyOwned && alreadyOwned.status === 409);
  await addCatalogCopy("collector", first);
  assert.equal((await readUserWishlist("collector")).achievements.length, 1);
  await acknowledgeWishlistAchievements("someone-else", state.achievements.map((entry) => entry.id));
  assert.equal((await readUserWishlist("collector")).achievements.length, 1);
  await acknowledgeWishlistAchievements("collector", state.achievements.map((entry) => entry.id));
  assert.deepEqual((await readUserWishlist("collector")).achievements, []);
  await removeCatalogGameFromCollection("collector", first);
  assert.deepEqual((await readUserWishlist("collector")).wishlist, []);
}));

test("concurrent acquisition and wishlist requests never leave an owned game desired", () => isolated(async () => {
  await Promise.all([setCatalogGameWished("race", first, true), addCatalogGameToCollection("race", first), setCatalogGameWished("race", second, true)]);
  const file = await readUserCollection("race");
  assert.equal(file.items.filter((item) => item.catalogId === first).length, 1);
  assert.deepEqual(file.wishlist?.map((entry) => entry.catalogId), [second]);
}));

test("imports preserve unrelated wishes and collection metadata while celebrating matched games", () => isolated(async () => {
  await setCatalogGameWished("importer", first, true);
  await setCatalogGameWished("importer", second, true);
  await updateUserCollection("importer", (file) => ({ next: { ...file, completedSaleIds: ["completed-sale"], catalogGapReportSentAt: "2026-09-01T00:00:00Z" }, result: undefined }));
  const game = getCatalogGame(first); assert.ok(game);
  const imported = await saveUserCollectionItems("importer", [catalogGameToCollectionItem(game, [])], { source: "owned.csv" });
  assert.ok(!("error" in imported));
  const file = await readUserCollection("importer");
  assert.deepEqual(file.wishlist?.map((entry) => entry.catalogId), [second]);
  assert.deepEqual(file.completedSaleIds, ["completed-sale"]);
  assert.equal(file.catalogGapReportSentAt, "2026-09-01T00:00:00Z");
  assert.equal(file.wishlistAchievements?.[0].games[0].catalogId, first);
  assert.equal(file.items.length, 1);
}));

test("automatic catalog linking fulfils a wish without creating another copy", () => isolated(async () => {
  await setCatalogGameWished("legacy", first, true);
  const game = getCatalogGame(first); assert.ok(game);
  const item = { ...catalogGameToCollectionItem(game, []), catalogId: null, catalogMatched: false };
  await saveUserCollectionItems("legacy", [item], { source: "legacy.csv" });
  const file = await readUserCollection("legacy");
  assert.equal(file.items.length, 1);
  assert.equal(file.items[0].catalogId, first);
  assert.deepEqual(file.wishlist, []);
  assert.equal(file.wishlistAchievements?.length, 1);
}));

test("a corrupt collection is never replaced by a new wishlist", () => isolated(async (directory) => {
  await mkdir(path.join(directory, "collections"), { recursive: true });
  const filename = path.join(directory, "collections/broken.json");
  const original = '{"userId":"broken","items":[';
  await writeFile(filename, original);
  await assert.rejects(() => setCatalogGameWished("broken", first, true));
  assert.equal(await readFile(filename, "utf8"), original);
}));


test("regional editions of the same title remain separate desires", () => isolated(async () => {
  const spanish = "ps2-es-sces-50494";
  const japanese = "ps2-japon-final-fantasy-x";
  await setCatalogGameWished("regional", spanish, true);
  await setCatalogGameWished("regional", japanese, true);
  const added = await addCatalogGameToCollection("regional", spanish);
  assert.ok(!("error" in added));
  assert.deepEqual((await readUserWishlist("regional")).wishlist.map((entry) => entry.catalogId), [japanese]);
}));

test("an unacknowledged achievement follows a remaining copy and clears when none remain", () => isolated(async () => {
  await setCatalogGameWished("copies", first, true);
  const original = await addCatalogGameToCollection("copies", first);
  const another = await addCatalogCopy("copies", first);
  assert.ok(!("error" in original) && !("error" in another));
  await updateUserCollection("copies", (file) => ({ next: { ...file, items: file.items.filter((item) => item.id !== original.item.id) }, result: undefined }));
  assert.equal((await readUserWishlist("copies")).achievements[0].games[0].collectionItemId, another.item.id);
  await removeCatalogGameFromCollection("copies", first);
  assert.deepEqual(await readUserWishlist("copies"), { wishlist: [], achievements: [] });
}));
