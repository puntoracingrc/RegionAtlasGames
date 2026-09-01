import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeListingPhotoWithMetadata } from "./listing-photo-sharp";
import { findDuplicateListingPhoto, photosReadyForPublish } from "./listing-photos";
import type { ListingPhoto } from "./marketplace-types";

function photo(
  slot: ListingPhoto["slot"],
  contentHash: string,
  perceptualHash: string,
): ListingPhoto {
  return {
    slot,
    url: `/photos/${slot}.jpg`,
    width: 1200,
    height: 1600,
    bytes: 50_000,
    contentHash,
    perceptualHash,
    uploadedAt: new Date(0).toISOString(),
  };
}

test("only front cover and back cover are required", () => {
  assert.equal(photosReadyForPublish([
    photo("cover-front", "front", "0000000000000000"),
    photo("cover-back", "back", "ffffffffffffffff"),
  ]), true);
  assert.equal(photosReadyForPublish([
    photo("cover-front", "front", "0000000000000000"),
  ]), false);
});

test("exact and visually equivalent photos are rejected across slots", () => {
  const front = photo("cover-front", "same-file", "0f0f0f0f0f0f0f0f");
  assert.equal(
    findDuplicateListingPhoto([front], photo("cover-back", "same-file", "ffffffffffffffff"))?.kind,
    "same_file",
  );
  assert.equal(
    findDuplicateListingPhoto([front], photo("cover-back", "different-file", "0f0f0f0f0f0f0f0e"))?.kind,
    "same_image",
  );
  assert.equal(
    findDuplicateListingPhoto([front], photo("cover-back", "different-file", "f0f0f0f0f0f0f0f0")),
    null,
  );
});

test("normalizes oversized dimensions and reports the stored image size", async () => {
  const source = await sharp({
    create: {
      width: 3600,
      height: 1200,
      channels: 3,
      background: "#a85018",
    },
  }).png().toBuffer();

  const normalized = await normalizeListingPhotoWithMetadata(source);
  const metadata = await sharp(normalized.buffer).metadata();

  assert.equal(normalized.width, 2400);
  assert.equal(normalized.height, 800);
  assert.equal(metadata.width, normalized.width);
  assert.equal(metadata.height, normalized.height);
  assert.equal(metadata.format, "jpeg");
});
