import { createHash } from "crypto";

export const MAX_PERSON_PORTRAIT_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_PERSON_PORTRAIT_INPUT_PIXELS = 24_000_000;
export const MIN_PERSON_PORTRAIT_SIDE = 200;

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export type PersonPortraitUploadError = {
  ok: false;
  error: string;
  status: 400 | 413 | 415;
};

export type NormalizedPersonPortrait = {
  ok: true;
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  contentHash: string;
  contentType: "image/webp";
};

export function validatePersonPortraitUploadEnvelope(file: Pick<File, "size" | "type">): PersonPortraitUploadError | null {
  if (file.size <= 0) {
    return { ok: false, error: "El archivo de retrato está vacío.", status: 400 };
  }
  if (file.size > MAX_PERSON_PORTRAIT_UPLOAD_BYTES) {
    return { ok: false, error: "La imagen supera el límite de 12 MB.", status: 413 };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "El archivo debe ser una imagen.", status: 415 };
  }
  return null;
}

async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

export async function normalizePersonPortrait(
  buffer: Buffer,
): Promise<NormalizedPersonPortrait | PersonPortraitUploadError> {
  if (buffer.length <= 0) {
    return { ok: false, error: "El archivo de retrato está vacío.", status: 400 };
  }
  if (buffer.length > MAX_PERSON_PORTRAIT_UPLOAD_BYTES) {
    return { ok: false, error: "La imagen supera el límite de 12 MB.", status: 413 };
  }

  try {
    const sharp = await loadSharp();
    const image = sharp(buffer, {
      limitInputPixels: MAX_PERSON_PORTRAIT_INPUT_PIXELS,
      sequentialRead: true,
      failOn: "error",
    }).rotate();
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return { ok: false, error: "Formato de imagen no permitido.", status: 415 };
    }
    if ((metadata.pages ?? 1) > 1 || width * height > MAX_PERSON_PORTRAIT_INPUT_PIXELS) {
      return { ok: false, error: "La imagen tiene demasiados píxeles para procesarla.", status: 400 };
    }
    if (width < MIN_PERSON_PORTRAIT_SIDE || height < MIN_PERSON_PORTRAIT_SIDE) {
      return {
        ok: false,
        error: `Resolución insuficiente (mín. ${MIN_PERSON_PORTRAIT_SIDE}×${MIN_PERSON_PORTRAIT_SIDE} px).`,
        status: 400,
      };
    }

    const normalized = await image
      .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      buffer: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
      bytes: normalized.data.length,
      contentHash: createHash("sha256").update(normalized.data).digest("hex"),
      contentType: "image/webp",
    };
  } catch {
    return { ok: false, error: "Archivo de imagen no válido.", status: 400 };
  }
}
