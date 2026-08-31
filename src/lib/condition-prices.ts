import type { CatalogGame, CollectionItem } from "./types";

export type ConditionBucket = "loose" | "gameManual" | "complete" | "sealed" | "newRetail";

export const CONDITION_PRICE_LABELS: Record<ConditionBucket, string> = {
  loose: "Suelto",
  gameManual: "Juego + manual",
  complete: "Completo",
  sealed: "Precintado",
  newRetail: "Nuevo en tienda",
};

export const CONDITION_PRICE_SHORT_LABELS: Record<ConditionBucket, string> = {
  loose: "Suelto",
  gameManual: "Jgo. + manual",
  complete: "Completo",
  sealed: "Prec.",
  newRetail: "Nuevo",
};

export const CONDITION_PRICE_DESCRIPTIONS: Record<ConditionBucket, string> = {
  loose: "Cartucho o disco suelto",
  gameManual: "Juego + manual, sin caja",
  complete: "Abierto con todo su contenido original",
  sealed: "Nuevo precintado",
  newRetail: "Producto nuevo; precinto no confirmado",
};

const DISPLAY_ORDER: ConditionBucket[] = ["sealed", "newRetail", "complete", "gameManual", "loose"];

type GameWithConditionPrices = Pick<
  CatalogGame | CollectionItem,
  | "estimatedPriceLoose"
  | "estimatedPriceGameManual"
  | "estimatedPriceComplete"
  | "estimatedPriceSealed"
  | "estimatedPriceNewRetail"
  | "estimatedShippingToSpainLoose"
  | "estimatedShippingToSpainGameManual"
  | "estimatedShippingToSpainComplete"
  | "estimatedShippingToSpainSealed"
  | "estimatedTotalToSpainLoose"
  | "estimatedTotalToSpainGameManual"
  | "estimatedTotalToSpainComplete"
  | "estimatedTotalToSpainSealed"
>;

export type ConditionPriceEntry = {
  bucket: ConditionBucket;
  label: string;
  price: number;
  shippingToSpain: number | null;
  totalToSpain: number | null;
};

export function hasAnyConditionEstimate(game: GameWithConditionPrices): boolean {
  return (
    game.estimatedPriceLoose != null ||
    game.estimatedPriceGameManual != null ||
    game.estimatedPriceComplete != null ||
    game.estimatedPriceSealed != null ||
    game.estimatedPriceNewRetail != null
  );
}

export function conditionPriceEntries(
  game: GameWithConditionPrices,
): ConditionPriceEntry[] {
  const entries: ConditionPriceEntry[] = [];
  if (game.estimatedPriceLoose != null) {
    entries.push({
      bucket: "loose",
      label: CONDITION_PRICE_LABELS.loose,
      price: game.estimatedPriceLoose,
      shippingToSpain: game.estimatedShippingToSpainLoose ?? null,
      totalToSpain: game.estimatedTotalToSpainLoose ?? null,
    });
  }
  if (game.estimatedPriceGameManual != null) {
    entries.push({
      bucket: "gameManual",
      label: CONDITION_PRICE_LABELS.gameManual,
      price: game.estimatedPriceGameManual,
      shippingToSpain: game.estimatedShippingToSpainGameManual ?? null,
      totalToSpain: game.estimatedTotalToSpainGameManual ?? null,
    });
  }
  if (game.estimatedPriceComplete != null) {
    entries.push({
      bucket: "complete",
      label: CONDITION_PRICE_LABELS.complete,
      price: game.estimatedPriceComplete,
      shippingToSpain: game.estimatedShippingToSpainComplete ?? null,
      totalToSpain: game.estimatedTotalToSpainComplete ?? null,
    });
  }
  if (game.estimatedPriceSealed != null) {
    entries.push({
      bucket: "sealed",
      label: CONDITION_PRICE_LABELS.sealed,
      price: game.estimatedPriceSealed,
      shippingToSpain: game.estimatedShippingToSpainSealed ?? null,
      totalToSpain: game.estimatedTotalToSpainSealed ?? null,
    });
  }
  if (game.estimatedPriceNewRetail != null) {
    entries.push({
      bucket: "newRetail",
      label: CONDITION_PRICE_LABELS.newRetail,
      price: game.estimatedPriceNewRetail,
      shippingToSpain: null,
      totalToSpain: null,
    });
  }
  return entries.sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.bucket) - DISPLAY_ORDER.indexOf(b.bucket),
  );
}

/** Precio principal para tarjetas: abierto/completo antes que producto sin abrir. */
export function primaryConditionPrice(game: GameWithConditionPrices): number | null {
  return (
    game.estimatedPriceComplete ??
    game.estimatedPriceGameManual ??
    game.estimatedPriceLoose ??
    game.estimatedPriceSealed ??
    game.estimatedPriceNewRetail ??
    null
  );
}

export function primaryConditionPriceEntry(
  game: GameWithConditionPrices,
): { bucket: ConditionBucket; label: string; shortLabel: string; price: number } | null {
  if (game.estimatedPriceComplete != null) {
    return {
      bucket: "complete",
      label: CONDITION_PRICE_LABELS.complete,
      shortLabel: CONDITION_PRICE_SHORT_LABELS.complete,
      price: game.estimatedPriceComplete,
    };
  }
  if (game.estimatedPriceGameManual != null) {
    return {
      bucket: "gameManual",
      label: CONDITION_PRICE_LABELS.gameManual,
      shortLabel: CONDITION_PRICE_SHORT_LABELS.gameManual,
      price: game.estimatedPriceGameManual,
    };
  }
  if (game.estimatedPriceLoose != null) {
    return {
      bucket: "loose",
      label: CONDITION_PRICE_LABELS.loose,
      shortLabel: CONDITION_PRICE_SHORT_LABELS.loose,
      price: game.estimatedPriceLoose,
    };
  }
  if (game.estimatedPriceSealed != null) {
    return {
      bucket: "sealed",
      label: CONDITION_PRICE_LABELS.sealed,
      shortLabel: CONDITION_PRICE_SHORT_LABELS.sealed,
      price: game.estimatedPriceSealed,
    };
  }
  if (game.estimatedPriceNewRetail != null) {
    return {
      bucket: "newRetail",
      label: CONDITION_PRICE_LABELS.newRetail,
      shortLabel: CONDITION_PRICE_SHORT_LABELS.newRetail,
      price: game.estimatedPriceNewRetail,
    };
  }
  return null;
}
