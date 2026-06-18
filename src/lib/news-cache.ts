import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { canWriteCatalogFiles } from "./admin-auth";
import type { NewsItem, NewsSection } from "./types";

const NEWS_CACHE_FILE = path.join(process.cwd(), "data", "news-cache.json");
const NEWS_REMOTE_REVALIDATE_SECONDS = 15 * 60;

type NewsCacheFile = {
  updatedAt?: string;
  items?: NewsItem[];
};

function normalizeNewsCache(cache: NewsCacheFile): NewsCacheFile {
  return {
    updatedAt: cache.updatedAt,
    items: Array.isArray(cache.items) ? cache.items : [],
  };
}

function readNewsCacheFromDisk(): NewsCacheFile {
  try {
    return normalizeNewsCache(JSON.parse(readFileSync(NEWS_CACHE_FILE, "utf8")) as NewsCacheFile);
  } catch {
    return { items: [] };
  }
}

function remoteNewsCacheUrl(): string | null {
  const explicit = process.env.NEWS_CACHE_REMOTE_URL?.trim();
  if (explicit) return explicit;
  const coversBase = process.env.NEXT_PUBLIC_COVERS_BASE_URL?.trim();
  if (!coversBase) return null;
  const newsBase = coversBase.replace(/\/covers\/?$/i, "/news").replace(/\/+$/g, "");
  return `${newsBase}/news-cache.json`;
}

function newsFtpConfigured(): boolean {
  return Boolean(
    process.env.COVERS_FTP_HOST?.trim() &&
      process.env.COVERS_FTP_USER?.trim() &&
      process.env.COVERS_FTP_PASSWORD?.trim(),
  );
}

function newsRemoteRoot(): string {
  const explicit = process.env.NEWS_FTP_REMOTE_ROOT?.trim();
  if (explicit) return explicit.replace(/^\/+|\/+$/g, "");
  const coversRoot = (process.env.COVERS_FTP_REMOTE_ROOT?.trim() || "MEDIAPUNTORACINGWEB/MEDIAREGIONATLAS/covers")
    .replace(/^\/+|\/+$/g, "");
  if (/\/covers$/i.test(coversRoot)) return coversRoot.replace(/\/covers$/i, "/news");
  return `${coversRoot}/news`;
}

async function uploadNewsCacheToSftp(cache: NewsCacheFile): Promise<void> {
  if (!newsFtpConfigured()) return;
  const portRaw = process.env.COVERS_FTP_PORT?.trim();
  const port = portRaw && Number.isFinite(Number(portRaw)) ? Number(portRaw) : 22;
  const protocol = process.env.COVERS_FTP_PROTOCOL?.trim().toLowerCase() || (port === 22 ? "sftp" : "ftp");
  if (protocol !== "sftp") {
    throw new Error("La subida remota de noticias solo soporta SFTP por ahora.");
  }

  const mod = (await import("ssh2-sftp-client")) as unknown as { default: new () => {
    connect(config: Record<string, unknown>): Promise<void>;
    mkdir(remotePath: string, recursive?: boolean): Promise<void>;
    put(input: Buffer | string, remotePath: string): Promise<void>;
    end(): Promise<void>;
  } };
  const client = new mod.default();
  const remoteRoot = newsRemoteRoot();
  const remotePath = path.posix.join(remoteRoot, "news-cache.json");
  try {
    await client.connect({
      host: process.env.COVERS_FTP_HOST?.trim(),
      port,
      username: process.env.COVERS_FTP_USER?.trim(),
      password: process.env.COVERS_FTP_PASSWORD?.trim(),
      readyTimeout: 60_000,
      retries: 1,
    });
    await client.mkdir(remoteRoot, true);
    await client.put(Buffer.from(`${JSON.stringify(cache, null, 2)}\n`, "utf8"), remotePath);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readNewsCacheFromRemote(): Promise<NewsCacheFile | null> {
  const url = remoteNewsCacheUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, {
      next: { revalidate: NEWS_REMOTE_REVALIDATE_SECONDS },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return normalizeNewsCache((await response.json()) as NewsCacheFile);
  } catch {
    return null;
  }
}

export async function readNewsCache(): Promise<NewsCacheFile> {
  return (await readNewsCacheFromRemote()) ?? readNewsCacheFromDisk();
}

export async function writeNewsCache(cache: NewsCacheFile): Promise<void> {
  const normalized = normalizeNewsCache(cache);
  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    const dir = path.dirname(NEWS_CACHE_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(NEWS_CACHE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  }
  await uploadNewsCacheToSftp(normalized);
}

export async function listNewsForSection(input: {
  section: NewsSection;
  topic?: string;
  limit?: number;
}): Promise<NewsItem[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 3, 12));
  const now = Date.now();
  const maxAgeMs = 1000 * 60 * 60 * 24 * 14;

  return ((await readNewsCache()).items ?? [])
    .filter((item) => item.section === input.section)
    .filter((item) => !input.topic || item.topic === input.topic)
    .filter((item) => {
      if (!item.publishedAt) return true;
      const publishedTime = Date.parse(item.publishedAt);
      return Number.isNaN(publishedTime) || now - publishedTime <= maxAgeMs;
    })
    .sort((a, b) => {
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      return bTime - aTime || b.fetchedAt.localeCompare(a.fetchedAt);
    })
    .slice(0, limit);
}
