import { normalizeAffiliateText, titleTokens } from "./affiliate/matching/normalize-title.ts";
import type { EbayResearchReport } from "./ebay/ebay-research.ts";
import type { CatalogGame, GameDetails } from "./types.ts";

const USER_AGENT = "RegionAtlasGames/1.0 (admin cover research)";
const REQUEST_TIMEOUT_MS = 9_000;
const MAX_HTML_BYTES = 2_000_000;

export type CoverCandidateSource =
  | "steam"
  | "playstation"
  | "nintendo"
  | "xbox"
  | "publisher"
  | "ebay_catalog"
  | "ebay_listing";

export type CoverAssetKind = "physical_cover" | "store_capsule" | "key_art" | "listing_photo";
export type CoverPersistence = "review_required" | "temporary_only";

export type CoverResearchCandidate = {
  id: string;
  source: CoverCandidateSource;
  sourceLabel: string;
  sourcePageUrl: string | null;
  imageUrl: string;
  title: string | null;
  assetKind: CoverAssetKind;
  persistence: CoverPersistence;
  confidence: number;
  platformMatch: "exact" | "related" | "unknown";
  regionMatch: "exact" | "compatible" | "unknown" | "other_variant";
  suggestedRegion: string | null;
  reasons: string[];
};

export type CoverResearchResult = {
  candidates: CoverResearchCandidate[];
  warnings: string[];
};

type OfficialSourceDefinition = {
  domain: string;
  source: Exclude<CoverCandidateSource, "steam" | "ebay_catalog" | "ebay_listing">;
  label: string;
};

const OFFICIAL_SOURCES: OfficialSourceDefinition[] = [
  { domain: "store.playstation.com", source: "playstation", label: "PlayStation Store" },
  { domain: "playstation.com", source: "playstation", label: "PlayStation oficial" },
  { domain: "store.nintendo.com", source: "nintendo", label: "Nintendo Store" },
  { domain: "nintendo.com", source: "nintendo", label: "Nintendo oficial" },
  { domain: "xbox.com", source: "xbox", label: "Xbox Store" },
  { domain: "microsoft.com", source: "xbox", label: "Microsoft Store" },
  { domain: "sega.com", source: "publisher", label: "SEGA oficial" },
  { domain: "snk-corp.co.jp", source: "publisher", label: "SNK oficial" },
  { domain: "bandainamcoent.eu", source: "publisher", label: "Bandai Namco oficial" },
  { domain: "bandainamcoent.com", source: "publisher", label: "Bandai Namco oficial" },
  { domain: "capcom-games.com", source: "publisher", label: "Capcom oficial" },
  { domain: "square-enix-games.com", source: "publisher", label: "Square Enix oficial" },
  { domain: "konami.com", source: "publisher", label: "Konami oficial" },
  { domain: "ubisoft.com", source: "publisher", label: "Ubisoft oficial" },
  { domain: "ea.com", source: "publisher", label: "EA oficial" },
  { domain: "2k.com", source: "publisher", label: "2K oficial" },
  { domain: "rockstargames.com", source: "publisher", label: "Rockstar Games oficial" },
  { domain: "atlus.com", source: "publisher", label: "Atlus oficial" },
  { domain: "505games.com", source: "publisher", label: "505 Games oficial" },
  { domain: "focus-entmt.com", source: "publisher", label: "Focus Entertainment oficial" },
  { domain: "devolverdigital.com", source: "publisher", label: "Devolver Digital oficial" },
  { domain: "team17.com", source: "publisher", label: "Team17 oficial" },
  { domain: "thqnordic.com", source: "publisher", label: "THQ Nordic oficial" },
  { domain: "microids.com", source: "publisher", label: "Microids oficial" },
];

const COMPANY_DOMAIN_HINTS: Record<string, string[]> = {
  sega: ["sega.com"],
  nintendo: ["nintendo.com"],
  snk: ["snk-corp.co.jp"],
  sony: ["playstation.com"],
  playstation: ["playstation.com"],
  "bandai namco": ["bandainamcoent.eu", "bandainamcoent.com"],
  capcom: ["capcom-games.com"],
  "square enix": ["square-enix-games.com"],
  konami: ["konami.com"],
  ubisoft: ["ubisoft.com"],
  "electronic arts": ["ea.com"],
  ea: ["ea.com"],
  "2k": ["2k.com"],
  rockstar: ["rockstargames.com"],
  atlus: ["atlus.com"],
  "505 games": ["505games.com"],
  "focus entertainment": ["focus-entmt.com"],
  devolver: ["devolverdigital.com"],
  team17: ["team17.com"],
  "thq nordic": ["thqnordic.com"],
  microids: ["microids.com"],
};

