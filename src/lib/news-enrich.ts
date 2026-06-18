import crypto from "crypto";
import { listAdminPlatforms } from "./admin-entity-catalog";
import { readNewsCache, writeNewsCache } from "./news-cache";
import type { NewsItem, NewsSection } from "./types";

type SerpApiNewsResult = {
  title?: string;
  link?: string;
  source?: {
    name?: string;
    icon?: string;
  };
  thumbnail?: string;
  thumbnail_small?: string;
  iso_date?: string;
  snippet?: string;
};

type RefreshNewsSectionInput = {
  section: NewsSection;
  topic: string;
  query: string;
  limit?: number;
  maxAgeDays?: number;
  dryRun?: boolean;
  noCache?: boolean;
};

export type NewsRefreshResult = {
  section: NewsSection;
  topic: string;
  query: string;
  fetched: number;
  saved: number;
  items: NewsItem[];
};

const DEFAULT_KEYWORDS = [
  "videojuego",
  "videojuegos",
  "juego",
  "juegos",
  "playstation",
  "ps4",
  "ps5",
  "nintendo",
  "switch",
  "xbox",
  "steam",
  "pc",
  "consola",
  "consolas",
  "game",
  "games",
  "indie",
  "trailer",
  "lanzamiento",
  "e3",
  "direct",
];

const STRONG_KEYWORDS = [
  "videojuego",
  "videojuegos",
  "playstation",
  "ps4",
  "ps5",
  "nintendo",
  "switch",
  "xbox",
  "steam",
  "consola",
  "consolas",
  "gta",
  "rockstar",
  "game pass",
  "eshop",
];

const BANNED_NEWS_TERMS = [
  "juegos universitarios",
  "juegos olimpicos",
  "juegos olímpicos",
  "juegos de azar",
  "casino",
  "casinos",
  "mundial",
  "futbol",
  "fútbol",
  "phishing",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isRelevantNews(result: SerpApiNewsResult): boolean {
  const text = normalizeText(`${result.title ?? ""} ${result.snippet ?? ""} ${result.source?.name ?? ""}`);
  if (BANNED_NEWS_TERMS.some((term) => text.includes(normalizeText(term)))) return false;
  if (STRONG_KEYWORDS.some((keyword) => text.includes(keyword))) return true;
  return DEFAULT_KEYWORDS.filter((keyword) => text.includes(keyword)).length >= 2;
}

function isFreshNews(result: SerpApiNewsResult, maxAgeDays: number): boolean {
  if (!result.iso_date) return true;
  const publishedTime = Date.parse(result.iso_date);
  if (Number.isNaN(publishedTime)) return true;
  return Date.now() - publishedTime <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function stableNewsId(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function toNewsItem(result: SerpApiNewsResult, input: RefreshNewsSectionInput, fetchedAt: string): NewsItem | null {
  if (!result.title || !result.link) return null;
  return {
    id: stableNewsId(result.link),
    section: input.section,
    topic: input.topic,
    title: result.title,
    sourceName: result.source?.name ?? "Fuente",
    sourceIconUrl: result.source?.icon ?? null,
    url: result.link,
    imageUrl: result.thumbnail ?? result.thumbnail_small ?? null,
    publishedAt: result.iso_date ?? null,
    snippet: result.snippet ?? null,
    query: input.query,
    fetchedAt,
  };
}

async function fetchGoogleNews(input: RefreshNewsSectionInput): Promise<SerpApiNewsResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim();
  if (!apiKey) throw new Error("Falta SERPAPI_API_KEY en Vercel/entorno.");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_news");
  url.searchParams.set("q", input.query);
  url.searchParams.set("hl", "es");
  url.searchParams.set("gl", "es");
  url.searchParams.set("api_key", apiKey);
  if (input.noCache) url.searchParams.set("no_cache", "true");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`SerpAPI Google News respondió ${response.status}`);
  const payload = (await response.json()) as { error?: string; news_results?: SerpApiNewsResult[] };
  if (payload.error) throw new Error(payload.error);
  return payload.news_results ?? [];
}

export async function refreshNewsSection(input: RefreshNewsSectionInput): Promise<NewsRefreshResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 9, 20));
  const maxAgeDays = Math.max(1, Math.min(input.maxAgeDays ?? 3, 14));
  const fetchedAt = new Date().toISOString();
  const results = await fetchGoogleNews(input);
  const items: NewsItem[] = [];
  const seenUrls = new Set<string>();

  for (const result of results) {
    if (!result.title || !result.link) continue;
    if (seenUrls.has(result.link)) continue;
    seenUrls.add(result.link);
    if (!isFreshNews(result, maxAgeDays)) continue;
    if (!isRelevantNews(result)) continue;
    const item = toNewsItem(result, input, fetchedAt);
    if (!item) continue;
    items.push(item);
    if (items.length >= limit) break;
  }

  if (!input.dryRun) {
    const cache = await readNewsCache();
    const previous = cache.items ?? [];
    const nextItems = [
      ...items,
      ...previous.filter((item) => item.section !== input.section || item.topic !== input.topic),
    ];
    await writeNewsCache({
      updatedAt: fetchedAt,
      items: nextItems,
    });
  }

  return {
    section: input.section,
    topic: input.topic,
    query: input.query,
    fetched: results.length,
    saved: items.length,
    items,
  };
}

export function buildHomeNewsQuery(): string {
  return "videojuegos España when:1d";
}

export function buildPlatformNewsQuery(platform: { slug: string; shortName: string; name: string }): string {
  return `videojuegos ${platform.shortName} ${platform.slug} España when:1d`;
}

export async function refreshEnabledNewsSections(input?: {
  dryRun?: boolean;
  platformLimit?: number;
  includePlatforms?: boolean;
}): Promise<NewsRefreshResult[]> {
  const results: NewsRefreshResult[] = [];
  results.push(
    await refreshNewsSection({
      section: "home",
      topic: "general",
      query: buildHomeNewsQuery(),
      dryRun: input?.dryRun,
    }),
  );

  if (input?.includePlatforms !== false) {
    const platforms = (await listAdminPlatforms())
      .filter((platform) => platform.active !== false && platform.newsEnabled === true)
      .slice(0, Math.max(0, input?.platformLimit ?? 6));
    for (const platform of platforms) {
      results.push(
        await refreshNewsSection({
          section: "platform",
          topic: platform.slug,
          query: buildPlatformNewsQuery(platform),
          dryRun: input?.dryRun,
        }),
      );
    }
  }

  return results;
}
