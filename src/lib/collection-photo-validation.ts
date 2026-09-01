import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_INPUT_PIXELS,
} from "./listing-photos";

const MIN_COLLECTION_PHOTO_BYTES = 5_000;
const MIN_COLLECTION_PHOTO_LONG_SIDE = 320;
const MIN_COLLECTION_PHOTO_SHORT_SIDE = 240;

async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

export async function validateCollectionPhoto(buffer: Buffer): Promise<
  | { ok: true; width: number; height: number }
  | { ok: false; error: string }
> {
  if (buffer.length < MIN_COLLECTION_PHOTO_BYTES) {
    return { ok: false, error: "La imagen es demasiado pequeña." };
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    return { ok: false, error: "La imagen supera el límite de 12 MB." };
  }

  try {
    const sharp = await loadSharp();
    const metadata = await sharp(buffer, {
      limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
      sequentialRead: true,
      failOn: "error",
    }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!metadata.format || !["jpeg", "png", "webp", "avif", "heif"].includes(metadata.format)) {
      return { ok: false, error: "Formato de imagen no permitido." };
    }
    if ((metadata.pages ?? 1) > 1 || width * height > MAX_PHOTO_INPUT_PIXELS) {
      return { ok: false, error: "La imagen tiene demasiados píxeles para procesarla." };
    }
    if (
      Math.max(width, height) < MIN_COLLECTION_PHOTO_LONG_SIDE
      || Math.min(width, height) < MIN_COLLECTION_PHOTO_SHORT_SIDE
    ) {
      return { ok: false, error: "La imagen necesita al menos 320×240 píxeles." };
    }

    return { ok: true, width, height };
  } catch {
    return { ok: false, error: "Archivo de imagen no válido." };
  }
}