type SearchResult = { title: string; url: string; snippet: string };

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function officialSourceForUrl(value: string): OfficialSourceDefinition | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const hostname = new URL(safe).hostname.toLowerCase().replace(/^www\./, "");
  return OFFICIAL_SOURCES.find((source) => hostname === source.domain || hostname.endsWith(`.${source.domain}`)) ?? null;
}

export function isTrustedCoverSourceUrl(value: string): boolean {
  return Boolean(officialSourceForUrl(value));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attributes.set(match[1].toLowerCase(), decodeHtml(match[2].trim()));
    }
    if (attributes.get("property") === key || attributes.get("name") === key) {
      return attributes.get("content")?.trim() || null;
    }
  }
  return null;
}

function normalizedTitle(value: string): string {
  return normalizeAffiliateText(value)
    .replace(/\b(?:official|store|steam|nintendo|playstation|xbox)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCoverage(expected: string, candidate: string): number {
  const expectedTokens = titleTokens(normalizedTitle(expected));
  if (expectedTokens.length === 0) return 0;
  const candidateTokens = new Set(titleTokens(normalizedTitle(candidate)));
  return Math.round((expectedTokens.filter((token) => candidateTokens.has(token)).length / expectedTokens.length) * 100) / 100;
}

export function officialCoverTitleCoverage(expected: string, pageTitle: string): number {
  return titleCoverage(expected, pageTitle);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) throw new Error("page_too_large");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_HTML_BYTES) throw new Error("page_too_large");
  return new TextDecoder().decode(buffer);
}

