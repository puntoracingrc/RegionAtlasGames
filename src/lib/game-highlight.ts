import { listedCatalog } from "./catalog";
import type { CatalogGame, CollectionView } from "./types";
import { getCatalogGame } from "./catalog";

/** Umbral en €: rareza absoluta = precio de mercado (ES o referencia EU). */
export const RARE_PRICE_THRESHOLD_EUR = 100;

/** Máximo de títulos «top cotizado» por consola + región. */
export const TOP_SEGMENT_MAX = 10;

/** Al menos 1 top por segmento; ~5 % del listado con precio. */
export const TOP_SEGMENT_RATIO = 0.05;

type PriceFields = {
  recommendedPrice?: number | null;
  pcRefPrice?: number | null;
  catalogId?: string | null;
  id?: string;
  platformSlug?: string;
  region?: string;
};

function resolveCatalogId(game: CatalogGame | CollectionView | PriceFields): string | null {
  if ("listingStatus" in game && game.id) return game.id;
  if ("catalogId" in game && game.catalogId) return game.catalogId;
  return null;
}

export function getEffectivePrice(
  game: CatalogGame | CollectionView | PriceFields,
): number | null {
  const cat =
    "catalogId" in game && game.catalogId ? getCatalogGame(game.catalogId) : null;

  const recommended = game.recommendedPrice ?? cat?.recommendedPrice ?? null;
  const pcRef = game.pcRefPrice ?? cat?.pcRefPrice ?? null;

  if (recommended == null && pcRef == null) return null;
  return Math.max(recommended ?? 0, pcRef ?? 0);
}

function buildTopSegmentIds(): Set<string> {
  const segments = new Map<string, { id: string; price: number }[]>();

  for (const game of listedCatalog) {
    const price = getEffectivePrice(game);
    if (price == null || price <= 0) continue;
    const key = `${game.platformSlug}\0${game.region}`;
    const bucket = segments.get(key) ?? [];
    bucket.push({ id: game.id, price });
    segments.set(key, bucket);
  }

  const tops = new Set<string>();
  for (const games of segments.values()) {
    games.sort((a, b) => b.price - a.price);
    const count = Math.min(
      TOP_SEGMENT_MAX,
      Math.max(1, Math.ceil(games.length * TOP_SEGMENT_RATIO)),
    );
    for (let i = 0; i < count && i < games.length; i++) {
      tops.add(games[i].id);
    }
  }
  return tops;
}

const TOP_SEGMENT_IDS = buildTopSegmentIds();

/** Rareza absoluta por precio (≥ umbral €). Contorno dorado. */
export function isGrailGame(game: CatalogGame | CollectionView | PriceFields): boolean {
  const price = getEffectivePrice(game);
  return price != null && price >= RARE_PRICE_THRESHOLD_EUR;
}

/** Top cotizado relativo dentro de su consola y región. Contorno lila. */
export function isTopInSegment(game: CatalogGame | CollectionView | PriceFields): boolean {
  const catalogId = resolveCatalogId(game);
  return catalogId != null && TOP_SEGMENT_IDS.has(catalogId);
}

export function grailLabel(): string {
  return `Alto valor (≥${RARE_PRICE_THRESHOLD_EUR} €)`;
}

export function topSegmentLabel(): string {
  return "Top cotizado · consola y región";
}

export function rarityLabel(price: number | null): string | null {
  if (price == null || price < RARE_PRICE_THRESHOLD_EUR) return null;
  return grailLabel();
}
