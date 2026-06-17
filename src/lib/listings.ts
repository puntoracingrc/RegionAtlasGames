import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { get, put } from "@vercel/blob";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
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
const LISTINGS_BLOB_PATH = "region-atlas/marketplace/listings.json";
const SALES_BLOB_PATH = "region-atlas/marketplace/recorded-sales.json";

function useBlobStorage(): boolean {
  if (process.env.VERCEL) return blobAuthConfigured();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function ensureDir() {
  try {
    if (!existsSync(MARKET_DIR)) mkdirSync(MARKET_DIR, { recursive: true });
  } catch {
    // Vercel: filesystem de solo lectura salvo /tmp
  }
}

function readLocalJson<T>(file: string, fallback: T): T {
  ensureDir();
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeLocalJson(file: string, data: unknown) {
  ensureDir();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

async function readBlobJson<T>(blobPath: string, fallback: T): Promise<T> {
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(blobPath, { ...auth, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return fallback;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch {
    return fallback;
  }
}

async function writeBlobJson(blobPath: string, data: unknown) {
  const auth = await blobAuthOptions("private");
  await put(blobPath, JSON.stringify(data, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 30,
  });
}

async function readListings(): Promise<MarketplaceListing[]> {
  if (useBlobStorage()) return readBlobJson(LISTINGS_BLOB_PATH, []);
  return readLocalJson(LISTINGS_FILE, []);
}

async function writeListings(listings: MarketplaceListing[]) {
  if (useBlobStorage()) return writeBlobJson(LISTINGS_BLOB_PATH, listings);
  writeLocalJson(LISTINGS_FILE, listings);
}

async function readSales(): Promise<RecordedPrivateSale[]> {
  if (useBlobStorage()) return readBlobJson(SALES_BLOB_PATH, []);
  return readLocalJson(SALES_FILE, []);
}

async function writeSales(sales: RecordedPrivateSale[]) {
  if (useBlobStorage()) return writeBlobJson(SALES_BLOB_PATH, sales);
  writeLocalJson(SALES_FILE, sales);
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

  const existing = await getSellerOpenListing(input.sellerId, item.catalogId);
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

  const listings = await readListings();
  listings.push(listing);
  await writeListings(listings);
  return listing;
}

export async function updateListing(
  id: string,
  patch: Partial<MarketplaceListing>,
): Promise<MarketplaceListing | null> {
  const listings = await readListings();
  const idx = listings.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  listings[idx] = { ...listings[idx], ...patch, updatedAt: new Date().toISOString() };
  await writeListings(listings);
  return listings[idx];
}

export async function publishListing(id: string, sellerId: string): Promise<{ ok: true } | { error: string }> {
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== sellerId) return { error: "Anuncio no encontrado." };
  if (!photosReadyForPublish(listing.photos)) {
    return { error: "Sube todas las fotos obligatorias antes de publicar." };
  }
  if (!listing.aiAnalysis) {
    return { error: "Ejecuta el análisis IA antes de publicar." };
  }
  await updateListing(id, { status: "active", publishedAt: new Date().toISOString() });
  return { ok: true };
}

export async function cancelListing(id: string, sellerId: string): Promise<boolean> {
  const listing = await getListing(id);
  if (!listing || listing.sellerId !== sellerId) return false;
  if (listing.status === "sold") return false;
  await updateListing(id, { status: "cancelled" });
  return true;
}

export async function markListingSold(input: {
  listingId: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  priceEur: number;
}): Promise<{ ok: true } | { error: string }> {
  const listing = await getListing(input.listingId);
  if (!listing || listing.sellerId !== input.sellerId) return { error: "Anuncio no encontrado." };
  if (listing.status !== "active") return { error: "El anuncio no está activo." };
  if (!input.buyerId.trim()) return { error: "Comprador no válido." };
  if (!Number.isFinite(input.priceEur) || input.priceEur <= 0) {
    return { error: "Indica un precio final válido (mayor que 0 €)." };
  }

  await updateListing(input.listingId, {
    status: "sold",
    soldToUserId: input.buyerId,
    soldToUserName: input.buyerName,
    sellerConfirmedAt: new Date().toISOString(),
    recordedSalePriceEur: Math.round(input.priceEur * 100) / 100,
  });
  return { ok: true };
}

export async function confirmBuyerReceipt(input: {
  listingId: string;
  buyerId: string;
}): Promise<{ ok: true; recorded: boolean } | { error: string }> {
  const listing = await getListing(input.listingId);
  if (!listing || listing.soldToUserId !== input.buyerId) {
    return { error: "No puedes confirmar esta venta." };
  }
  if (!listing.sellerConfirmedAt) {
    return { error: "El vendedor aún no ha marcado la venta." };
  }
  if (listing.buyerConfirmedAt) {
    return { ok: true, recorded: false };
  }

  await updateListing(input.listingId, {
    buyerConfirmedAt: new Date().toISOString(),
  });

  const refreshed = (await getListing(input.listingId))!;
  let recorded = false;
  if (
    refreshed.sellerConfirmedAt &&
    refreshed.buyerConfirmedAt &&
    refreshed.recordedSalePriceEur != null
  ) {
    const sales = await readSales();
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
      await writeSales(sales);
      recorded = true;
    }
  }

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
