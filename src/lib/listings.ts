import { randomUUID } from "crypto";
import { getCatalogGame } from "./catalog";
import { getUserCollectionItem } from "./collection-store";
import {
  mutateMarketplaceDocument,
  readMarketplaceDocument,
} from "./marketplace-document-store";
import type {
  AiListingAnalysis,
  ListingPhoto,
  MarketplaceListing,
  RecordedPrivateSale,
} from "./marketplace-types";
import { photosReadyForPublish } from "./listing-photos";

const LISTINGS_DOCUMENT = "listings.json";
const SALES_DOCUMENT = "recorded-sales.json";

async function readListings(): Promise<MarketplaceListing[]> {
  return readMarketplaceDocument<MarketplaceListing>(LISTINGS_DOCUMENT);
}

async function mutateListings<R>(
  mutation: Parameters<typeof mutateMarketplaceDocument<MarketplaceListing, R>>[1],
): Promise<R> {
  return mutateMarketplaceDocument<MarketplaceListing, R>(LISTINGS_DOCUMENT, mutation);
}

async function mutateSales<R>(
  mutation: Parameters<typeof mutateMarketplaceDocument<RecordedPrivateSale, R>>[1],
): Promise<R> {
  return mutateMarketplaceDocument<RecordedPrivateSale, R>(SALES_DOCUMENT, mutation);
}

export async function getListing(id: string): Promise<MarketplaceListing | undefined> {
  return (await readListings()).find((l) => l.id === id);
}

export async function getActiveListingsForCatalog(catalogId: string): Promise<MarketplaceListing[]> {
  return (await readListings()).filter((l) => l.catalogId === catalogId && l.status === "active");
}

export async function countActiveListingsForCatalog(catalogId: string): Promise<number> {
  return (await getActiveListingsForCatalog(catalogId)).length;
}

/** Mapa catalogId → nº de anuncios activos (solo status active). */
export async function getActiveListingCountsByCatalog(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const listing of await readListings()) {
    if (listing.status !== "active") continue;
    counts[listing.catalogId] = (counts[listing.catalogId] ?? 0) + 1;
  }
  return counts;
}

export async function getSellerOpenListing(
  sellerId: string,
  catalogId: string,
): Promise<MarketplaceListing | undefined> {
  return (await readListings()).find(
    (l) =>
      l.sellerId === sellerId &&
      l.catalogId === catalogId &&
      (l.status === "active" || l.status === "draft"),
  );
}

export async function sellerHasOpenListing(sellerId: string, catalogId: string): Promise<boolean> {
  return (await getSellerOpenListing(sellerId, catalogId)) != null;
}

export async function getSellerListings(sellerId: string): Promise<MarketplaceListing[]> {
  return (await readListings()).filter((l) => l.sellerId === sellerId);
}

export async function countActiveListingsForCollectionItem(
  sellerId: string,
  collectionItemId: string,
): Promise<number> {
  return (await readListings()).filter(
    (l) =>
      l.sellerId === sellerId &&
      l.collectionItemId === collectionItemId &&
      (l.status === "active" || l.status === "draft"),
  ).length;
}

