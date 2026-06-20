import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { buildEbayGameCustomId } from "./ebay/ebay-enduserctx";
import { getPlatform } from "./catalog";
import { readCatalogOverlayGame } from "./catalog-runtime-overlay";
import { getRegionDisplay } from "./region-display";
import type { CatalogGame, GameDetails } from "./types";

export type AffiliateProvider = "ebay" | "amazon" | "rakuten" | "mock" | "manual";

export type AffiliateOffer = {
  provider: AffiliateProvider;
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  shippingPrice: number | null;
  condition: string | null;
  location: string | null;
  confidence: number;
};

export type AffiliateFallbackCta = {
  provider: Extract<AffiliateProvider, "ebay">;
  id: string;
  label: string;
  url: string;
};

export type AffiliateOfferBlock = {
  enabled: boolean;
  offers: AffiliateOffer[];
  fallbackCta: AffiliateFallbackCta | null;
  checkedAt: string | null;
  trackingId: string | null;
};

type EbaySearchItem = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  image?: { imageUrl?: string };
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string; currency?: string } }>;
  condition?: string;
  itemLocation?: { country?: string; postalCode?: string };
};

type EbaySearchResponse = {
  itemSummaries?: EbaySearchItem[];
};

type EbayTokenCache = {
  token: string;
  expiresAt: number;
};

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const DEFAULT_CACHE_SECONDS = 60 * 60 * 6;
const EBAY_TOKEN_CACHE_KEY = "__regionAtlasEbayTokenCache";
const AFFILIATE_WHITELIST_FILE = path.join(process.cwd(), "data", "affiliate-offers-whitelist.json");

declare global {
  var __regionAtlasEbayTokenCache: EbayTokenCache | undefined;
}

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function affiliateEnabled(): boolean {
  return process.env.AFFILIATE_OFFERS_ENABLED === "1" || process.env.AFFILIATE_OFFERS_ENABLED === "true";
}

function affiliateProductionWhitelistEnabled(): boolean {
  return process.env.AFFILIATE_OFFERS_PRODUCTION_WHITELIST === "true";
}

