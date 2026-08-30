import assert from "node:assert/strict";
import test from "node:test";
import { applyPricePatch } from "./admin-price-patch";
import {
  normalizeOriginalGameContents,
  resolveOriginalGameContents,
} from "./original-game-contents";
import type { CatalogGame } from "./types";
import {
  describeRegionalPackagingComparison,
  describeRegionalPackagingVariant,
  normalizeRegionalPackaging,
} from "./regional-packaging";

test("expects a manual by generation only before PS3", () => {
  assert.deepEqual(resolveOriginalGameContents({ platformSlug: "ps2" }), {
    contents: ["manual"],
    source: "platform_generation_default",
    explicit: false,
  });
  assert.deepEqual(resolveOriginalGameContents({ platformSlug: "ps3" }).contents, []);
  assert.deepEqual(resolveOriginalGameContents({ platformSlug: "ps5" }).contents, []);
});

test("catalog-confirmed contents override the generation default", () => {
  assert.deepEqual(normalizeOriginalGameContents([
    "poster",
    "manual",
    "poster",
    "not_supported",
  ]), ["manual", "poster"]);
  assert.deepEqual(resolveOriginalGameContents({
    platformSlug: "ps2",
    originalContents: ["soundtrack", "artbook"],
    originalContentsSource: "admin_verified",
  }), {
    contents: ["soundtrack", "artbook"],
    source: "admin_verified",
    explicit: true,
  });
});

test("admin price patch stores only supported original contents", () => {
  const game = {
    id: "ps4-example",
    platformSlug: "ps4",
    recommendedPrice: null,
  } as CatalogGame;
  const patched = applyPricePatch(game, {
    originalContents: ["poster", "manual", "unknown"],
    originalContentsSource: "admin_verified",
    originalContentsUpdatedAt: "2026-08-30T10:00:00.000Z",
    manualExpected: true,
  });
  assert.deepEqual(patched.originalContents, ["manual", "poster"]);
  assert.equal(patched.manualExpected, true);
  assert.equal(patched.originalContentsSource, "admin_verified");
});

test("regional packaging keeps concrete cover-language evidence", () => {
  const variants = normalizeRegionalPackaging([
    { region: "PAL España", frontCoverLanguages: ["ES"], backCoverLanguages: ["es"] },
    { region: "PAL Europa", frontCoverLanguages: ["en", "fr"], backCoverLanguages: ["en", "fr"] },
    { region: "PAL Europa", frontCoverLanguages: ["de"] },
  ]);

  assert.equal(variants.length, 2);
  assert.equal(
    describeRegionalPackagingVariant(variants[0]),
    "Portada y contraportada en español.",
  );
  assert.equal(
    describeRegionalPackagingComparison(variants),
    "PAL España: Portada y contraportada en español. PAL Europa: Portada y contraportada en inglés y francés.",
  );
});
