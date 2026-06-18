import { readFileSync } from "fs";
import path from "path";
import type { NewsItem, NewsSection } from "./types";

const NEWS_CACHE_FILE = path.join(process.cwd(), "data", "news-cache.json");

type NewsCacheFile = {
  updatedAt?: string;
  items?: NewsItem[];
};

function readNewsCache(): NewsCacheFile {
  try {
    return JSON.parse(readFileSync(NEWS_CACHE_FILE, "utf8")) as NewsCacheFile;
  } catch {
    return { items: [] };
  }
}

export function listNewsForSection(input: {
  section: NewsSection;
  topic?: string;
  limit?: number;
}): NewsItem[] {
  const limit = Math.max(1, Math.min(input.limit ?? 3, 12));
  const now = Date.now();
  const maxAgeMs = 1000 * 60 * 60 * 24 * 14;

  return (readNewsCache().items ?? [])
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
