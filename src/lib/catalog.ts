import catalogData from "../../data/catalog.json";
import collectionData from "../../data/collection.json";
import metaData from "../../data/meta.json";
import platformsData from "../../data/platforms.json";
import type {
  CatalogGame,
  CatalogMeta,
  CollectionItem,
  CollectionView,
  Platform,
} from "./types";

export const platforms = platformsData as Platform[];
export const catalog = catalogData as CatalogGame[];
export const collection = collectionData as CollectionItem[];
export const meta = metaData as CatalogMeta;

export function isListedGame(game: CatalogGame): boolean {
  return game.listingStatus !== "excluded";
}

export const listedCatalog = catalog.filter(isListedGame);

const catalogById = new Map(catalog.map((g) => [g.id, g]));
const platformBySlug = new Map(platforms.map((p) => [p.slug, p]));

export function getPlatform(slug: string): Platform | undefined {
  return platformBySlug.get(slug);
}

export function getCatalogGame(id: string): CatalogGame | undefined {
  return catalogById.get(id);
}

export function getCollectionItem(id: string): CollectionView | undefined {
  const item = collection.find((c) => c.id === id);
  if (!item) return undefined;
  return enrichCollectionItem(item);
}

export function enrichCollectionItem(item: CollectionItem): CollectionView {
  const cat = item.catalogId ? catalogById.get(item.catalogId) : undefined;
  return {
    ...item,
    coverUrl: cat?.coverUrl ?? null,
    titlePc: cat?.titlePc ?? item.titlePc ?? null,
    pcId: cat?.pcId ?? item.pcImportId ?? null,
  };
}

export function getCollectionViews(): CollectionView[] {
  return collection.map(enrichCollectionItem);
}

export function getCatalogByPlatform(slug: string): CatalogGame[] {
  return listedCatalog.filter((g) => g.platformSlug === slug);
}

export function getCollectionByPlatform(slug: string): CollectionView[] {
  return getCollectionViews().filter((c) => c.platformSlug === slug);
}

export function getPlatformStats(slug: string, ownedItems: CollectionView[] = []) {
  const platform = getPlatform(slug);
  const listed = meta.listedByPlatform[slug] ?? 0;
  const owned = ownedItems.filter((c) => c.platformSlug === slug).length;
  const estimated = platform?.estimatedCatalogSize ?? 0;
  const completion = estimated > 0 ? Math.round((owned / estimated) * 100) : 0;

  return { platform, listed, owned, estimated, completion };
}

export function formatEur(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDelta(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function statusLabel(status: Platform["status"]): string {
  return status === "semi-closed" ? "Semi-cerrada" : "Cerrada";
}

/** Compat legacy */
export const games = getCollectionViews();
