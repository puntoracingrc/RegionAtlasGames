import sharp from "sharp";
import type { ListingPhoto, ListingPhotoSlot } from "./marketplace-types";
import { OPTIONAL_PHOTO_SLOTS, REQUIRED_PHOTO_SLOTS } from "./marketplace-types";

export const MIN_PHOTO_WIDTH = 800;
export const MIN_PHOTO_HEIGHT = 600;
export const MIN_PHOTO_BYTES = 40_000;

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

  try {
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

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

export async function normalizeListingPhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export function missingRequiredPhotos(photos: ListingPhoto[]): ListingPhotoSlot[] {
  const uploaded = new Set(photos.map((p) => p.slot));
  return REQUIRED_PHOTO_SLOTS.filter((slot) => !uploaded.has(slot));
}

export function photosReadyForPublish(photos: ListingPhoto[]): boolean {
  return missingRequiredPhotos(photos).length === 0;
}

export function allPhotoSlots() {
  return [...REQUIRED_PHOTO_SLOTS, ...OPTIONAL_PHOTO_SLOTS];
}
