import { NextResponse } from "next/server";
import { getCatalogGame, isPublicCatalogGame, resolveCatalogIdParam } from "@/lib/catalog";
import {
  getAffiliateOfferBlock,
  getEbayAffiliateImpressionPixelUrl,
  type AffiliateOfferBlock,
} from "@/lib/affiliate-offers";
import {
  CATALOG_EBAY_REGION_PARAM,
  catalogEbayOfferCacheKey,
  catalogEbayRegionOptions,
  resolveCatalogEbayRegion,
} from "@/lib/catalog-ebay-region";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";
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
    ebayPriorityCountry: null,
    offers: [],
    fallbackCta: null,
    checkedAt: null,
    trackingId: catalogId,
    ebayImpressionPixelUrl: null,
    ...(error ? { error } : {}),
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  const catalogId = resolveCatalogIdParam((await params).catalogId);
  if (!catalogId) {
    return withHeaders(disabledPayload("", "missing_catalog_id"), 400);
  }

  const game = getCatalogGame(catalogId) ?? (await readCatalogOverlayGame(catalogId));
  if (!game || !isPublicCatalogGame(game)) {
    return withHeaders(disabledPayload(catalogId, "game_not_found"), 404);
  }

  const guide = getCatalogEditionGuide(game);
  const family = guide?.editionFamilies.find((entry) => entry.id === guide.currentEditionFamilyId);
  const familyEditions = guide?.schemaVersion === 2 && family
    ? guide.physicalEditions.filter((edition) => family.physicalEditionIds.includes(edition.id))
    : [];
  const regionOptions = catalogEbayRegionOptions(familyEditions);
  const currentEdition = guide?.physicalEditions.find((edition) => edition.id === guide.currentEditionId);
  const currentMarket = currentEdition?.marketRegions.length === 1
    ? currentEdition.marketRegions[0]
    : null;
  const requestedRegion = new URL(request.url).searchParams.get(CATALOG_EBAY_REGION_PARAM);
  const selectedRegion = resolveCatalogEbayRegion(regionOptions, requestedRegion, currentMarket);
  const cacheKey = catalogEbayOfferCacheKey(catalogId, selectedRegion?.value);
  const cache = affiliateOfferCache();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return withHeaders(cached.payload);
  }

  try {
    const details = await getGameDetailsWithOverlay(game.id);
    const linkedEbayGame = selectedRegion?.catalogId && selectedRegion.catalogId !== game.id
      ? getCatalogGame(selectedRegion.catalogId) ?? await readCatalogOverlayGame(selectedRegion.catalogId)
      : game;
    const ebayGame = linkedEbayGame && isPublicCatalogGame(linkedEbayGame)
      ? linkedEbayGame
      : game;
    const ebayDetails = ebayGame.id === game.id
      ? details
      : await getGameDetailsWithOverlay(ebayGame.id);
    const payload = withPixel(await getAffiliateOfferBlock(game, details ?? null, {
      ...(selectedRegion ? { ebayCountry: selectedRegion.value } : {}),
      ebayGame,
      ebayDetails: ebayDetails ?? null,
    }));
    cache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + cacheSeconds() * 1000,
    });
    return withHeaders(payload);
  } catch (error) {
    const payload = disabledPayload(
      catalogId,
      error instanceof Error ? error.message : "affiliate_offers_unavailable",
    );
    cache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + Math.min(cacheSeconds(), 60) * 1000,
    });
    return withHeaders(payload);
  }
}