export async function createListingDraft(input: {
  sellerId: string;
  sellerName: string;
  sellerCity?: string | null;
  collectionItemId: string;
}): Promise<MarketplaceListing | { error: string; existingListingId?: string }> {
  const item = await getUserCollectionItem(input.sellerId, input.collectionItemId);
  if (!item?.catalogId) {
    return { error: "Solo puedes vender juegos enlazados al catálogo." };
  }

  const game = getCatalogGame(item.catalogId);
  const now = new Date().toISOString();
  const listing: MarketplaceListing = {
    id: randomUUID(),
    catalogId: item.catalogId,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    sellerCity: input.sellerCity?.trim() || null,
    collectionItemId: input.collectionItemId,
    title: item.title,
    customTitle: null,
    customDescription: null,
    saleOptions: {
      pickup: true,
      shipping: true,
    },
    platformSlug: item.platformSlug,
    region: item.region,
    status: "draft",
    photos: [],
    aiAnalysis: null,
    sealed: item.sealed,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    soldToUserId: null,
    soldToUserName: null,
    sellerConfirmedAt: null,
    buyerConfirmedAt: null,
    recordedSalePriceEur: game?.recommendedPrice ?? item.recommendedPrice ?? null,
  };

  return mutateListings<
    MarketplaceListing | { error: string; existingListingId?: string }
  >((listings) => {
    const existing = listings.find(
      (stored) =>
        stored.sellerId === input.sellerId &&
        stored.catalogId === item.catalogId &&
        (stored.status === "active" || stored.status === "draft"),
    );
    if (existing) {
      return {
        next: listings,
        result: {
          error: "Ya tienes un anuncio abierto para este juego (máx. 1 unidad).",
          existingListingId: existing.id,
        },
        changed: false,
      };
    }
    listings.push(listing);
    return { next: listings, result: listing };
  });
}

export async function updateListing(
  id: string,
  patch: Partial<MarketplaceListing>,
): Promise<MarketplaceListing | null> {
  return mutateListings<MarketplaceListing | null>((listings) => {
    const idx = listings.findIndex((listing) => listing.id === id);
    if (idx === -1) return { next: listings, result: null, changed: false };
    listings[idx] = { ...listings[idx], ...patch, updatedAt: new Date().toISOString() };
    return { next: listings, result: listings[idx] };
  });
}

export async function upsertListingPhoto(
  id: string,
  sellerId: string,
  photo: ListingPhoto,
): Promise<{ photo: ListingPhoto } | { error: string }> {
  return mutateListings<{ photo: ListingPhoto } | { error: string }>((listings) => {
    const idx = listings.findIndex((listing) => listing.id === id);
    const listing = listings[idx];
    if (!listing || listing.sellerId !== sellerId) {
      return {
        next: listings,
        result: { error: "Anuncio no encontrado." } as const,
        changed: false,
      };
    }
    if (listing.status === "sold" || listing.status === "cancelled") {
      return {
        next: listings,
        result: { error: "Anuncio cerrado." } as const,
        changed: false,
      };
    }

    const photos = listing.photos.filter((stored) => stored.slot !== photo.slot);
    photos.push(photo);
    listings[idx] = {
      ...listing,
      photos,
      status: listing.status === "active" ? "draft" : listing.status,
      updatedAt: new Date().toISOString(),
    };
    return { next: listings, result: { photo } };
  });
}

