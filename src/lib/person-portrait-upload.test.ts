import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  MAX_PERSON_PORTRAIT_UPLOAD_BYTES,
  normalizePersonPortrait,
  validatePersonPortraitUploadEnvelope,
} from "./person-portrait-upload";

test("normalizes a valid portrait to a bounded WebP with a content hash", async () => {
  const source = await sharp({
    create: {
      width: 800,
      height: 1200,
      channels: 3,
      background: { r: 40, g: 90, b: 150 },
    },
  }).png().toBuffer();

  const normalized = await normalizePersonPortrait(source);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.equal(normalized.contentType, "image/webp");
  assert.match(normalized.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(normalized.width, 800);
  assert.equal(normalized.height, 1200);
  assert.equal(normalized.bytes, normalized.buffer.length);
  assert.equal((await sharp(normalized.buffer).metadata()).format, "webp");
});

test("rejects portraits below the minimum resolution", async () => {
  const source = await sharp({
    create: {
      width: 120,
      height: 180,
      channels: 3,
      background: { r: 30, g: 30, b: 30 },
    },
  }).jpeg().toBuffer();

  const result = await normalizePersonPortrait(source);
  assert.deepEqual(result, {
    ok: false,
    error: "Resolución insuficiente (mín. 200×200 px).",
    status: 400,
  });
});

test("rejects invalid files and oversized upload envelopes", async () => {
  assert.deepEqual(await normalizePersonPortrait(Buffer.from("not-an-image")), {
    ok: false,
    error: "Archivo de imagen no válido.",
    status: 400,
  });
  assert.deepEqual(
    validatePersonPortraitUploadEnvelope({
      size: MAX_PERSON_PORTRAIT_UPLOAD_BYTES + 1,
      type: "image/jpeg",
    }),
    { ok: false, error: "La imagen supera el límite de 12 MB.", status: 413 },
  );
  assert.deepEqual(
    validatePersonPortraitUploadEnvelope({ size: 1_000, type: "text/plain" }),
    { ok: false, error: "El archivo debe ser una imagen.", status: 415 },
  );
});
