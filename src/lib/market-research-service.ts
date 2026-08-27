import { randomUUID } from "crypto";
import {
  applyDraftPatch,
  draftFromCatalogGame,
  getPublishedGameForAdmin,
  updatePublishedCatalogGame,
  updatePublishedCatalogPrices,
} from "./admin-catalog-publish";
import { normalizeAffiliateText } from "./affiliate/matching/normalize-title";
import { getCatalogByPlatformWithOverlay } from "./catalog-runtime-overlay";
import { researchCoverCandidates } from "./cover-research";
import { downloadAndUploadCoverToCdn } from "./covers-upload";
import { ebayMarketplaceId } from "./ebay/ebay-client";
import { researchEbayMarket, type EbayResearchListing } from "./ebay/ebay-research";
import {
  readMarketResearchCatalog,
  recordMarketPublication,
  reviewMarketObservation,
  reviewStoredCoverCandidate,
  saveMarketResearchCatalog,
  type CatalogIdentity,
} from "./market-research-store";
import type {
  MarketCollectionResult,
  MarketObservation,
  MarketObservationReviewStatus,
  MarketResearchCatalogView,
  MarketResearchPublication,
  StoredCoverCandidate,
} from "./market-research-types";
import { getRegionDisplay } from "./region-display";
import type { CatalogGame } from "./types";

type ResearchPayload = Awaited<ReturnType<typeof researchEbayMarket>>;
type CoverPayload = Awaited<ReturnType<typeof researchCoverCandidates>>;

export type MarketResearchLiveResult = {
  game: CatalogGame;
  ebay: ResearchPayload;
  covers: CoverPayload;
};

function identityFor(game: CatalogGame): CatalogIdentity {
  return {
    catalogId: game.id,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
  };
}

function sameRegionalEditionFamily(origin: CatalogGame, candidate: CatalogGame): boolean {
  if (origin.platformSlug !== candidate.platformSlug) return false;
  if (origin.slug === candidate.slug) return true;
  const originTitles = new Set([
    normalizeAffiliateText(origin.title),
    normalizeAffiliateText(origin.titlePc ?? ""),
  ].filter(Boolean));
  return [candidate.title, candidate.titlePc]
    .map((value) => normalizeAffiliateText(value ?? ""))
    .some((value) => value && originTitles.has(value));
}

export function findRegionalVariant(
  origin: CatalogGame,
  candidates: CatalogGame[],
  suggestedRegion: string | null,
): CatalogGame | null {
  if (!suggestedRegion) return null;
  const requestedFlag = getRegionDisplay(suggestedRegion).flagCode;
  const matches = candidates.filter((candidate) => {
    if (candidate.id === origin.id || !sameRegionalEditionFamily(origin, candidate)) return false;
    return getRegionDisplay(candidate.region).flagCode === requestedFlag;
  });
  if (matches.length === 1) return matches[0];
  const exactSlug = matches.filter((candidate) => candidate.slug === origin.slug);
  return exactSlug.length === 1 ? exactSlug[0] : null;
}

function defaultReviewStatus(
  listing: EbayResearchListing,
  routed: boolean,
): MarketObservationReviewStatus {
  if (listing.decision === "accept" || (listing.decision === "other_variant" && routed)) return "accepted";
  if (listing.decision === "reject") return "rejected";
  return "pending";
}