export async function publishListing(id: string, sellerId: string): Promise<{ ok: true } | { error: string }> {
  return mutateListings<{ ok: true } | { error: string }>((listings) => {
    const idx = listings.findIndex((listing) => listing.id === id);
    const listing = listings[idx];
    if (!listing || listing.sellerId !== sellerId) {
      return {
        next: listings,
        result: { error: "Anuncio no encontrado." } as const,
        changed: false,
      };
    }
    if (!photosReadyForPublish(listing.photos)) {
      return {
        next: listings,
        result: { error: "Sube todas las fotos obligatorias antes de publicar." } as const,
        changed: false,
      };
    }
    if (!listing.aiAnalysis) {
      return {
        next: listings,
        result: { error: "Ejecuta el análisis IA antes de publicar." } as const,
        changed: false,
      };
    }
    listings[idx] = {
      ...listing,
      status: "active",
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { next: listings, result: { ok: true } as const };
  });
}

export async function cancelListing(id: string, sellerId: string): Promise<boolean> {
  return mutateListings<boolean>((listings) => {
    const idx = listings.findIndex((listing) => listing.id === id);
    const listing = listings[idx];
    if (!listing || listing.sellerId !== sellerId || listing.status === "sold") {
      return { next: listings, result: false, changed: false };
    }
    listings[idx] = {
      ...listing,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    };
    return { next: listings, result: true };
  });
}

export async function markListingSold(input: {
  listingId: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  priceEur: number;
}): Promise<{ ok: true } | { error: string }> {
  if (!input.buyerId.trim()) return { error: "Comprador no válido." };
  if (!Number.isFinite(input.priceEur) || input.priceEur <= 0) {
    return { error: "Indica un precio final válido (mayor que 0 €)." };
  }

  return mutateListings<{ ok: true } | { error: string }>((listings) => {
    const idx = listings.findIndex((listing) => listing.id === input.listingId);
    const listing = listings[idx];
    if (!listing || listing.sellerId !== input.sellerId) {
      return {
        next: listings,
        result: { error: "Anuncio no encontrado." } as const,
        changed: false,
      };
    }
    if (listing.status !== "active") {
      return {
        next: listings,
        result: { error: "El anuncio no está activo." } as const,
        changed: false,
      };
    }
    listings[idx] = {
      ...listing,
      status: "sold",
      soldToUserId: input.buyerId,
      soldToUserName: input.buyerName,
      sellerConfirmedAt: new Date().toISOString(),
      recordedSalePriceEur: Math.round(input.priceEur * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
    return { next: listings, result: { ok: true } as const };
  });
}

export async function confirmBuyerReceipt(input: {
  listingId: string;
  buyerId: string;
}): Promise<{ ok: true; recorded: boolean } | { error: string }> {
  const confirmed = await mutateListings<
    { listing: MarketplaceListing } | { error: string }
  >((listings) => {
    const idx = listings.findIndex((listing) => listing.id === input.listingId);
    const listing = listings[idx];
    if (!listing || listing.soldToUserId !== input.buyerId) {
      return {
        next: listings,
        result: { error: "No puedes confirmar esta venta." } as const,
        changed: false,
      };
    }
    if (!listing.sellerConfirmedAt) {
      return {
        next: listings,
        result: { error: "El vendedor aún no ha marcado la venta." } as const,
        changed: false,
      };
    }
    if (listing.buyerConfirmedAt) {
      return { next: listings, result: { listing }, changed: false };
    }
    const updated = {
      ...listing,
      buyerConfirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    listings[idx] = updated;
    return { next: listings, result: { listing: updated } };
  });

  if ("error" in confirmed) return confirmed;
  const listing = confirmed.listing;
  if (!listing.buyerConfirmedAt || listing.recordedSalePriceEur == null) {
    return { ok: true, recorded: false };
  }

  const recorded = await mutateSales((sales) => {
    if (sales.some((sale) => sale.id === listing.id)) {
      return { next: sales, result: false, changed: false };
    }
    sales.push({
      id: listing.id,
      catalogId: listing.catalogId,
      priceEur: listing.recordedSalePriceEur!,
      conditionScore: listing.aiAnalysis?.conditionScore ?? null,
      sealed: listing.sealed,
      completedAt: listing.buyerConfirmedAt!,
    });
    return { next: sales, result: true };
  });

  return { ok: true, recorded };
}

export async function setListingAiAnalysis(
  listingId: string,
  analysis: AiListingAnalysis,
): Promise<MarketplaceListing | null> {
  return updateListing(listingId, { aiAnalysis: analysis });
}

export function getPublicSellerListing(listing: MarketplaceListing) {
  return {
    id: listing.id,
    sellerName: listing.sellerName,
    sellerCity: listing.sellerCity ?? null,
    title: listing.customTitle || listing.title,
    sealed: listing.sealed,
    region: listing.region,
    saleOptions: listing.saleOptions ?? { pickup: true, shipping: true },
    aiAnalysis: listing.aiAnalysis
      ? {
          conditionVerdict: listing.aiAnalysis.conditionVerdict,
          conditionScore: listing.aiAnalysis.conditionScore,
          estimatedPriceEur: listing.aiAnalysis.estimatedPriceEur,
          visualDescription: listing.aiAnalysis.visualDescription ?? null,
          gameMatchVerdict: listing.aiAnalysis.gameMatchVerdict ?? null,
          gameMatchConfidence: listing.aiAnalysis.gameMatchConfidence ?? null,
        }
      : null,
    photoCount: listing.photos.length,
    publishedAt: listing.publishedAt,
  };
}
