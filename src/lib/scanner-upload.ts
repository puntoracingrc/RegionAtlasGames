import sharp from "sharp";
import { createHash } from "node:crypto";
import { SCANNER_MAX_BODY_BYTES, SCANNER_MAX_HINT, SCANNER_MAX_PHOTO_BYTES, SCANNER_MAX_PHOTOS } from "./game-scanner";
import { ScannerError } from "./scanner-engine";
import { SCANNER_DEFAULT_MODEL, scannerModel, scannerModelsForAccess } from "./scanner-models";

export async function readScannerUpload(request: Request, platformSlugs: string[], advancedModels = false) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;")) throw new ScannerError("invalid_upload", "Envía las fotos como archivos de imagen.", 415);
  if (Number(request.headers.get("content-length")) > SCANNER_MAX_BODY_BYTES) throw new ScannerError("too_large", "Las fotos superan el tamaño permitido.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ScannerError("invalid_upload", "Faltan las fotos.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SCANNER_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ScannerError("too_large", "Las fotos superan el tamaño permitido.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "content-type": type } }).formData(); }
  catch { throw new ScannerError("invalid_upload", "No se pudieron leer los archivos.", 400); }
  const platform = form.get("platform");
  const hint = form.get("hint");
  const model = scannerModel(form.get("model") ?? SCANNER_DEFAULT_MODEL);
  if (!model) throw new ScannerError("invalid_model", "Selecciona un modelo admitido.", 400);
  if (!scannerModelsForAccess(advancedModels).some((allowed) => allowed.id === model.id)) throw new ScannerError("model_forbidden", "Este modelo está reservado al administrador durante la evaluación.", 403);
  if (typeof platform !== "string" || !platformSlugs.includes(platform)) throw new ScannerError("invalid_platform", "Selecciona una plataforma válida.", 400);
  if (hint !== null && (typeof hint !== "string" || hint.length > SCANNER_MAX_HINT)) throw new ScannerError("invalid_hint", "El texto orientativo es demasiado largo.", 400);
  const photos = form.getAll("photos");
  if (!photos.length || photos.length > SCANNER_MAX_PHOTOS) throw new ScannerError("invalid_photo_count", "Selecciona entre una y seis fotos.", 400);
  const photoUrls: string[] = [];
  const hashes = new Set<string>();
  for (const photo of photos) {
    if (!(photo instanceof File) || photo.size > SCANNER_MAX_PHOTO_BYTES || photo.size === 0) throw new ScannerError("invalid_photo", "Una de las fotos no es válida o es demasiado grande.", 400);
    try {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const image = sharp(buffer, { limitInputPixels: 24_000_000, failOn: "error", sequentialRead: true });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1 || (meta.width ?? 0) < 256 || (meta.height ?? 0) < 256) throw new Error("Invalid format or dimensions");
      const normalized = await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      const hash = createHash("sha256").update(normalized).digest("hex");
      if (hashes.has(hash)) throw new ScannerError("duplicate_photo", "Hay fotos repetidas. Añade vistas diferentes del juego.", 400);
      hashes.add(hash);
      photoUrls.push(`data:image/jpeg;base64,${normalized.toString("base64")}`);
    } catch (error) {
      if (error instanceof ScannerError) throw error;
      throw new ScannerError("invalid_photo", "Usa fotos JPG, PNG o WebP de al menos 256 × 256 píxeles.", 400);
    }
  }
  return { platformSlug: platform, hint: typeof hint === "string" ? hint.trim() : "", photoUrls, model: model.id };
}
