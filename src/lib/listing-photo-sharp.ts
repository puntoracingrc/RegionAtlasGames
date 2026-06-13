import {
  MIN_PHOTO_BYTES,
  MIN_PHOTO_HEIGHT,
  MIN_PHOTO_WIDTH,
} from "./listing-photos";

async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
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

  try {
    const sharp = await loadSharp();
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
  const sharp = await loadSharp();
  return sharp(buffer)
    .rotate()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