function candidateId(source: CoverCandidateSource, imageUrl: string): string {
  let hash = 2166136261;
  for (const char of `${source}:${imageUrl}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${source}-${(hash >>> 0).toString(36)}`;
}

function sourcePlatformMatch(source: CoverCandidateSource, platformSlug: string): CoverResearchCandidate["platformMatch"] {
  if (source === "steam") return platformSlug === "pc" ? "exact" : "related";
  if (source === "playstation") return platformSlug.startsWith("ps") ? "exact" : "related";
  if (source === "nintendo") return ["nes", "snes", "n64", "gameboy", "gba", "gamecube", "wii", "wiiu", "ds", "3ds", "switch", "switch2"].includes(platformSlug) ? "exact" : "related";
  if (source === "xbox") return platformSlug.startsWith("xbox") ? "exact" : "related";
  return "unknown";
}

function steamAppIdFromSuggest(html: string, title: string): { appId: string; title: string } | null {
  const matches = html.matchAll(/<a\b[^>]*data-ds-appid="(\d+)"[^>]*>([\s\S]*?)<\/a>/g);
  let best: { appId: string; title: string; coverage: number } | null = null;
  for (const match of matches) {
    const foundTitle = stripHtml(match[2].match(/<div class="match_name">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const coverage = titleCoverage(title, foundTitle);
    if (!foundTitle || coverage < 0.75) continue;
    if (!best || coverage > best.coverage) best = { appId: match[1], title: foundTitle, coverage };
  }
  return best ? { appId: best.appId, title: best.title } : null;
}

async function discoverSteamCandidate(game: CatalogGame): Promise<CoverResearchCandidate | null> {
  const params = new URLSearchParams({ term: game.title, f: "games", cc: "ES", l: "spanish" });
  const suggestHtml = await fetchText(`https://store.steampowered.com/search/suggest?${params}`);
  const match = steamAppIdFromSuggest(suggestHtml, game.title);
  if (!match) return null;
  const sourcePageUrl = `https://store.steampowered.com/app/${match.appId}/?cc=ES&l=spanish`;
  const html = await fetchText(sourcePageUrl);
  const pageTitle = stripHtml(html.match(/<div id="appHubAppName"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "") || match.title;
  const coverage = titleCoverage(game.title, pageTitle);
  const imageUrl = safeHttpUrl(metaContent(html, "og:image"));
  if (!imageUrl || coverage < 0.75) return null;
  const platformMatch = sourcePlatformMatch("steam", game.platformSlug);
  return {
    id: candidateId("steam", imageUrl),
    source: "steam",
    sourceLabel: "Steam",
    sourcePageUrl,
    imageUrl,
    title: pageTitle,
    assetKind: "store_capsule",
    persistence: "review_required",
    confidence: Math.min(0.96, Math.round((coverage * 0.8 + (platformMatch === "exact" ? 0.16 : 0.04)) * 100) / 100),
    platformMatch,
    regionMatch: "unknown",
    suggestedRegion: null,
    reasons: [
      `título ${Math.round(coverage * 100)}%`,
      platformMatch === "exact" ? "misma plataforma" : "arte de una edición relacionada",
      "cápsula digital, no carátula física verificada",
    ],
  };
}

export function companyCoverDomains(companyNamesInput: Array<string | null | undefined>): string[] {
  const companyNames = companyNamesInput
    .filter((name): name is string => Boolean(name))
    .map(normalizeAffiliateText);
  const domains = new Set<string>();
  for (const companyName of companyNames) {
    for (const [hint, values] of Object.entries(COMPANY_DOMAIN_HINTS)) {
      const normalizedHint = normalizeAffiliateText(hint);
      const matched = normalizedHint.length <= 3
        ? companyName.split(" ").includes(normalizedHint)
        : companyName.includes(normalizedHint);
      if (matched) values.forEach((value) => domains.add(value));
    }
  }
  return [...domains];
}

function companyDomains(details: GameDetails | null): string[] {
  return companyCoverDomains([details?.developer?.name, details?.publisher?.name]);
}

function platformOfficialDomains(platformSlug: string): string[] {
  if (platformSlug.startsWith("ps")) return ["store.playstation.com", "playstation.com"];
  if (["nes", "snes", "n64", "gameboy", "gba", "gamecube", "wii", "wiiu", "ds", "3ds", "switch", "switch2"].includes(platformSlug)) {
    return ["nintendo.com", "store.nintendo.com"];
  }
  if (platformSlug.startsWith("xbox")) return ["xbox.com", "microsoft.com"];
  return [];
}

async function googleSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_SEARCH_API_KEY?.trim();
  const cx = process.env.GOOGLE_SEARCH_CX?.trim();
  if (!key || !cx) return [];
  const params = new URLSearchParams({ key, cx, q: query, num: "3", hl: "es", safe: "active" });
  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`google_search_${response.status}`);
  const data = await response.json() as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (data.items ?? [])
    .map((item) => ({ title: item.title ?? "", url: item.link ?? "", snippet: item.snippet ?? "" }))
    .filter((item) => item.title && item.url);
}

async function serpApiSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim();
  if (!key) return [];
  const params = new URLSearchParams({ engine: "google", api_key: key, q: query, google_domain: "google.es", gl: "es", hl: "es", num: "3" });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`serpapi_${response.status}`);
  const data = await response.json() as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (data.organic_results ?? [])
    .map((item) => ({ title: item.title ?? "", url: item.link ?? "", snippet: item.snippet ?? "" }))
    .filter((item) => item.title && item.url);
}

async function searchOfficial(query: string): Promise<SearchResult[]> {
  if (process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_CX?.trim()) return googleSearch(query);
  return serpApiSearch(query);
}

async function candidateFromOfficialPage(
  game: CatalogGame,
  result: SearchResult,
): Promise<CoverResearchCandidate | null> {
  const source = officialSourceForUrl(result.url);
  if (!source) return null;
  const html = await fetchText(result.url);
  const pageTitle = metaContent(html, "og:title") ?? result.title;
  const imageUrl = safeHttpUrl(metaContent(html, "og:image"));
  const coverage = officialCoverTitleCoverage(game.title, pageTitle);
  if (!imageUrl || coverage < 0.6) return null;
  const platformMatch = sourcePlatformMatch(source.source, game.platformSlug);
  const hostname = new URL(result.url).hostname.toLowerCase();
  const assetKind: CoverAssetKind = source.source === "publisher" || !hostname.startsWith("store.")
    ? "key_art"
    : "store_capsule";
  return {
    id: candidateId(source.source, imageUrl),
    source: source.source,
    sourceLabel: source.label,
    sourcePageUrl: safeHttpUrl(result.url),
    imageUrl,
    title: pageTitle,
    assetKind,
    persistence: "review_required",
    confidence: Math.min(0.95, Math.round((coverage * 0.78 + (platformMatch === "exact" ? 0.16 : 0.04)) * 100) / 100),
    platformMatch,
    regionMatch: "unknown",
    suggestedRegion: null,
    reasons: [
      `fuente oficial: ${source.label}`,
      `título ${Math.round(coverage * 100)}%`,
      platformMatch === "exact" ? "familia de plataforma compatible" : "plataforma o edición pendiente de confirmar",
    ],
  };
}

