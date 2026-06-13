import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getCatalogGame } from "./catalog";
import { getUserCollectionItem } from "./collection-store";
import type {
  AiListingAnalysis,
  MarketplaceListing,
  RecordedPrivateSale,
} from "./marketplace-types";
import { photosReadyForPublish } from "./listing-photos";

const MARKET_DIR = path.join(process.cwd(), "data", "marketplace");
const LISTINGS_FILE = path.join(MARKET_DIR, "listings.json");
const SALES_FILE = path.join(MARKET_DIR, "recorded-sales.json");

function ensureDir() {
  try {
    if (!existsSync(MARKET_DIR)) mkdirSync(MARKET_DIR, { recursive: true });
  } catch {
    // Vercel: filesystem de solo lectura salvo /tmp
  }
}

function readListings(): MarketplaceListing[] {
  ensureDir();
  try {
    return JSON.parse(readFileSync(LISTINGS_FILE, "utf-8")) as MarketplaceListing[];
  } catch {
    return [];
  }
}

function writeListings(listings: MarketplaceListing[]) {
  ensureDir();
  writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2), "utf-8");
}

function readSales(): RecordedPrivateSale[] {
  ensureDir();
  try {
    return JSON.parse(readFileSync(SALES_FILE, "utf-8")) as RecordedPrivateSale[];
  } catch {
    return [];
  }
}

function writeSales(sales: RecordedPrivateSale[]) {
  ensureDir();
  writeFileSync(SALES_FILE, JSON.stringify(sales, null, 2), "utf-8");
}

export function getListing(id: string): MarketplaceListing | undefined {
  return readListings().find((l) => l.id === id);
}

export function getActiveListingsForCatalog(catalogId: string): MarketplaceListing[] {
  return readListings().filter((l) => l.catalogId === catalogId && l.status === "active");
}

export function countActiveListingsForCatalog(catalogId: string): number {
  return getActiveListingsForCatalog(catalogId).length;
}

/** Mapa catalogId → nº de anuncios activos (solo status active). */
export function getActiveListingCountsByCatalog(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const listing of readListings()) {
    if (listing.status !== "active") continue;
    counts[listing.catalogId] = (counts[listing.catalogId] ?? 0) + 1;
  }
  return counts;
}

export function getSellerOpenListing(
  sellerId: string,
  catalogId: string,
): MarketplaceListing | undefined {
  return readListings().find(
    (l) =>
      l.sellerId === sellerId &&
      l.catalogId === catalogId &&
      (l.status === "active" || l.status === "draft"),
  );
}

export function sellerHasOpenListing(sellerId: string, catalogId: string): boolean {
  return getSellerOpenListing(sellerId, catalogId) != null;
}

export function getSellerListings(sellerId: string): MarketplaceListing[] {
  return readListings().filter((l) => l.sellerId === sellerId);
}

export function countActiveListingsForCollectionItem(
  sellerId: string,
  collectionItemId: string,
): number {
  return readListings().filter(
    (l) =>
      l.sellerId === sellerId &&
      l.collectionItemId === collectionItemId &&
      (l.status === "active" || l.status === "draft"),
  ).length;
}

