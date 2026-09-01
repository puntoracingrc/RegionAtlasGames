import assert from "node:assert/strict";
import test from "node:test";
import {
  listingPhotoNeedsResize,
  listingPhotoUploadError,
} from "./listing-photo-client";

test("turns upload responses into useful messages", () => {
  assert.match(listingPhotoUploadError(413), /demasiado grande/i);
  assert.match(listingPhotoUploadError(401), /sesión/i);
  assert.match(listingPhotoUploadError(429), /muchas subidas/i);
  assert.equal(listingPhotoUploadError(409, "La portada está repetida."), "La portada está repetida.");
});

test("resizes photos by file weight or pixel dimensions", () => {
  assert.equal(listingPhotoNeedsResize(500_000, 1200, 1600), false);
  assert.equal(listingPhotoNeedsResize(500_000, 2401, 1200), true);
  assert.equal(listingPhotoNeedsResize(3_500_001, 1200, 1600), true);
});
