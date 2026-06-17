import { existsSync, readFileSync } from "fs";
import path from "path";
import { getPlatform } from "./catalog";
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

export type AffiliateOfferBlock = {
  enabled: boolean;
  offers: AffiliateOffer[];
  checkedAt: string | null;
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

function affiliateGameWhitelisted(game: CatalogGame): boolean {
  if (!affiliateProductionWhitelistEnabled()) return true;
  try {
    if (!existsSync(AFFILIATE_WHITELIST_FILE)) return false;
    const parsed = JSON.parse(readFileSync(AFFILIATE_WHITELIST_FILE, "utf8")) as { gameIds?: string[] };
    const gameIds = new Set((parsed.gameIds ?? []).map((value) => String(value).trim()).filter(Boolean));
    return gameIds.has(game.id);
  } catch {
    return false;
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

function appendEbayCampaign(url: string): string {
  const campaignId = ebayCampaignId();
  if (!campaignId) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("campid", campaignId);
    return parsed.toString();
  } catch {
    return url;
  }
}

function ebayEndUserContext(game: CatalogGame): string | null {
  const campaignId = ebayCampaignId();
  if (!campaignId) return null;
  return `affiliateCampaignId=${campaignId},affiliateReferenceId=${game.id}`;
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
  const platform = getPlatform(game.platformSlug);
  const title = game.titlePc || game.title;
  const platformName = platform?.shortName ?? game.platformSlug;
  return details?.ean ? details.ean : `${title} ${platformName}`;
}

async function getEbayOffers(game: CatalogGame, details: GameDetails | null): Promise<AffiliateOffer[]> {
  if (!affiliateEnabled() || !ebayConfigured()) return [];
  const token = await getEbayAccessToken();
  if (!token) return [];

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
  if (!res.ok) return [];

  const data = (await res.json()) as EbaySearchResponse;
  const offers = (data.itemSummaries ?? [])
    .map((item): AffiliateOffer | null => {
      if (!item.itemId || !item.title || !item.itemWebUrl) return null;
      const confidence = scoreOffer(game, details, item.title);
      if (confidence < 0.62) return null;
      return {
        provider: "ebay",
        id: item.itemId,
        title: item.title,
        url: item.itemAffiliateWebUrl ?? appendEbayCampaign(item.itemWebUrl),
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

  return offers.slice(0, ebayLimit());
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
  if (!affiliateEnabled()) return { enabled: false, offers: [], checkedAt: null };
  if (!affiliateGameWhitelisted(game)) return { enabled: true, offers: [], checkedAt: null };

  const [ebayOffers, amazonOffers] = await Promise.all([
    getEbayOffers(game, details),
    getAmazonOffers(game, details),
  ]);
  return {
    enabled: true,
    offers: [...ebayOffers, ...amazonOffers],
    checkedAt: new Date().toISOString(),
  };
}
