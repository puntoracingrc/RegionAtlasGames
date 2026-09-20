import assert from "node:assert/strict";
import test from "node:test";
import { shouldLocalizeDraftCover } from "./admin-catalog-publish";

test("keeps existing CDN cover paths when publishing regional identities", () => {
  assert.equal(shouldLocalizeDraftCover("/covers/ps3/007-blood-stone.jpg"), false);
  assert.equal(shouldLocalizeDraftCover("/catalog-covers/ps3/scan.webp"), false);
});

test("localizes external cover URLs before publishing", () => {
  assert.equal(shouldLocalizeDraftCover("https://example.com/cover.jpg"), true);
  assert.equal(shouldLocalizeDraftCover(null), false);
});