function observationFromListing(input: {
  listing: EbayResearchListing;
  destination: CatalogGame;
  origin: CatalogGame;
  collectedAt: string;
  routed: boolean;
}): MarketObservation {
  const { listing, destination, origin, collectedAt, routed } = input;
  return {
    id: `ebay:${listing.marketplaceId}:${listing.itemId}`,
    source: "ebay",
    marketplaceId: listing.marketplaceId || ebayMarketplaceId(),
    listingId: listing.itemId,
    catalogId: destination.id,
    originCatalogId: origin.id,
    sourceDecision: listing.decision,
    reviewStatus: defaultReviewStatus(listing, routed),
    title: listing.title,
    url: listing.url,
    affiliateUrl: listing.affiliateUrl,
    imageUrls: listing.imageUrls,
    price: listing.price,
    originalPrice: listing.originalPrice,
    originalCurrency: listing.originalCurrency,
    shippingPrice: listing.shippingPrice,
    totalPrice: listing.totalPrice,
    currency: listing.currency,
    originLabel: listing.originLabel,
    importCostsMayApply: listing.importCostsMayApply,
    condition: listing.condition,
    conditionBucket: listing.conditionBucket,
    confidence: listing.confidence,
    detectedRegion: listing.suggestedRegion ?? (listing.regionMatch === "exact" ? destination.region : null),
    targetRegion: destination.region,
    sellerCountry: listing.sellerCountry,
    itemEndDate: listing.itemEndDate,
    exactIdentifier: listing.exactIdentifier,
    exactReference: listing.exactReference,
    epid: listing.epid,
    gtin: listing.gtin,
    reasons: listing.reasons,
    searchBasis: listing.searchBasis,
    firstSeenAt: collectedAt,
    lastSeenAt: collectedAt,
    seenCount: 0,
    reviewedAt: null,
    reviewedBy: null,
  };
}

function storedCoverCandidates(
  catalogId: string,
  covers: CoverPayload,
  collectedAt: string,
): StoredCoverCandidate[] {
  return covers.candidates.map((candidate) => ({
    ...candidate,
    catalogId,
    status: "pending",
    firstSeenAt: collectedAt,
    lastSeenAt: collectedAt,
    reviewedAt: null,
    reviewedBy: null,
    publishedCoverUrl: null,
  }));
}

export async function runMarketResearchForCatalog(catalogId: string): Promise<MarketResearchLiveResult | { error: string }> {
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) return { error: "Juego no encontrado." };
  const ebay = await researchEbayMarket(resolved.game, resolved.details);
  const covers = await researchCoverCandidates(resolved.game, resolved.details, ebay);
  return { game: resolved.game, ebay, covers };
}

export async function collectMarketResearchForCatalog(
  catalogId: string,
  collectedBy: string,
): Promise<(MarketCollectionResult & { ebay: ResearchPayload; covers: CoverPayload }) | { error: string }> {
  const live = await runMarketResearchForCatalog(catalogId);
  if ("error" in live) return live;

  const collectedAt = new Date().toISOString();
  const platformGames = await getCatalogByPlatformWithOverlay(live.game.platformSlug);
  const destinations = new Map<string, CatalogGame>([[live.game.id, live.game]]);
  const grouped = new Map<string, MarketObservation[]>();
  let routed = 0;
  let pendingRouting = 0;

  for (const listing of live.ebay.listings) {
    let destination = live.game;
    let didRoute = false;
    if (listing.decision === "other_variant") {
      const variant = findRegionalVariant(live.game, platformGames, listing.suggestedRegion);
      if (variant) {
        destination = variant;
        destinations.set(variant.id, variant);
        didRoute = true;
        routed += 1;
      } else {
        pendingRouting += 1;
      }
    }
    const observation = observationFromListing({
      listing,
      destination,
      origin: live.game,
      collectedAt,
      routed: didRoute,
    });
    const rows = grouped.get(destination.id) ?? [];
    rows.push(observation);
    grouped.set(destination.id, rows);
  }

  if (!grouped.has(live.game.id)) grouped.set(live.game.id, []);
  const runId = `market-${randomUUID()}`;
  const affectedCatalogIds = [...grouped.keys()];
  let originStored: MarketResearchCatalogView | null = null;

  await Promise.all(affectedCatalogIds.map(async (destinationId) => {
    const destination = destinations.get(destinationId);
    if (!destination) return;
    const rows = grouped.get(destinationId) ?? [];
    const isOrigin = destinationId === live.game.id;
    const run = {
      id: runId,
      catalogId: destinationId,
      collectedAt,
      collectedBy,
      accepted: rows.filter((item) => item.reviewStatus === "accepted").length,
      pending: rows.filter((item) => item.reviewStatus === "pending").length,
      routed: rows.filter((item) => item.originCatalogId !== item.catalogId).length,
      rejected: rows.filter((item) => item.reviewStatus === "rejected").length,
      coverCandidates: isOrigin ? live.covers.candidates.length : 0,
      warnings: isOrigin ? [...new Set([...live.ebay.warnings, ...live.covers.warnings])] : [],
    };
    const stored = await saveMarketResearchCatalog({
      identity: identityFor(destination),
      observations: rows,
      covers: isOrigin ? storedCoverCandidates(destinationId, live.covers, collectedAt) : [],
      run,
    });
    if (isOrigin) originStored = stored;
  }));

  if (!originStored) return { error: "No se pudo guardar el análisis de la ficha original." };
  return {
    ebay: live.ebay,
    covers: live.covers,
    stored: originStored,
    affectedCatalogIds,
    observations: live.ebay.listings.length,
    routed,
    pendingRouting,
    rejected: live.ebay.listings.filter((listing) => listing.decision === "reject").length,
    coverCandidates: live.covers.candidates.length,
  };
}