export function coverCandidatesFromEbay(report: EbayResearchReport): CoverResearchCandidate[] {
  const candidates: CoverResearchCandidate[] = [];
  for (const product of report.catalogCandidates) {
    for (const imageUrl of product.imageUrls.slice(0, 1)) {
      candidates.push({
        id: candidateId("ebay_catalog", imageUrl),
        source: "ebay_catalog",
        sourceLabel: "Catálogo eBay",
        sourcePageUrl: product.url,
        imageUrl,
        title: product.title,
        assetKind: "physical_cover",
        persistence: "temporary_only",
        confidence: product.confidence,
        platformMatch: "unknown",
        regionMatch: product.decision === "other_variant" ? "other_variant" : product.exactIdentifier ? "compatible" : "unknown",
        suggestedRegion: null,
        reasons: [...product.reasons, "imagen eBay solo para comparación; no se publica automáticamente"],
      });
    }
  }
  for (const listing of report.listings.filter((entry) => entry.decision !== "reject")) {
    for (const imageUrl of listing.imageUrls.slice(0, 1)) {
      candidates.push({
        id: candidateId("ebay_listing", imageUrl),
        source: "ebay_listing",
        sourceLabel: "Anuncio eBay",
        sourcePageUrl: listing.url,
        imageUrl,
        title: listing.title,
        assetKind: "listing_photo",
        persistence: "temporary_only",
        confidence: listing.confidence,
        platformMatch: listing.platformMatch === "exact" ? "exact" : "unknown",
        regionMatch: listing.decision === "other_variant" ? "other_variant" : listing.regionMatch === "exact" ? "exact" : "unknown",
        suggestedRegion: listing.suggestedRegion,
        reasons: [...listing.reasons, "foto temporal para reconocer edición y estado"],
      });
    }
  }
  return candidates.filter((candidate, index, all) => all.findIndex((entry) => entry.imageUrl === candidate.imageUrl) === index);
}

export async function researchCoverCandidates(
  game: CatalogGame,
  details: GameDetails | null,
  ebayReport: EbayResearchReport,
): Promise<CoverResearchResult> {
  const warnings: string[] = [];
  const candidates = coverCandidatesFromEbay(ebayReport);

  try {
    const steam = await discoverSteamCandidate(game);
    if (steam) candidates.push(steam);
  } catch (error) {
    warnings.push(`Steam: ${error instanceof Error ? error.message : "request_failed"}`);
  }

  const domains = [...new Set([...platformOfficialDomains(game.platformSlug), ...companyDomains(details)])].slice(0, 4);
  const searchConfigured = Boolean(
    (process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_CX?.trim()) ||
    process.env.SERPAPI_KEY?.trim() ||
    process.env.SERPAPI_API_KEY?.trim(),
  );
  if (!searchConfigured) {
    warnings.push("Búsqueda de tiendas/editoras no configurada; Steam y eBay sí se han podido consultar.");
  } else {
    const searches = await Promise.all(domains.map(async (domain) => {
      try {
        return { domain, results: await searchOfficial(`\"${game.title}\" ${game.region} site:${domain}`), error: null as unknown };
      } catch (error) {
        return { domain, results: [] as SearchResult[], error };
      }
    }));
    const pageResults = await Promise.all(
      searches.flatMap(({ domain, results, error }) => {
        if (error) warnings.push(`${domain}: ${error instanceof Error ? error.message : "search_failed"}`);
        return results.slice(0, 2).map(async (result) => {
          try {
            return { domain, candidate: await candidateFromOfficialPage(game, result), error: null as unknown };
          } catch (pageError) {
            return { domain, candidate: null, error: pageError };
          }
        });
      }),
    );
    for (const result of pageResults) {
      if (result.candidate) candidates.push(result.candidate);
      if (result.error) {
        warnings.push(`${result.domain}: ${result.error instanceof Error ? result.error.message : "page_failed"}`);
      }
    }
  }

  const deduped = candidates
    .filter((candidate, index, all) => all.findIndex((entry) => entry.imageUrl === candidate.imageUrl) === index)
    .sort((a, b) => {
      const persistence = { review_required: 2, temporary_only: 1 };
      return persistence[b.persistence] - persistence[a.persistence] || b.confidence - a.confidence;
    })
    .slice(0, 24);
  return { candidates: deduped, warnings: [...new Set(warnings)] };
}
