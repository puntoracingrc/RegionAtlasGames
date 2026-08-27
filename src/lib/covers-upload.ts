import { execFile } from "child_process";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { safeRemoteFetch } from "./remote-fetch";
import { COVERS_PUBLIC_BASE_URL } from "./site-brand";
import { slugify } from "./slug";

const execFileAsync = promisify(execFile);
export const MAX_COVER_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_SAGA_BACKGROUND_UPLOAD_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_INPUT_PIXELS = 50_000_000;
const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

type SftpClient = {
  connect(config: Record<string, unknown>): Promise<void>;
  mkdir(remotePath: string, recursive?: boolean): Promise<void>;
  put(localPath: string, remotePath: string): Promise<void>;
  end(): Promise<void>;
};

export function buildCoverCatalogPath(platformSlug: string, slug: string): string {
  return `/covers/${platformSlug}/${slug}.jpg`;
}

export function buildCoverFileSlug(input: { slug: string; catalogId?: string | null }): string {
  return slugify(input.catalogId?.trim() || input.slug);
}

export function coversFtpConfigured(): boolean {
  return Boolean(
    process.env.COVERS_FTP_HOST?.trim() &&
      process.env.COVERS_FTP_USER?.trim() &&
      process.env.COVERS_FTP_PASSWORD?.trim(),
  );
}

export function isRemoteCoverUrl(coverUrl: string | null | undefined): boolean {
  return /^https?:\/\//i.test(coverUrl?.trim() ?? "");
}

export function isCoverPathUrl(coverUrl: string | null | undefined): boolean {
  return coverUrl?.trim().startsWith("/covers/") ?? false;
}

function coverSourceToDownloadUrl(coverUrl: string): string | null {
  const trimmed = coverUrl.trim();
  if (isRemoteCoverUrl(trimmed)) return trimmed;
  if (!isCoverPathUrl(trimmed)) return null;
  return `${COVERS_PUBLIC_BASE_URL}/${trimmed.slice("/covers/".length)}`;
}

