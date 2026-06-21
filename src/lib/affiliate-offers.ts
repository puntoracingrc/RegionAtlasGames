import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { buildEbayGameCustomId } from "./ebay/ebay-enduserctx";
import { getPlatform } from "./catalog";
import { readCatalogOverlayGame } from "./catalog-runtime-overlay";
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
  provider: Extract<AffiliateProvider, "ebay" | "amazon">;
  id: string;
  label: string;
  url: string;
};

export type AffiliateOfferBlock = {
  enabled: boolean;
  offers: AffiliateOffer[];
  fallbackCta: AffiliateFallbackCta | null;
  fallbackCtas?: AffiliateFallbackCta[];
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

type AmazonTokenCache = {
  token: string;
  expiresAt: number;
};

type AmazonMoney = {
  amount?: number;
  currency?: string;
  displayAmount?: string;
};

type AmazonOfferListing = {
  isBuyBoxWinner?: boolean;
  condition?: {
    value?: string;
    subCondition?: string;
    conditionNote?: string;
  };
  merchantInfo?: {
    name?: string;
    id?: string;
  };
  price?: {
    money?: AmazonMoney;
  };
  type?: string;
};

type AmazonSearchItem = {
  asin?: string;
  detailPageURL?: string;
  images?: {
    primary?: {
      small?: { url?: string };
      medium?: { url?: string };
      large?: { url?: string };
      hiRes?: { url?: string };
    };
  };
  itemInfo?: {
    title?: {
      displayValue?: string;
    };
  };
  offersV2?: {
    listings?: AmazonOfferListing[];
  };
  score?: number;
};

type AmazonSearchResponse = {
  searchResult?: {
    items?: AmazonSearchItem[];
    totalResultCount?: number;
    searchURL?: string;
  };
};

type AmazonSearchPayload = {
  partnerTag: string;
  keywords: string;
  itemCount: number;
  resources: string[];
  searchIndex?: string;
};

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const AMAZON_CREATORS_SEARCH_URL = "https://creatorsapi.amazon/catalog/v1/searchItems";
const AMAZON_CREATORS_DEFAULT_TOKEN_URL = "https://api.amazon.co.uk/auth/o2/token";
const DEFAULT_CACHE_SECONDS = 60 * 60 * 6;
const EBAY_TOKEN_CACHE_KEY = "__regionAtlasEbayTokenCache";
const AMAZON_TOKEN_CACHE_KEY = "__regionAtlasAmazonTokenCache";
const AFFILIATE_WHITELIST_FILE = path.join(process.cwd(), "data", "affiliate-offers-whitelist.json");

declare global {
  var __regionAtlasEbayTokenCache: EbayTokenCache | undefined;
  var __regionAtlasAmazonTokenCache: AmazonTokenCache | undefined;
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

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function moneyNumberValue(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round(Number(value) * 100) / 100;
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

function amazonAffiliateEnabled(): boolean {
  return process.env.AMAZON_AFFILIATE_ENABLED === "1" || process.env.AMAZON_AFFILIATE_ENABLED === "true";
}

function amazonCredentialId(): string | null {
  return configured(process.env.AMAZON_CREATORS_CREDENTIAL_ID) ?? configured(process.env.AMAZON_ACCESS_KEY);
}

function amazonCredentialSecret(): string | null {
  return configured(process.env.AMAZON_CREATORS_CREDENTIAL_SECRET) ?? configured(process.env.AMAZON_SECRET_KEY);
}

function amazonConfigured(): boolean {
  return Boolean(configured(process.env.AMAZON_ASSOCIATE_TAG) && amazonCredentialId() && amazonCredentialSecret());
}

function amazonCredentialVersion(): string {
  return (configured(process.env.AMAZON_CREATORS_CREDENTIAL_VERSION) ?? "3.2").replace(/^v/i, "");
}

function amazonMarketplace(): string {
  return configured(process.env.AMAZON_MARKETPLACE) ?? "www.amazon.es";
}

function amazonSearchIndex(): string | null {
  return configured(process.env.AMAZON_SEARCH_INDEX);
}

function amazonLimit(): number {
  const limit = Number.parseInt(process.env.AMAZON_AFFILIATE_LIMIT ?? "4", 10);
  return Number.isFinite(limit) ? Math.max(1, Math.min(8, limit)) : 4;
}

function amazonTokenUrl(): string {
  const configuredUrl = configured(process.env.AMAZON_CREATORS_TOKEN_URL);
  if (configuredUrl) return configuredUrl;
  const version = amazonCredentialVersion();
  if (version.startsWith("3.")) return AMAZON_CREATORS_DEFAULT_TOKEN_URL;
  return AMAZON_CREATORS_DEFAULT_TOKEN_URL;
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
  if (!res.ok) {
    let error = "";
    try {
      error = JSON.stringify(await res.json());
    } catch {
      error = await res.text();
    }
    console.warn("ebay_token_failed", {
      status: res.status,
      error: error.slice(0, 700),
    });
    return null;
  }
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
  return [title, platformName].filter(Boolean).join(" ");
}

function amazonQuery(game: CatalogGame, details: GameDetails | null): string {
  return ebayQuery(game, details);
}

async function getAmazonAccessToken(): Promise<string | null> {
  const credentialId = amazonCredentialId();
  const credentialSecret = amazonCredentialSecret();
  if (!credentialId || !credentialSecret) return null;
  const cached = globalThis[AMAZON_TOKEN_CACHE_KEY];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(amazonTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: credentialId,
      client_secret: credentialSecret,
      scope: "creatorsapi::default",
    }),
  });
  if (!res.ok) {
    let error = "";
    try {
      error = JSON.stringify(await res.json());
    } catch {
      error = await res.text();
    }
    console.warn("amazon_creators_token_failed", {
      status: res.status,
      version: amazonCredentialVersion(),
      error: error.slice(0, 700),
    });
    return null;
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  const ttlMs = Math.max(60, data.expires_in ?? 3600) * 1000;
  globalThis[AMAZON_TOKEN_CACHE_KEY] = {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs,
  };
  return data.access_token;
}

function amazonResources(): string[] {
  return [
    "images.primary.medium",
    "images.primary.large",
    "itemInfo.title",
    "offersV2.listings.availability",
    "offersV2.listings.condition",
    "offersV2.listings.isBuyBoxWinner",
    "offersV2.listings.merchantInfo",
    "offersV2.listings.price",
    "offersV2.listings.type",
  ];
}

function amazonSearchPayload(
  game: CatalogGame,
  details: GameDetails | null,
  associateTag: string,
  searchIndex: string | null,
): AmazonSearchPayload {
  return {
    partnerTag: associateTag,
    keywords: amazonQuery(game, details),
    ...(searchIndex ? { searchIndex } : {}),
    itemCount: amazonLimit() * 2,
    resources: amazonResources(),
  };
}

async function fetchAmazonSearch(
  token: string,
  payload: AmazonSearchPayload,
): Promise<{ ok: true; data: AmazonSearchResponse } | { ok: false; status: number; error: string }> {
  const res = await fetch(AMAZON_CREATORS_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "x-marketplace": amazonMarketplace(),
    },
    body: JSON.stringify(payload),
    next: { revalidate: DEFAULT_CACHE_SECONDS },
  });
  if (!res.ok) {
    let error = "";
    try {
      error = JSON.stringify(await res.json());
    } catch {
      error = await res.text();
    }
    return { ok: false, status: res.status, error: error.slice(0, 700) };
  }
  return { ok: true, data: (await res.json()) as AmazonSearchResponse };
}

