import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import type { NewsItem, NewsSection } from "./types";

const NEWS_CACHE_FILE = path.join(process.cwd(), "data", "news-cache.json");
const NEWS_CACHE_BLOB_PATH = "region-atlas/news-cache.json";

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

async function readNewsCacheFromBlob(): Promise<NewsCacheFile | null> {
  if (!blobAuthConfigured()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(NEWS_CACHE_BLOB_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    return normalizeNewsCache(JSON.parse(await new Response(result.stream).text()) as NewsCacheFile);
  } catch {
    return null;
  }
}

export async function readNewsCache(): Promise<NewsCacheFile> {
  return (await readNewsCacheFromBlob()) ?? readNewsCacheFromDisk();
}

export async function writeNewsCache(cache: NewsCacheFile): Promise<void> {
  const normalized = normalizeNewsCache(cache);
  if (blobAuthConfigured()) {
    const auth = await blobAuthOptions("private");
    await put(NEWS_CACHE_BLOB_PATH, JSON.stringify(normalized, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  }

  if (canWriteCatalogFiles() || !process.env.VERCEL) {
    const dir = path.dirname(NEWS_CACHE_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(NEWS_CACHE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  }
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
