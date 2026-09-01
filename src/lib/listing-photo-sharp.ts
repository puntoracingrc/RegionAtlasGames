import { createHash } from "crypto";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_INPUT_PIXELS,
  MIN_PHOTO_BYTES,
  MIN_PHOTO_HEIGHT,
  MIN_PHOTO_WIDTH,
} from "./listing-photos";

async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

export type ListingPhotoFingerprint = {
  contentHash: string;
  perceptualHash: string;
};

export function perceptualHashDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) {
    return Number.POSITIVE_INFINITY;
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export async function fingerprintListingPhoto(buffer: Buffer): Promise<ListingPhotoFingerprint> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(buffer, {
    limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
    sequentialRead: true,
    failOn: "error",
  })
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const hashBytes: number[] = [];
  for (let y = 0; y < 8; y += 1) {
    let byte = 0;
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 9 + x) * info.channels;
      const nextOffset = (y * 9 + x + 1) * info.channels;
      byte = (byte << 1) | (data[offset] > data[nextOffset] ? 1 : 0);
    }
    hashBytes.push(byte);
  }

  return {
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    perceptualHash: hashBytes.map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
}

export async function validateListingPhoto(buffer: Buffer): Promise<
  | { ok: true; width: number; height: number; bytes: number }
  | { ok: false; error: string }
> {
  if (buffer.length < MIN_PHOTO_BYTES) {
    return {
      ok: false,
      error: `Imagen demasiado pequeña (mín. ${Math.round(MIN_PHOTO_BYTES / 1000)} KB).`,
    };
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    return { ok: false, error: "La imagen supera el límite de 12 MB." };
  }

  try {
    const sharp = await loadSharp();
    const meta = await sharp(buffer, {
      limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
      sequentialRead: true,
      failOn: "error",
    }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) {
      return { ok: false, error: "Formato de imagen no permitido." };
    }
    if ((meta.pages ?? 1) > 1 || width * height > MAX_PHOTO_INPUT_PIXELS) {
      return { ok: false, error: "La imagen tiene demasiados píxeles para procesarla." };
    }

    if (width < MIN_PHOTO_WIDTH || height < MIN_PHOTO_HEIGHT) {
      return {
        ok: false,
        error: `Resolución insuficiente (mín. ${MIN_PHOTO_WIDTH}×${MIN_PHOTO_HEIGHT} px).`,
      };
    }

    return { ok: true, width, height, bytes: buffer.length };
  } catch {
    return { ok: false, error: "Archivo de imagen no válido." };
  }
}

export type NormalizedListingPhoto = {
  buffer: Buffer;
  width: number;
  height: number;
};

export async function normalizeListingPhotoWithMetadata(
  buffer: Buffer,
): Promise<NormalizedListingPhoto> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(buffer, {
    limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
    sequentialRead: true,
    failOn: "error",
  })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}
