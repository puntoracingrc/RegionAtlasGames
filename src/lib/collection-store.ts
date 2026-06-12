import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import type { CatalogGame, CollectionItem, CollectionView } from "./types";
import { enrichCollectionItem, getCatalogGame } from "./catalog";
import { slugify } from "./slug";

const COLLECTIONS_DIR = path.join(process.cwd(), "data", "collections");

export type CollectionSummary = {
  totalItems: number;
  retroItems: number;
  outOfScopeItems: number;
  totalUnits: number;
  withEsPrice: number;
  pendingEsPrice: number;
  totalRecommendedValue: number;
  totalBuyValue: number;
};

export type UserCollectionFile = {
  userId: string;
  importedAt: string | null;
  source: string | null;
  items: CollectionItem[];
};

function collectionPath(userId: string): string {
  return path.join(COLLECTIONS_DIR, `${userId}.json`);
}

function ensureDir() {
  if (!existsSync(COLLECTIONS_DIR)) {
    mkdirSync(COLLECTIONS_DIR, { recursive: true });
  }
}

export function readUserCollection(userId: string): UserCollectionFile {
  ensureDir();
  const file = collectionPath(userId);
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as UserCollectionFile;
  } catch {
    return { userId, importedAt: null, source: null, items: [] };
  }
}

export function writeUserCollection(data: UserCollectionFile): void {
  ensureDir();
  writeFileSync(collectionPath(data.userId), JSON.stringify(data, null, 2), "utf-8");
}

export function getUserCollectionViews(userId: string): CollectionView[] {
  return readUserCollection(userId).items.map(enrichCollectionItem);
}

export function getUserCollectionItem(
  userId: string,
  itemId: string,
): CollectionView | undefined {
  const item = readUserCollection(userId).items.find((i) => i.id === itemId);
  return item ? enrichCollectionItem(item) : undefined;
}

export function summarizeCollection(items: CollectionItem[]): CollectionSummary {
  const retroItems = items.filter((i) => i.inRetroCatalog);
  const withEs = items.filter((i) => i.hasEsPrice);

  return {
    totalItems: items.length,
    retroItems: retroItems.length,
    outOfScopeItems: items.length - retroItems.length,
    totalUnits: items.reduce((s, i) => s + i.quantity, 0),
    withEsPrice: withEs.length,
    pendingEsPrice: items.length - withEs.length,
    totalRecommendedValue: Math.round(
      withEs.reduce((s, i) => s + (i.totalValue ?? 0), 0) * 100,
    ) / 100,
    totalBuyValue: Math.round(
      items.reduce((s, i) => s + (i.buyPrice ?? 0) * i.quantity, 0) * 100,
    ) / 100,
  };
}

export function saveUserCollectionItems(
  userId: string,
  items: CollectionItem[],
  meta: { source: string | null },
): UserCollectionFile {
  const data: UserCollectionFile = {
    userId,
    importedAt: new Date().toISOString(),
    source: meta.source,
    items,
  };
  writeUserCollection(data);
  return data;
}

export function getOwnedCatalogIds(userId: string): string[] {
  return readUserCollection(userId).items
    .map((i) => i.catalogId)
    .filter((id): id is string => Boolean(id));
}

export function isCatalogGameOwned(userId: string, catalogId: string): boolean {
  return readUserCollection(userId).items.some((i) => i.catalogId === catalogId);
}

export function countCatalogGameOwned(userId: string, catalogId: string): number {
  return readUserCollection(userId).items.filter((i) => i.catalogId === catalogId).length;
}

function uniqueItemId(items: CollectionItem[], title: string): string {
  const base = slugify(title);
  if (!items.some((i) => i.id === base)) return base;
  let n = 2;
  while (items.some((i) => i.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function catalogGameToCollectionItem(game: CatalogGame, items: CollectionItem[]): CollectionItem {
  const rec = game.recommendedPrice;
  return {
    id: uniqueItemId(items, game.title),
    catalogId: game.id,
    inRetroCatalog: true,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    sealed: false,
    quantity: 1,
    quantityPc: null,
    buyPrice: null,
    previousSalePrice: null,
    totalValue: rec,
    notes: null,
    marketMin: game.marketMin,
    marketMax: game.marketMax,
    recommendedPrice: game.recommendedPrice,
    pcRefPrice: game.pcRefPrice,
    deltaEsVsPc: game.deltaEsVsPc,
    priceSource: game.priceSource,
    updatedAt: game.updatedAt,
    hasEsPrice: game.hasEsPrice,
    priceRegionVerified: game.priceRegionVerified,
    cexSellPrice: game.cexSellPrice ?? null,
    cexCashPrice: game.cexCashPrice ?? null,
    cexProductUrl: game.cexProductUrl ?? null,
    cexMatchedAt: game.cexMatchedAt ?? null,
    cexRegionVerified: game.cexRegionVerified,
  };
}

export function addCatalogGameToCollection(
  userId: string,
  catalogId: string,
): { item: CollectionItem } | { error: string } {
  const game = getCatalogGame(catalogId);
  if (!game || game.listingStatus === "excluded") {
    return { error: "Juego no encontrado en el catálogo." };
  }

  const file = readUserCollection(userId);
  if (file.items.some((i) => i.catalogId === catalogId)) {
    return { error: "Ya está en tu colección." };
  }

  const item = catalogGameToCollectionItem(game, file.items);
  file.items.push(item);
  writeUserCollection(file);
  return { item };
}

export function removeCatalogGameFromCollection(
  userId: string,
  catalogId: string,
): { removed: number } | { error: string } {
  const file = readUserCollection(userId);
  const before = file.items.length;
  file.items = file.items.filter((i) => i.catalogId !== catalogId);
  if (file.items.length === before) {
    return { error: "No está en tu colección." };
  }
  writeUserCollection(file);
  return { removed: before - file.items.length };
}
