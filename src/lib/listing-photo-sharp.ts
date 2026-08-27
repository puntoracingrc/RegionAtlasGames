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

export async function normalizeListingPhoto(buffer: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(buffer, {
    limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
    sequentialRead: true,
    failOn: "error",
  })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
