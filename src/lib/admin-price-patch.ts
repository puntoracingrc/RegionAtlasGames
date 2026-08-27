import type { CatalogGame } from "./types";

export type AdminPriceFields = Pick<
  CatalogGame,
  | "recommendedPrice"
  | "estimatedPriceLoose"
  | "estimatedPriceGameManual"
  | "estimatedPriceComplete"
  | "estimatedPriceSealed"
  | "estimatedShippingToSpainLoose"
  | "estimatedShippingToSpainGameManual"
  | "estimatedShippingToSpainComplete"
  | "estimatedShippingToSpainSealed"
  | "estimatedTotalToSpainLoose"
  | "estimatedTotalToSpainGameManual"
  | "estimatedTotalToSpainComplete"
  | "estimatedTotalToSpainSealed"
  | "marketMin"
  | "marketMax"
  | "pcRefPrice"
  | "deltaEsVsPc"
  | "priceSource"
  | "priceDataSources"
  | "hasEsPrice"
  | "priceRegionVerified"
  | "cexSellPrice"
  | "cexCashPrice"
  | "cexProductUrl"
  | "jgoRetailPrice"
  | "jgoProductUrl"
  | "cholloRetailPrice"
  | "cholloProductUrl"
  | "kaotoRetailPrice"
  | "kaotoProductUrl"
  | "tcListingPrice"
  | "tcProductUrl"
  | "tcnsRetailPrice"
  | "tcnsProductUrl"
>;

const PRICE_KEYS: (keyof AdminPriceFields)[] = [
  "recommendedPrice",
  "estimatedPriceLoose",
  "estimatedPriceGameManual",
  "estimatedPriceComplete",
  "estimatedPriceSealed",
  "estimatedShippingToSpainLoose",
  "estimatedShippingToSpainGameManual",
  "estimatedShippingToSpainComplete",
  "estimatedShippingToSpainSealed",
  "estimatedTotalToSpainLoose",
  "estimatedTotalToSpainGameManual",
  "estimatedTotalToSpainComplete",
  "estimatedTotalToSpainSealed",
  "marketMin",
  "marketMax",
  "pcRefPrice",
  "deltaEsVsPc",
  "priceSource",
  "priceDataSources",
  "hasEsPrice",
  "priceRegionVerified",
  "cexSellPrice",
  "cexCashPrice",
  "cexProductUrl",
  "jgoRetailPrice",
  "jgoProductUrl",
  "cholloRetailPrice",
  "cholloProductUrl",
  "kaotoRetailPrice",
  "kaotoProductUrl",
  "tcListingPrice",
  "tcProductUrl",
  "tcnsRetailPrice",
  "tcnsProductUrl",
];

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return undefined;
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  return undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

export function priceFieldsFromGame(game: CatalogGame): AdminPriceFields {
  return {
    recommendedPrice: game.recommendedPrice ?? null,
    estimatedPriceLoose: game.estimatedPriceLoose ?? null,
    estimatedPriceGameManual: game.estimatedPriceGameManual ?? null,
    estimatedPriceComplete: game.estimatedPriceComplete ?? null,
    estimatedPriceSealed: game.estimatedPriceSealed ?? null,
    estimatedShippingToSpainLoose: game.estimatedShippingToSpainLoose ?? null,
    estimatedShippingToSpainGameManual: game.estimatedShippingToSpainGameManual ?? null,
    estimatedShippingToSpainComplete: game.estimatedShippingToSpainComplete ?? null,
    estimatedShippingToSpainSealed: game.estimatedShippingToSpainSealed ?? null,
    estimatedTotalToSpainLoose: game.estimatedTotalToSpainLoose ?? null,
    estimatedTotalToSpainGameManual: game.estimatedTotalToSpainGameManual ?? null,
    estimatedTotalToSpainComplete: game.estimatedTotalToSpainComplete ?? null,
    estimatedTotalToSpainSealed: game.estimatedTotalToSpainSealed ?? null,
    marketMin: game.marketMin ?? null,
    marketMax: game.marketMax ?? null,
    pcRefPrice: game.pcRefPrice ?? null,
    deltaEsVsPc: game.deltaEsVsPc ?? null,
    priceSource: game.priceSource ?? null,
    priceDataSources: game.priceDataSources ?? null,
    hasEsPrice: game.hasEsPrice ?? false,
    priceRegionVerified: game.priceRegionVerified ?? false,
    cexSellPrice: game.cexSellPrice ?? null,
    cexCashPrice: game.cexCashPrice ?? null,
    cexProductUrl: game.cexProductUrl ?? null,
    jgoRetailPrice: game.jgoRetailPrice ?? null,
    jgoProductUrl: game.jgoProductUrl ?? null,
    cholloRetailPrice: game.cholloRetailPrice ?? null,
    cholloProductUrl: game.cholloProductUrl ?? null,
    kaotoRetailPrice: game.kaotoRetailPrice ?? null,
    kaotoProductUrl: game.kaotoProductUrl ?? null,
    tcListingPrice: game.tcListingPrice ?? null,
    tcProductUrl: game.tcProductUrl ?? null,
    tcnsRetailPrice: game.tcnsRetailPrice ?? null,
    tcnsProductUrl: game.tcnsProductUrl ?? null,
  };
}

export function applyPricePatch(
  game: CatalogGame,
  body: Partial<Record<string, unknown>>,
): CatalogGame {
  const next: CatalogGame = { ...game };

  for (const key of PRICE_KEYS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (key === "hasEsPrice" || key === "priceRegionVerified") {
      const parsed = parseOptionalBoolean(raw);
      if (parsed !== undefined) next[key] = parsed;
      continue;
    }
    if (
      key === "priceSource" ||
      key === "priceDataSources" ||
      key.endsWith("ProductUrl") ||
      key.endsWith("Url")
    ) {
      const parsed = parseOptionalString(raw);
      if (parsed !== undefined) (next as Record<string, unknown>)[key] = parsed;
      continue;
    }
    const parsed = parseOptionalNumber(raw);
    if (parsed !== undefined) (next as Record<string, unknown>)[key] = parsed;
  }

  next.updatedAt = new Date().toISOString().slice(0, 10);

  const rec = next.recommendedPrice;
  const pc = next.pcRefPrice;
  if (rec != null || pc != null) {
    next.deltaEsVsPc =
      rec != null && pc != null && pc > 0 ? Math.round((rec - pc) * 100) / 100 : next.deltaEsVsPc;
  }

  const bucketPrices = [
    next.estimatedPriceLoose,
    next.estimatedPriceGameManual,
    next.estimatedPriceComplete,
    next.estimatedPriceSealed,
    next.recommendedPrice,
  ].filter((v): v is number => v != null);
  if (bucketPrices.length > 0) {
    if (next.marketMin == null) next.marketMin = Math.min(...bucketPrices);
    if (next.marketMax == null) next.marketMax = Math.max(...bucketPrices);
  }

  if (
    next.recommendedPrice != null ||
    next.estimatedPriceLoose != null ||
    next.estimatedPriceGameManual != null ||
    next.estimatedPriceComplete != null ||
    next.estimatedPriceSealed != null
  ) {
    next.hasEsPrice = true;
  }

  return next;
}

export { PRICE_KEYS };