export function createListingDraft(input: {
  sellerId: string;
  sellerName: string;
  collectionItemId: string;
}): MarketplaceListing | { error: string; existingListingId?: string } {
  const item = getUserCollectionItem(input.sellerId, input.collectionItemId);
  if (!item?.catalogId) {
    return { error: "Solo puedes vender juegos enlazados al catálogo." };
  }

  const existing = getSellerOpenListing(input.sellerId, item.catalogId);
  if (existing) {
    return {
      error: "Ya tienes un anuncio abierto para este juego (máx. 1 unidad).",
      existingListingId: existing.id,
    };
  }

  const game = getCatalogGame(item.catalogId);
  const now = new Date().toISOString();
  const listing: MarketplaceListing = {
    id: randomUUID(),
    catalogId: item.catalogId,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    collectionItemId: input.collectionItemId,
    title: item.title,
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

  const listings = readListings();
  listings.push(listing);
  writeListings(listings);
  return listing;
}

export function updateListing(
  id: string,
  patch: Partial<MarketplaceListing>,
): MarketplaceListing | null {
  const listings = readListings();
  const idx = listings.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  listings[idx] = { ...listings[idx], ...patch, updatedAt: new Date().toISOString() };
  writeListings(listings);
  return listings[idx];
}

export function publishListing(id: string, sellerId: string): { ok: true } | { error: string } {
  const listing = getListing(id);
  if (!listing || listing.sellerId !== sellerId) return { error: "Anuncio no encontrado." };
  if (!photosReadyForPublish(listing.photos)) {
    return { error: "Sube todas las fotos obligatorias antes de publicar." };
  }
  if (!listing.aiAnalysis) {
    return { error: "Ejecuta el análisis IA antes de publicar." };
  }
  updateListing(id, { status: "active", publishedAt: new Date().toISOString() });
  return { ok: true };
}

export function cancelListing(id: string, sellerId: string): boolean {
  const listing = getListing(id);
  if (!listing || listing.sellerId !== sellerId) return false;
  if (listing.status === "sold") return false;
  updateListing(id, { status: "cancelled" });
  return true;
}

export function markListingSold(input: {
  listingId: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  priceEur: number;
}): { ok: true } | { error: string } {
  const listing = getListing(input.listingId);
  if (!listing || listing.sellerId !== input.sellerId) return { error: "Anuncio no encontrado." };
  if (listing.status !== "active") return { error: "El anuncio no está activo." };
  if (!input.buyerId.trim()) return { error: "Comprador no válido." };
  if (!Number.isFinite(input.priceEur) || input.priceEur <= 0) {
    return { error: "Indica un precio final válido (mayor que 0 €)." };
  }

  updateListing(input.listingId, {
    status: "sold",
    soldToUserId: input.buyerId,
    soldToUserName: input.buyerName,
    sellerConfirmedAt: new Date().toISOString(),
    recordedSalePriceEur: Math.round(input.priceEur * 100) / 100,
  });
  return { ok: true };
}

export function confirmBuyerReceipt(input: {
  listingId: string;
  buyerId: string;
}): { ok: true; recorded: boolean } | { error: string } {
  const listing = getListing(input.listingId);
  if (!listing || listing.soldToUserId !== input.buyerId) {
    return { error: "No puedes confirmar esta venta." };
  }
  if (!listing.sellerConfirmedAt) {
    return { error: "El vendedor aún no ha marcado la venta." };
  }
  if (listing.buyerConfirmedAt) {
    return { ok: true, recorded: false };
  }

  updateListing(input.listingId, {
    buyerConfirmedAt: new Date().toISOString(),
  });

  const refreshed = getListing(input.listingId)!;
  let recorded = false;
  if (
    refreshed.sellerConfirmedAt &&
    refreshed.buyerConfirmedAt &&
    refreshed.recordedSalePriceEur != null
  ) {
    const sales = readSales();
    const alreadyRecorded = sales.some(
      (s) =>
        s.catalogId === refreshed.catalogId &&
        s.priceEur === refreshed.recordedSalePriceEur &&
        Math.abs(new Date(s.completedAt).getTime() - new Date(refreshed.buyerConfirmedAt!).getTime()) <
          60_000,
    );
    if (!alreadyRecorded) {
      sales.push({
        id: randomUUID(),
        catalogId: refreshed.catalogId,
        priceEur: refreshed.recordedSalePriceEur,
        conditionScore: refreshed.aiAnalysis?.conditionScore ?? null,
        sealed: refreshed.sealed,
        completedAt: new Date().toISOString(),
      });
      writeSales(sales);
      recorded = true;
    }
  }

  return { ok: true, recorded };
}

export function setListingAiAnalysis(
  listingId: string,
  analysis: AiListingAnalysis,
): MarketplaceListing | null {
  return updateListing(listingId, { aiAnalysis: analysis });
}

export function getPublicSellerListing(listing: MarketplaceListing) {
  return {
    id: listing.id,
    sellerName: listing.sellerName,
    sealed: listing.sealed,
    region: listing.region,
    aiAnalysis: listing.aiAnalysis
      ? {
          conditionVerdict: listing.aiAnalysis.conditionVerdict,
          estimatedPriceEur: listing.aiAnalysis.estimatedPriceEur,
        }
      : null,
    photoCount: listing.photos.length,
    publishedAt: listing.publishedAt,
  };
}
