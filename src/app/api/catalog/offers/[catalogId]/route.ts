import { NextResponse } from "next/server";
import { getCatalogGame } from "@/lib/catalog";
import {
  getAffiliateOfferBlock,
  getEbayAffiliateImpressionPixelUrl,
  type AffiliateOfferBlock,
} from "@/lib/affiliate-offers";
import { getGameDetailsWithOverlay, readCatalogOverlayGame } from "@/lib/catalog-runtime-overlay";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ catalogId: string }> };

type AffiliateOfferApiPayload = AffiliateOfferBlock & {
  ebayImpressionPixelUrl: string | null;
  error?: string;
};

type CachedAffiliateOffer = {
  expiresAt: number;
  payload: AffiliateOfferApiPayload;
};

const DEFAULT_OFFER_CACHE_SECONDS = 5 * 60;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";
const AFFILIATE_OFFER_CACHE_KEY = "__regionAtlasAffiliateOfferApiCache";

declare global {
  var __regionAtlasAffiliateOfferApiCache: Map<string, CachedAffiliateOffer> | undefined;
}

function affiliateOfferCache(): Map<string, CachedAffiliateOffer> {
  globalThis[AFFILIATE_OFFER_CACHE_KEY] ??= new Map();
  return globalThis[AFFILIATE_OFFER_CACHE_KEY];
}

function cacheSeconds(): number {
  const parsed = Number.parseInt(process.env.AFFILIATE_OFFERS_API_CACHE_SECONDS ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(30, Math.min(30 * 60, parsed)) : DEFAULT_OFFER_CACHE_SECONDS;
}

function withHeaders(payload: AffiliateOfferApiPayload, status = 200): NextResponse<AffiliateOfferApiPayload> {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": CACHE_HEADER,
    },
  });
}

function withPixel(payload: AffiliateOfferBlock): AffiliateOfferApiPayload {
  const hasEbayLink =
    payload.offers.some((offer) => offer.provider === "ebay") ||
    payload.fallbackCta?.provider === "ebay" ||
    payload.fallbackCtas?.some((fallback) => fallback.provider === "ebay");
  return {
    ...payload,
    ebayImpressionPixelUrl: hasEbayLink
      ? getEbayAffiliateImpressionPixelUrl(payload.trackingId ?? undefined)
      : null,
  };
}

function disabledPayload(catalogId: string, error?: string): AffiliateOfferApiPayload {
  return {
    enabled: false,
    offers: [],
    fallbackCta: null,
    checkedAt: null,
    trackingId: catalogId,
    ebayImpressionPixelUrl: null,
    ...(error ? { error } : {}),
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const catalogId = decodeURIComponent((await params).catalogId).trim();
  if (!catalogId) {
    return withHeaders(disabledPayload("", "missing_catalog_id"), 400);
  }

  const cache = affiliateOfferCache();
  const cached = cache.get(catalogId);
  if (cached && cached.expiresAt > Date.now()) {
    return withHeaders(cached.payload);
  }

  const game = getCatalogGame(catalogId) ?? (await readCatalogOverlayGame(catalogId));
  if (!game) {
    return withHeaders(disabledPayload(catalogId, "game_not_found"), 404);
  }

  try {
    const details = await getGameDetailsWithOverlay(game.id);
    const payload = withPixel(await getAffiliateOfferBlock(game, details ?? null));
    cache.set(catalogId, {
      payload,
      expiresAt: Date.now() + cacheSeconds() * 1000,
    });
    return withHeaders(payload);
  } catch (error) {
    const payload = disabledPayload(
      catalogId,
      error instanceof Error ? error.message : "affiliate_offers_unavailable",
    );
    cache.set(catalogId, {
      payload,
      expiresAt: Date.now() + Math.min(cacheSeconds(), 60) * 1000,
    });
    return withHeaders(payload);
  }
}
