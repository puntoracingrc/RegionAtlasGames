import { execFile } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { slugify } from "./slug";

const execFileAsync = promisify(execFile);

export function buildCoverCatalogPath(platformSlug: string, slug: string): string {
  return `/covers/${platformSlug}/${slug}.jpg`;
}

export function coversFtpConfigured(): boolean {
  return Boolean(
    process.env.COVERS_FTP_HOST?.trim() &&
      process.env.COVERS_FTP_USER?.trim() &&
      process.env.COVERS_FTP_PASSWORD?.trim(),
  );
}

export async function uploadCoverToCdn(input: {
  platformSlug: string;
  slug: string;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<{ ok: true; coverUrl: string } | { error: string }> {
  if (!coversFtpConfigured()) {
    return { error: "FTP de portadas no configurado (COVERS_FTP_* en env)." };
  }

  const slug = slugify(input.slug);
  const platformSlug = input.platformSlug.trim();
  if (!slug || !platformSlug) {
    return { error: "Plataforma o slug inválidos." };
  }

  const tmpDir = path.join(process.cwd(), "data", "admin", "cover-uploads");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${platformSlug}-${slug}-${Date.now()}.jpg`);

  try {
    await sharp(input.fileBuffer)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(tmpFile);

    const script = path.join(process.cwd(), "scripts", "upload_single_cover_ftp.py");
    await execFileAsync("python3", [script, "--platform", platformSlug, "--slug", slug, "--file", tmpFile], {
      timeout: 120_000,
      env: process.env,
    });

    return { ok: true, coverUrl: buildCoverCatalogPath(platformSlug, slug) };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
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