export async function getStoredMarketResearch(catalogId: string): Promise<MarketResearchCatalogView | null> {
  const resolved = await getPublishedGameForAdmin(catalogId);
  if (!resolved) return null;
  return readMarketResearchCatalog(identityFor(resolved.game));
}

export async function setMarketObservationReview(input: {
  catalogId: string;
  observationId: string;
  status: MarketObservationReviewStatus;
  reviewedBy: string;
}): Promise<MarketResearchCatalogView | { error: string }> {
  const resolved = await getPublishedGameForAdmin(input.catalogId);
  if (!resolved) return { error: "Juego no encontrado." };
  return reviewMarketObservation({
    identity: identityFor(resolved.game),
    observationId: input.observationId,
    status: input.status,
    reviewedBy: input.reviewedBy,
  });
}

function mergeSourceLabels(...values: Array<string | null | undefined>): string {
  const labels = values.flatMap((value) => (value ?? "").split("/").map((item) => item.trim()).filter(Boolean));
  if (!labels.some((label) => label.toLowerCase() === "ebay browse")) labels.push("eBay Browse");
  return [...new Set(labels)].join(" / ");
}

function conditionField(condition: Exclude<MarketObservation["conditionBucket"], "unknown">): string {
  if (condition === "loose") return "estimatedPriceLoose";
  if (condition === "game_manual") return "estimatedPriceGameManual";
  if (condition === "sealed") return "estimatedPriceSealed";
  return "estimatedPriceComplete";
}

function shippingConditionField(condition: Exclude<MarketObservation["conditionBucket"], "unknown">): string {
  if (condition === "loose") return "estimatedShippingToSpainLoose";
  if (condition === "game_manual") return "estimatedShippingToSpainGameManual";
  if (condition === "sealed") return "estimatedShippingToSpainSealed";
  return "estimatedShippingToSpainComplete";
}

function totalToSpainConditionField(condition: Exclude<MarketObservation["conditionBucket"], "unknown">): string {
  if (condition === "loose") return "estimatedTotalToSpainLoose";
  if (condition === "game_manual") return "estimatedTotalToSpainGameManual";
  if (condition === "sealed") return "estimatedTotalToSpainSealed";
  return "estimatedTotalToSpainComplete";
}