function coverUploadConfig() {
  const portRaw = process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (port === 22 ? "sftp" : "ftp");
  return {
    host: process.env.COVERS_FTP_HOST?.trim() ?? "",
    user: process.env.COVERS_FTP_USER?.trim() ?? "",
    password: process.env.COVERS_FTP_PASSWORD?.trim() ?? "",
    port,
    protocol,
    remoteRoot: (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers").replace(/^\/+|\/+$/g, ""),
  };
}

function sagaBackgroundRemoteRoot(remoteRoot: string): string {
  return remoteRoot.replace(/\/covers$/i, "/saga-backgrounds");
}

function sagaBackgroundPublicBaseUrl(): string {
  return COVERS_PUBLIC_BASE_URL.replace(/\/covers\/?$/i, "/saga-backgrounds");
}

function buildSagaBackgroundPublicUrl(slug: string): string {
  return `${sagaBackgroundPublicBaseUrl()}/${slug}.webp`;
}

export function validateImageUploadEnvelope(
  file: Pick<File, "size" | "type">,
  maxBytes: number,
): string | null {
  if (file.size < 512) return "La imagen es demasiado pequeña o está vacía.";
  if (file.size > maxBytes) {
    return `La imagen supera el límite de ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  if (file.type && !file.type.startsWith("image/")) {
    return "El archivo debe ser una imagen.";
  }
  return null;
}

async function validateImageBuffer(
  buffer: Buffer,
  maxBytes: number,
  mimeType?: string,
): Promise<string | null> {
  if (buffer.length < 512) return "La imagen es demasiado pequeña o está vacía.";
  if (buffer.length > maxBytes) {
    return `La imagen supera el límite de ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  if (mimeType && !mimeType.toLowerCase().startsWith("image/")) {
    return "El recurso recibido no es una imagen.";
  }

  try {
    const metadata = await sharp(buffer, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      sequentialRead: true,
      failOn: "error",
    }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
      return "Formato de imagen no permitido.";
    }
    if ((metadata.pages ?? 1) > 1 || width * height > MAX_IMAGE_INPUT_PIXELS) {
      return "La imagen tiene demasiados píxeles para procesarla.";
    }
    if (width === 0 || height === 0) return "No se pudo leer el tamaño de la imagen.";
    return null;
  } catch {
    return "Archivo de imagen no válido o demasiado grande.";
  }
}

async function uploadSftp(localFile: string, remoteRel: string, remoteRoot?: string) {
  const cfg = coverUploadConfig();
  const mod = (await import("ssh2-sftp-client")) as unknown as { default: new () => SftpClient };
  const client = new mod.default();
  const root = remoteRoot ?? cfg.remoteRoot;
  const remoteDir = path.posix.join(root, path.posix.dirname(remoteRel));
  const remotePath = path.posix.join(root, remoteRel);
  try {
    await client.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.user,
      password: cfg.password,
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(remoteDir, true);
    await client.put(localFile, remotePath);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function uploadSagaBackgroundToCdn(input: {
  slug: string;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<{ ok: true; backgroundImageUrl: string } | { error: string }> {
  if (!coversFtpConfigured()) {
    return { error: "FTP de imágenes no configurado (COVERS_FTP_* en env)." };
  }

  const slug = slugify(input.slug);
  if (!slug) return { error: "Slug de saga inválido." };
  const validationError = await validateImageBuffer(
    input.fileBuffer,
    MAX_SAGA_BACKGROUND_UPLOAD_BYTES,
    input.mimeType,
  );
  if (validationError) return { error: validationError };

  const cfg = coverUploadConfig();
  if (cfg.protocol !== "sftp") {
    return { error: "La subida de fondos de saga requiere SFTP en este momento." };
  }

  const tmpDir = path.join(os.tmpdir(), "region-atlas-saga-backgrounds");
  const tmpFile = path.join(tmpDir, `${slug}-${Date.now()}.webp`);

  try {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    await sharp(input.fileBuffer, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      sequentialRead: true,
      failOn: "error",
    })
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(tmpFile);

    await uploadSftp(tmpFile, `${slug}.webp`, sagaBackgroundRemoteRoot(cfg.remoteRoot));
    return { ok: true, backgroundImageUrl: buildSagaBackgroundPublicUrl(slug) };
  } catch (error) {
    const err = error as Error & { stderr?: string; stdout?: string; code?: number | string };
    const detail = [err.stderr, err.stdout, err.message].find((value) => value?.trim())?.trim();
    const message = detail
      ? `No se pudo subir el fondo de saga al CDN: ${detail.slice(0, 700)}`
      : "No se pudo subir el fondo de saga al CDN.";
    return { error: message };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

export async function downloadAndUploadSagaBackgroundToCdn(input: {
  slug: string;
  sourceUrl: string;
}): Promise<{ ok: true; backgroundImageUrl: string } | { error: string }> {
  const sourceUrl = input.sourceUrl.trim();
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { error: "URL de imagen inválida." };
  }

  if (!coversFtpConfigured()) {
    return { error: "FTP de imágenes no configurado (COVERS_FTP_* en env)." };
  }

  try {
    const response = await safeRemoteFetch(sourceUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "RegionAtlasGames/1.0 (+https://www.regionatlas.games)",
      },
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      return { error: `No se pudo descargar la imagen remota (${response.status}).` };
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_SAGA_BACKGROUND_UPLOAD_BYTES) {
      return { error: "La imagen remota es demasiado grande para importarla." };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SAGA_BACKGROUND_UPLOAD_BYTES) {
      return { error: "La imagen remota es demasiado grande para importarla." };
    }
    if (arrayBuffer.byteLength < 512) {
      return { error: "La imagen remota descargada no parece una imagen válida." };
    }

    return await uploadSagaBackgroundToCdn({
      slug: input.slug,
      fileBuffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get("content-type") ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { error: `No se pudo importar la imagen remota: ${message.slice(0, 500)}` };
  }
}

export async function uploadCoverToCdn(input: {
  platformSlug: string;
  slug: string;
  catalogId?: string | null;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<{ ok: true; coverUrl: string } | { error: string }> {
  if (!coversFtpConfigured()) {
    return { error: "FTP de portadas no configurado (COVERS_FTP_* en env)." };
  }

  const slug = buildCoverFileSlug(input);
  const platformSlug = input.platformSlug.trim();
  if (!slug || !platformSlug) {
    return { error: "Plataforma o slug inválidos." };
  }
  const validationError = await validateImageBuffer(
    input.fileBuffer,
    MAX_COVER_UPLOAD_BYTES,
    input.mimeType,
  );
  if (validationError) return { error: validationError };

  const tmpDir = path.join(os.tmpdir(), "region-atlas-cover-uploads");
  const tmpFile = path.join(tmpDir, `${platformSlug}-${slug}-${Date.now()}.jpg`);

  try {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    await sharp(input.fileBuffer, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      sequentialRead: true,
      failOn: "error",
    })
      .rotate()
      .resize({ width: 1600, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(tmpFile);

    const remoteRel = `${platformSlug}/${slug}.jpg`;
    const cfg = coverUploadConfig();
    if (cfg.protocol === "sftp") {
      await uploadSftp(tmpFile, remoteRel);
    } else {
      const script = path.join(process.cwd(), "scripts", "upload_single_cover_ftp.py");
      const { stderr } = await execFileAsync("python3", [script, "--platform", platformSlug, "--slug", slug, "--file", tmpFile], {
        timeout: 120_000,
        env: process.env,
      });
      if (stderr?.trim()) {
        console.warn(`cover upload stderr: ${stderr.trim()}`);
      }
    }

    return { ok: true, coverUrl: buildCoverCatalogPath(platformSlug, slug) };
  } catch (error) {
    const err = error as Error & { stderr?: string; stdout?: string; code?: number | string };
    const detail = [err.stderr, err.stdout, err.message].find((value) => value?.trim())?.trim();
    const message = detail
      ? `No se pudo subir la portada al CDN: ${detail.slice(0, 700)}`
      : "No se pudo subir la portada al CDN.";
    return { error: message };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

export async function downloadAndUploadCoverToCdn(input: {
  platformSlug: string;
  slug: string;
  catalogId?: string | null;
  sourceUrl: string;
}): Promise<{ ok: true; coverUrl: string } | { error: string }> {
  const sourceUrl = input.sourceUrl.trim();
  const downloadUrl = coverSourceToDownloadUrl(sourceUrl);
  if (!downloadUrl) {
    return { error: "URL de portada inválida." };
  }

  if (!coversFtpConfigured()) {
    return { error: "FTP de portadas no configurado (COVERS_FTP_* en env)." };
  }

  try {
    const response = await safeRemoteFetch(downloadUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "RegionAtlasGames/1.0 (+https://www.regionatlas.games)",
      },
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      return { error: `No se pudo descargar la portada remota (${response.status}).` };
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_COVER_UPLOAD_BYTES) {
      return { error: "La portada remota es demasiado grande para importarla." };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_COVER_UPLOAD_BYTES) {
      return { error: "La portada remota es demasiado grande para importarla." };
    }
    if (arrayBuffer.byteLength < 512) {
      return { error: "La portada remota descargada no parece una imagen válida." };
    }

    return await uploadCoverToCdn({
      platformSlug: input.platformSlug,
      slug: input.slug,
      catalogId: input.catalogId,
      fileBuffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get("content-type") ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { error: `No se pudo importar la portada remota: ${message.slice(0, 500)}` };
  }
}
