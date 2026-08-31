import catalogData from "../../data/catalog.json";
import catalogIdAliasesData from "../../data/catalog-id-aliases.json";
import collectionData from "../../data/collection.json";
import metaData from "../../data/meta.json";
import platformsData from "../../data/platforms.json";
import { primaryConditionPrice } from "./condition-prices";
import { getRegionDisplay } from "@/lib/region-display";
import { regionSortRank } from "@/lib/platform-catalog-insights";
import { normalizeCatalogGamePresentation } from "./catalog-presentation";
import { resolveEncodedCatalogIdParam } from "./catalog-id-param";
import type {
  CatalogGame,
  CatalogMeta,
  CollectionItem,
  CollectionView,
  Platform,
} from "./types";

export const platforms = platformsData as Platform[];
export const catalog = (catalogData as CatalogGame[]).map(normalizeCatalogGamePresentation);
export const collection = collectionData as CollectionItem[];
export const meta = metaData as CatalogMeta;

export function isListedGame(game: CatalogGame): boolean {
  return game.listingStatus !== "excluded";
}

export const listedCatalog = catalog.filter(isListedGame);

const catalogById = new Map(catalog.map((g) => [g.id, g]));
const catalogIdAliases = new Map(Object.entries(catalogIdAliasesData as Record<string, string>));
const platformBySlug = new Map(platforms.map((p) => [p.slug, p]));

export function getPlatform(slug: string): Platform | undefined {
  return platformBySlug.get(slug);
}

export function isPublicPlatformSlug(slug: string): boolean {
  return getPlatform(slug)?.active !== false;
}

export function isPublicCatalogGame(game: CatalogGame): boolean {
  return isPublicPlatformSlug(game.platformSlug);
}

export const publicListedCatalog = listedCatalog.filter(isPublicCatalogGame);

export function getCatalogGame(id: string): CatalogGame | undefined {
  return catalogById.get(id) ?? catalogById.get(catalogIdAliases.get(id) ?? "");
}

export function resolveCatalogIdParam(value: string): string {
  const resolved = resolveEncodedCatalogIdParam(
    value,
    (candidate) => catalogById.has(candidate) || catalogIdAliases.has(candidate),
  );
  return catalogIdAliases.get(resolved) ?? resolved;
}

export function getCollectionItem(id: string): CollectionView | undefined {
  const item = collection.find((c) => c.id === id);
  if (!item) return undefined;
  return enrichCollectionItem(item);
}

export function enrichCollectionItem(item: CollectionItem): CollectionView {
  const cat = item.catalogId ? getCatalogGame(item.catalogId) : undefined;
  const quantity = Math.max(1, item.quantity || 1);
  const catalogUnitPrice = cat
    ? item.sealed
      ? cat.estimatedPriceSealed ?? primaryConditionPrice(cat) ?? cat.recommendedPrice
      : primaryConditionPrice(cat) ?? cat.recommendedPrice
    : null;
  const storedUnitPrice =
    item.recommendedPrice ??
    (item.totalValue != null ? item.totalValue / quantity : null);
  const currentUnitPrice = catalogUnitPrice ?? storedUnitPrice;

  return {
    ...item,
    catalogMatched: Boolean(item.catalogMatched && cat),
    title: cat?.title ?? item.title,
    coverUrl: cat?.coverUrl ?? null,
    titlePc: cat?.titlePc ?? item.titlePc ?? null,
    pcId: cat?.pcId ?? item.pcImportId ?? null,
    marketMin: cat?.marketMin ?? item.marketMin,
    marketMax: cat?.marketMax ?? item.marketMax,
    recommendedPrice: currentUnitPrice,
    estimatedPriceLoose: cat?.estimatedPriceLoose ?? item.estimatedPriceLoose ?? null,
    estimatedPriceGameManual:
      cat?.estimatedPriceGameManual ?? item.estimatedPriceGameManual ?? null,
    estimatedPriceComplete:
      cat?.estimatedPriceComplete ?? item.estimatedPriceComplete ?? null,
    estimatedPriceSealed: cat?.estimatedPriceSealed ?? item.estimatedPriceSealed ?? null,
    estimatedPriceNewRetail:
      cat?.estimatedPriceNewRetail ?? item.estimatedPriceNewRetail ?? null,
    priceDataSources: cat?.priceDataSources ?? item.priceDataSources ?? null,
    priceSource: cat?.priceSource ?? item.priceSource,
    updatedAt: cat?.updatedAt ?? item.updatedAt,
    hasEsPrice: currentUnitPrice != null,
    priceRegionVerified:
      catalogUnitPrice != null ? cat?.priceRegionVerified : item.priceRegionVerified,
    totalValue:
      currentUnitPrice != null
        ? Math.round(currentUnitPrice * quantity * 100) / 100
        : null,
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

export function getPlatformRegions(slug: string): string[] {
  const regions = new Set(
    listedCatalog
      .filter((game) => game.platformSlug === slug && game.region?.trim())
      .map((game) => getRegionDisplay(game.region).label),
  );

  return [...regions].sort((a, b) => {
    const rankDiff = regionSortRank(a) - regionSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, "es");
  });
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
  if (status === "open") return "Abierta";
  return status === "semi-closed" ? "Semi-cerrada" : "Cerrada";
}

/** Compat legacy */
export const games = getCollectionViews();
