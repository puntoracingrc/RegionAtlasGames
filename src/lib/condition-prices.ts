import type { CatalogGame, CollectionItem } from "./types";

export type ConditionBucket = "loose" | "complete" | "sealed";

export const CONDITION_PRICE_LABELS: Record<ConditionBucket, string> = {
  loose: "Suelto",
  complete: "Completo",
  sealed: "Precintado",
};

type GameWithConditionPrices = Pick<
  CatalogGame | CollectionItem,
  "estimatedPriceLoose" | "estimatedPriceComplete" | "estimatedPriceSealed"
>;

export function hasAnyConditionEstimate(game: GameWithConditionPrices): boolean {
  return (
    game.estimatedPriceLoose != null ||
    game.estimatedPriceComplete != null ||
    game.estimatedPriceSealed != null
  );
}

export function conditionPriceEntries(
  game: GameWithConditionPrices,
): { bucket: ConditionBucket; label: string; price: number }[] {
  const entries: { bucket: ConditionBucket; label: string; price: number }[] = [];
  if (game.estimatedPriceLoose != null) {
    entries.push({
      bucket: "loose",
      label: CONDITION_PRICE_LABELS.loose,
      price: game.estimatedPriceLoose,
    });
  }
  if (game.estimatedPriceComplete != null) {
    entries.push({
      bucket: "complete",
      label: CONDITION_PRICE_LABELS.complete,
      price: game.estimatedPriceComplete,
    });
  }
  if (game.estimatedPriceSealed != null) {
    entries.push({
      bucket: "sealed",
      label: CONDITION_PRICE_LABELS.sealed,
      price: game.estimatedPriceSealed,
    });
  }
  return entries;
}

/** Precio principal para tarjetas: completo → suelto → precintado. */
export function primaryConditionPrice(game: GameWithConditionPrices): number | null {
  return (
    game.estimatedPriceComplete ??
    game.estimatedPriceLoose ??
    game.estimatedPriceSealed ??
    null
  );
}