export async function publishStoredMarketEstimates(input: {
  catalogId: string;
  condition?: Exclude<MarketObservation["conditionBucket"], "unknown">;
  publishedBy: string;
}): Promise<{ ok: true; stored: MarketResearchCatalogView; prices: Record<string, unknown> } | { error: string }> {
  const resolved = await getPublishedGameForAdmin(input.catalogId);
  if (!resolved) return { error: "Juego no encontrado." };
  const identity = identityFor(resolved.game);
  const stored = await readMarketResearchCatalog(identity);
  const publishable = stored.estimates.filter((estimate) => {
    return estimate.publishable && (!input.condition || estimate.condition === input.condition);
  });
  if (publishable.length === 0) {
    return { error: "No hay una mediana EUR con tres evidencias recientes para publicar." };
  }

  const patch: Record<string, unknown> = {};
  const prices: MarketResearchPublication["prices"] = {};
  const shippingToSpain: NonNullable<MarketResearchPublication["shippingToSpain"]> = {};
  const totalsToSpain: NonNullable<MarketResearchPublication["totalsToSpain"]> = {};
  for (const estimate of publishable) {
    patch[conditionField(estimate.condition)] = estimate.median;
    prices[estimate.condition] = estimate.median;
    if (estimate.shippingMedian !== null && estimate.shippingObservations >= 2) {
      patch[shippingConditionField(estimate.condition)] = estimate.shippingMedian;
      shippingToSpain[estimate.condition] = estimate.shippingMedian;
    }
    if (estimate.totalToSpainMedian !== null && estimate.shippingObservations >= 2) {
      patch[totalToSpainConditionField(estimate.condition)] = estimate.totalToSpainMedian;
      totalsToSpain[estimate.condition] = estimate.totalToSpainMedian;
    }
    if (estimate.condition === "complete") patch.recommendedPrice = estimate.median;
  }
  const allVerifiedEur = stored.estimates.filter((estimate) => estimate.publishable && estimate.currency === "EUR");
  patch.marketMin = Math.min(...allVerifiedEur.map((estimate) => estimate.minimum));
  patch.marketMax = Math.max(...allVerifiedEur.map((estimate) => estimate.maximum));
  patch.hasEsPrice = true;
  patch.priceRegionVerified = true;
  patch.priceSource = "eBay Browse";
  patch.priceDataSources = mergeSourceLabels(resolved.game.priceDataSources, resolved.game.priceSource);

  const result = await updatePublishedCatalogPrices(resolved.game.id, patch);
  if ("error" in result) return result;

  const publication: MarketResearchPublication = {
    id: `publication-${randomUUID()}`,
    publishedAt: new Date().toISOString(),
    publishedBy: input.publishedBy,
    conditions: publishable.map((estimate) => estimate.condition),
    prices,
    shippingToSpain,
    totalsToSpain,
  };
  const nextStored = await recordMarketPublication({ identity, publication });
  return { ok: true, stored: nextStored, prices: result.prices as unknown as Record<string, unknown> };
}

export async function decideStoredCoverCandidate(input: {
  catalogId: string;
  candidateId: string;
  action: "approve" | "reject";
  confirmMismatch?: boolean;
  reviewedBy: string;
}): Promise<{ ok: true; stored: MarketResearchCatalogView; coverUrl?: string } | { error: string }> {
  const resolved = await getPublishedGameForAdmin(input.catalogId);
  if (!resolved) return { error: "Juego no encontrado." };
  const identity = identityFor(resolved.game);
  const stored = await readMarketResearchCatalog(identity);
  const candidate = stored.coverCandidates.find((item) => item.id === input.candidateId);
  if (!candidate) return { error: "Candidato de portada no encontrado." };

  if (input.action === "reject") {
    const next = await reviewStoredCoverCandidate({
      identity,
      candidateId: candidate.id,
      status: "rejected",
      reviewedBy: input.reviewedBy,
    });
    if ("error" in next) return next;
    return { ok: true, stored: next };
  }

  if (candidate.persistence !== "review_required") {
    return { error: "Las fotografías temporales de anuncios no pueden publicarse como portada." };
  }
  const requiresConfirmation = candidate.platformMatch !== "exact" || candidate.regionMatch !== "exact";
  if (requiresConfirmation && !input.confirmMismatch) {
    return { error: "Confirma expresamente que has revisado la plataforma y la región antes de publicar." };
  }
  const draft = draftFromCatalogGame(resolved.game, resolved.details);
  const uploaded = await downloadAndUploadCoverToCdn({
    platformSlug: draft.platformSlug,
    slug: draft.slug,
    catalogId: draft.catalogId,
    sourceUrl: candidate.imageUrl,
  });
  if ("error" in uploaded) return uploaded;

  const nextDraft = applyDraftPatch(draft, { coverUrl: uploaded.coverUrl });
  const saved = await updatePublishedCatalogGame(resolved.game.id, nextDraft);
  if ("error" in saved) return saved;
  const next = await reviewStoredCoverCandidate({
    identity,
    candidateId: candidate.id,
    status: "approved",
    reviewedBy: input.reviewedBy,
    publishedCoverUrl: uploaded.coverUrl,
  });
  if ("error" in next) return next;
  return { ok: true, stored: next, coverUrl: uploaded.coverUrl };
}