function bestAmazonListing(listings: AmazonOfferListing[] | undefined): AmazonOfferListing | null {
  const validListings = (listings ?? []).filter((listing) => listing.price?.money);
  if (validListings.length === 0) return null;
  return validListings.find((listing) => listing.isBuyBoxWinner) ?? validListings[0] ?? null;
}

function amazonCondition(listing: AmazonOfferListing | null): string | null {
  const parts = [listing?.condition?.value, listing?.condition?.subCondition].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
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

function amazonGameCustomId(game: CatalogGame): string {
  return `rag-game-${game.slug}-${game.platformSlug}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

function amazonFallbackSearchCta(game: CatalogGame, details: GameDetails | null): AffiliateFallbackCta | null {
  const associateTag = configured(process.env.AMAZON_ASSOCIATE_TAG);
  if (!associateTag || !amazonAffiliateEnabled()) return null;
  const marketplace = amazonMarketplace().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const query = amazonQuery(game, details);
  const url = new URL(`https://${marketplace}/s`);
  url.searchParams.set("k", query);
  url.searchParams.set("tag", associateTag);
  url.searchParams.set("ascsubtag", amazonGameCustomId(game));
  return {
    provider: "amazon",
    id: `${game.id}-amazon-search-fallback`,
    label: "Buscar este juego en Amazon",
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
  if (!res.ok) {
    let error = "";
    try {
      error = JSON.stringify(await res.json());
    } catch {
      error = await res.text();
    }
    console.warn("ebay_search_failed", {
      status: res.status,
      marketplace: ebayMarketplace(),
      catalogId: game.id,
      query: ebayQuery(game, details),
      error: error.slice(0, 700),
    });
    return { offers: [], fallbackCta };
  }

  const data = (await res.json()) as EbaySearchResponse;
  const rawItems = data.itemSummaries ?? [];
  const offers = rawItems
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
  if (rawItems.length > 0 && sliced.length === 0) {
    console.warn("ebay_search_filtered_out", {
      catalogId: game.id,
      query: ebayQuery(game, details),
      rawItems: rawItems.length,
      firstTitles: rawItems
        .map((item) => item.title)
        .filter(Boolean)
        .slice(0, 5),
    });
  }
  return {
    offers: sliced,
    fallbackCta: sliced.length > 0 ? null : fallbackCta,
  };
}

async function getAmazonOffers(game: CatalogGame, details: GameDetails | null): Promise<AffiliateOffer[]> {
  if (!affiliateEnabled() || !amazonAffiliateEnabled() || !amazonConfigured()) return [];
  try {
    const token = await getAmazonAccessToken();
    const associateTag = configured(process.env.AMAZON_ASSOCIATE_TAG);
    if (!token || !associateTag) return [];

    const configuredSearchIndex = amazonSearchIndex();
    let search = await fetchAmazonSearch(
      token,
      amazonSearchPayload(game, details, associateTag, configuredSearchIndex),
    );
    if (!search.ok && configuredSearchIndex && search.status === 400) {
      search = await fetchAmazonSearch(token, amazonSearchPayload(game, details, associateTag, null));
    }
    if (!search.ok) {
      console.warn("amazon_creators_search_failed", {
        status: search.status,
        marketplace: amazonMarketplace(),
        searchIndex: configuredSearchIndex ? "configured" : "none",
        catalogId: game.id,
        error: search.error,
      });
      return [];
    }

    const data = search.data;
    return (data.searchResult?.items ?? [])
      .map((item): AffiliateOffer | null => {
        const title = item.itemInfo?.title?.displayValue;
        const listing = bestAmazonListing(item.offersV2?.listings);
        const money = listing?.price?.money;
        if (!item.asin || !title || !item.detailPageURL) return null;
        const confidence = scoreOffer(game, details, title);
        if (confidence < 0.58) return null;
        return {
          provider: "amazon",
          id: item.asin,
          title,
          url: item.detailPageURL,
          imageUrl:
            item.images?.primary?.medium?.url ??
            item.images?.primary?.large?.url ??
            item.images?.primary?.hiRes?.url ??
            item.images?.primary?.small?.url ??
            null,
          price: moneyNumberValue(money?.amount),
          currency: money?.currency ?? "EUR",
          shippingPrice: null,
          condition: amazonCondition(listing),
          location: listing?.merchantInfo?.name ?? "Amazon",
          confidence,
        };
      })
      .filter((offer): offer is AffiliateOffer => Boolean(offer))
      .sort((a, b) => b.confidence - a.confidence || (a.price ?? 999999) - (b.price ?? 999999))
      .slice(0, amazonLimit());
  } catch (error) {
    console.warn("amazon_creators_unavailable", {
      catalogId: game.id,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return [];
  }
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
  const amazonFallback = amazonFallbackSearchCta(game, details);
  const fallbackCtas = [...(amazonOffers.length > 0 ? [] : [amazonFallback]), ebayResult.fallbackCta].filter(
    (fallback): fallback is AffiliateFallbackCta => Boolean(fallback),
  );
  return {
    enabled: true,
    offers: [...ebayResult.offers, ...amazonOffers],
    fallbackCta: fallbackCtas[0] ?? null,
    fallbackCtas,
    checkedAt: new Date().toISOString(),
    trackingId,
  };
}