function readAffiliateWhitelistGameIds(): string[] {
  try {
    if (!existsSync(AFFILIATE_WHITELIST_FILE)) return [];
    const parsed = JSON.parse(readFileSync(AFFILIATE_WHITELIST_FILE, "utf8")) as { gameIds?: string[] };
    return (parsed.gameIds ?? []).map((value) => String(value).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function affiliateGameWhitelisted(game: CatalogGame): Promise<boolean> {
  if (!affiliateProductionWhitelistEnabled()) return true;
  const gameIds = new Set(readAffiliateWhitelistGameIds());
  if (gameIds.has(game.id)) return true;
  return Boolean(await readCatalogOverlayGame(game.id));
}

export function addAffiliateOfferWhitelistGame(catalogId: string): { ok: true; added: boolean } | { error: string } {
  const gameId = catalogId.trim();
  if (!gameId) return { error: "Falta catalogId." };
  try {
    const gameIds = readAffiliateWhitelistGameIds();
    if (gameIds.includes(gameId)) return { ok: true, added: false };
    const next = { gameIds: [...gameIds, gameId].sort((a, b) => a.localeCompare(b, "es")) };
    const dir = path.dirname(AFFILIATE_WHITELIST_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(AFFILIATE_WHITELIST_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return { ok: true, added: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar whitelist de afiliados." };
  }
}

function ebayConfigured(): boolean {
  return Boolean(configured(process.env.EBAY_CLIENT_ID) && configured(process.env.EBAY_CLIENT_SECRET));
}

function amazonConfigured(): boolean {
  return Boolean(
    configured(process.env.AMAZON_ASSOCIATE_TAG) &&
      configured(process.env.AMAZON_ACCESS_KEY) &&
      configured(process.env.AMAZON_SECRET_KEY),
  );
}

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(text: string): string[] {
  const stop = new Set(["the", "a", "an", "ps", "ps5", "ps4", "pal", "espana", "europa"]);
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 2 && !stop.has(token));
}

function scoreOffer(game: CatalogGame, details: GameDetails | null, title: string): number {
  const normalizedTitle = normalize(title);
  const platform = getPlatform(game.platformSlug);
  const platformHints = [
    game.platformSlug,
    platform?.shortName,
    platform?.name,
    game.platformSlug === "ps5" ? "playstation 5" : null,
    game.platformSlug === "ps4" ? "playstation 4" : null,
  ]
    .filter(Boolean)
    .map((value) => normalize(String(value)));

  let score = 0;
  const tokens = titleTokens(game.title);
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token)).length;
  if (tokens.length > 0) score += matchedTokens / tokens.length;
  if (platformHints.some((hint) => hint && normalizedTitle.includes(hint))) score += 0.35;
  if (details?.ean && normalizedTitle.includes(details.ean)) score += 0.5;
  if (normalize(game.region).includes("pal") && /\bpal\b|\beu\b|\beurope\b|\bes\b|\bspain\b/.test(normalizedTitle)) {
    score += 0.15;
  }
  if (/\bmanual\b|\bcover only\b|\bempty box\b|\bcaratula\b/.test(normalizedTitle)) score -= 0.45;
  return Math.max(0, Math.min(1, score));
}

function ebayMarketplace(): string {
  return configured(process.env.EBAY_MARKETPLACE_ID) ?? "EBAY_ES";
}

function ebayLimit(): number {
  const limit = Number.parseInt(process.env.EBAY_AFFILIATE_LIMIT ?? "6", 10);
  return Number.isFinite(limit) ? Math.max(1, Math.min(10, limit)) : 6;
}

function ebayCampaignId(): string | null {
  return configured(process.env.EBAY_CAMPAIGN_ID) ?? configured(process.env.EBAY_AFFILIATE_CAMPAIGN_ID);
}

function ebayAffiliateEnabled(): boolean {
  return process.env.EBAY_AFFILIATE_ENABLED === "1" || process.env.EBAY_AFFILIATE_ENABLED === "true";
}

function ebayPixelParam(name: string, fallback: string): string {
  return configured(process.env[name]) ?? fallback;
}

export function getEbayAffiliateImpressionPixelUrl(customId = "region-atlas-games"): string | null {
  const configuredPixel = configured(process.env.EBAY_AFFILIATE_IMPRESSION_PIXEL_URL);
  const campaignId = ebayCampaignId();
  if (configuredPixel) {
    try {
      const parsed = new URL(configuredPixel);
      if (campaignId) parsed.searchParams.set("campid", campaignId);
      parsed.searchParams.set("customid", customId);
      return parsed.toString();
    } catch {
      return configuredPixel;
    }
  }

  const mpt = configured(process.env.EBAY_AFFILIATE_MPT);
  if (!campaignId || !mpt) return null;

  const params = new URLSearchParams({
    mpt,
    mkcid: ebayPixelParam("EBAY_AFFILIATE_MKCID", "1"),
    mkrid: ebayPixelParam("EBAY_AFFILIATE_MKRID", "1185-53479-19255-0"),
    mkevt: ebayPixelParam("EBAY_AFFILIATE_MKEVT", "2"),
    siteid: ebayPixelParam("EBAY_AFFILIATE_SITE_ID", "186"),
    campid: campaignId,
    ad_type: ebayPixelParam("EBAY_AFFILIATE_AD_TYPE", "0"),
    toolid: ebayPixelParam("EBAY_AFFILIATE_TOOL_ID", "20012"),
    customid: configured(process.env.EBAY_AFFILIATE_CUSTOM_ID) ?? customId,
  });

  return `https://www.ebayadservices.com/marketingtracking/v1/impression?${params.toString()}`;
}

function ebayGameCustomId(game: CatalogGame): string {
  return buildEbayGameCustomId({ gameSlug: game.slug, platformSlug: game.platformSlug });
}

function ebayEndUserContext(game: CatalogGame): string | null {
  const campaignId = ebayCampaignId();
  if (!campaignId) return null;
  return `affiliateCampaignId=${campaignId},affiliateReferenceId=${ebayGameCustomId(game)}`;
}

async function getEbayAccessToken(): Promise<string | null> {
  const clientId = configured(process.env.EBAY_CLIENT_ID);
  const clientSecret = configured(process.env.EBAY_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  const cached = globalThis[EBAY_TOKEN_CACHE_KEY];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  const ttlMs = Math.max(60, data.expires_in ?? 7200) * 1000;
  globalThis[EBAY_TOKEN_CACHE_KEY] = {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs,
  };
  return data.access_token;
}

function ebayQuery(game: CatalogGame, details: GameDetails | null): string {
  void details;
  const platform = getPlatform(game.platformSlug);
  const title = game.titlePc || game.title;
  const platformName = platform?.shortName ?? game.platformSlug;
  const region = getRegionDisplay(game.region).label;
  const normalizedRegion = region.toLowerCase();
  const regionTerms = new Set<string>();

  if (normalizedRegion.includes("pal")) {
    regionTerms.add(region);
    regionTerms.add("PAL");
  }
  if (normalizedRegion.includes("usa") || normalizedRegion.includes("ntsc usa")) {
    regionTerms.add("NTSC USA");
    regionTerms.add("USA");
  }
  if (normalizedRegion.includes("jap") || normalizedRegion.includes("ntsc-j")) {
    regionTerms.add("Japanese");
    regionTerms.add("Japan");
  }

  return [title, platformName, ...regionTerms].filter(Boolean).join(" ");
}

function ebayFallbackSearchCta(game: CatalogGame, details: GameDetails | null): AffiliateFallbackCta | null {
  const campaignId = ebayCampaignId();
  if (!campaignId) return null;
  const query = ebayQuery(game, details);
  const url = new URL("https://www.ebay.es/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("campid", campaignId);
  url.searchParams.set("customid", ebayGameCustomId(game));
  return {
    provider: "ebay",
    id: `${game.id}-ebay-search-fallback`,
    label: "Buscar este juego en eBay",
    url: url.toString(),
  };
}

async function getEbayOffers(
  game: CatalogGame,
  details: GameDetails | null,
): Promise<{ offers: AffiliateOffer[]; fallbackCta: AffiliateFallbackCta | null }> {
  if (!affiliateEnabled() || !ebayAffiliateEnabled()) return { offers: [], fallbackCta: null };
  const fallbackCta = ebayFallbackSearchCta(game, details);
  if (!ebayConfigured()) return { offers: [], fallbackCta };
  const token = await getEbayAccessToken();
  if (!token) return { offers: [], fallbackCta };

  const params = new URLSearchParams({
    q: ebayQuery(game, details),
    limit: String(ebayLimit() * 2),
    filter: "buyingOptions:{FIXED_PRICE}",
  });
  const endUserContext = ebayEndUserContext(game);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": ebayMarketplace(),
  };
  if (endUserContext) headers["X-EBAY-C-ENDUSERCTX"] = endUserContext;

  const res = await fetch(`${EBAY_BROWSE_SEARCH_URL}?${params}`, {
    headers,
    next: { revalidate: DEFAULT_CACHE_SECONDS },
  });
  if (!res.ok) return { offers: [], fallbackCta };

  const data = (await res.json()) as EbaySearchResponse;
  const offers = (data.itemSummaries ?? [])
    .map((item): AffiliateOffer | null => {
      if (!item.itemId || !item.title || !item.itemWebUrl || !item.itemAffiliateWebUrl) return null;
      const confidence = scoreOffer(game, details, item.title);
      if (confidence < 0.62) return null;
      return {
        provider: "ebay",
        id: item.itemId,
        title: item.title,
        url: item.itemAffiliateWebUrl,
        imageUrl: item.image?.imageUrl ?? null,
        price: numberValue(item.price?.value),
        currency: item.price?.currency ?? "EUR",
        shippingPrice: numberValue(item.shippingOptions?.[0]?.shippingCost?.value),
        condition: item.condition ?? null,
        location: item.itemLocation?.country ?? null,
        confidence,
      };
    })
    .filter((offer): offer is AffiliateOffer => Boolean(offer))
    .sort((a, b) => b.confidence - a.confidence || (a.price ?? 999999) - (b.price ?? 999999));

  const sliced = offers.slice(0, ebayLimit());
  return {
    offers: sliced,
    fallbackCta: sliced.length > 0 ? null : fallbackCta,
  };
}

async function getAmazonOffers(_game: CatalogGame, _details: GameDetails | null): Promise<AffiliateOffer[]> {
  void _game;
  void _details;
  if (!affiliateEnabled() || !amazonConfigured()) return [];
  return [];
}

export async function getAffiliateOfferBlock(
  game: CatalogGame,
  details: GameDetails | null,
): Promise<AffiliateOfferBlock> {
  const trackingId = ebayGameCustomId(game);
  if (!affiliateEnabled()) return { enabled: false, offers: [], fallbackCta: null, checkedAt: null, trackingId };
  if (!(await affiliateGameWhitelisted(game))) return { enabled: true, offers: [], fallbackCta: null, checkedAt: null, trackingId };

  const [ebayResult, amazonOffers] = await Promise.all([
    getEbayOffers(game, details),
    getAmazonOffers(game, details),
  ]);
  return {
    enabled: true,
    offers: [...ebayResult.offers, ...amazonOffers],
    fallbackCta: amazonOffers.length > 0 ? null : ebayResult.fallbackCta,
    checkedAt: new Date().toISOString(),
    trackingId,
  };
}
