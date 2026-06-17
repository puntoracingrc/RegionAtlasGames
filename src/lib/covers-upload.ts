import { execFile } from "child_process";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { COVERS_PUBLIC_BASE_URL } from "./site-brand";
import { slugify } from "./slug";

const execFileAsync = promisify(execFile);
const MAX_REMOTE_COVER_BYTES = 12 * 1024 * 1024;

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

async function uploadSftp(localFile: string, remoteRel: string) {
  const cfg = coverUploadConfig();
  const mod = (await import("ssh2-sftp-client")) as unknown as { default: new () => SftpClient };
  const client = new mod.default();
  const remoteDir = path.posix.join(cfg.remoteRoot, path.posix.dirname(remoteRel));
  const remotePath = path.posix.join(cfg.remoteRoot, remoteRel);
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

  const tmpDir = path.join(os.tmpdir(), "region-atlas-cover-uploads");
  const tmpFile = path.join(tmpDir, `${platformSlug}-${slug}-${Date.now()}.jpg`);

  try {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    await sharp(input.fileBuffer)
      .rotate()
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
    const response = await fetch(downloadUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "RegionAtlasGames/1.0 (+https://www.regionatlas.games)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      return { error: `No se pudo descargar la portada remota (${response.status}).` };
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_REMOTE_COVER_BYTES) {
      return { error: "La portada remota es demasiado grande para importarla." };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_REMOTE_COVER_BYTES) {
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
