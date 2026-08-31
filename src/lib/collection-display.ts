import type { CollectionCondition, CollectionView } from "./types";

export type CollectionConditionCounts = Record<CollectionCondition, number>;

export type CollectionDisplayItem = {
  game: CollectionView;
  entries: number;
  units: number;
  conditionCounts: CollectionConditionCounts;
};

const EMPTY_COUNTS: CollectionConditionCounts = {
  sealed: 0,
  complete: 0,
  "game-manual": 0,
  loose: 0,
  unknown: 0,
};

export function collectionCondition(item: CollectionView): CollectionCondition {
  return item.collectionCondition ?? (item.sealed ? "sealed" : "unknown");
}

export function groupCollectionDisplayItems(items: CollectionView[]): CollectionDisplayItem[] {
  const groups = new Map<string, CollectionDisplayItem>();

  for (const item of items) {
    const units = Math.max(1, item.quantity || 1);
    const key = item.catalogMatched && item.catalogId ? `catalog:${item.catalogId}` : `item:${item.id}`;
    const condition = collectionCondition(item);
    const current = groups.get(key);

    if (!current) {
      const conditionCounts = { ...EMPTY_COUNTS, [condition]: units };
      groups.set(key, {
        game: { ...item, quantity: units },
        entries: 1,
        units,
        conditionCounts,
      });
      continue;
    }

    current.entries += 1;
    current.units += units;
    current.conditionCounts[condition] += units;
    current.game.quantity = current.units;
    current.game.sealed = current.conditionCounts.sealed === current.units;
    current.game.totalValue =
      current.game.totalValue == null && item.totalValue == null
        ? null
        : Math.round(((current.game.totalValue ?? 0) + (item.totalValue ?? 0)) * 100) / 100;
  }

  return [...groups.values()];
}

export function formatCollectionConditionSummary(
  counts: CollectionConditionCounts,
  compact = false,
): string {
  const labels: Array<[CollectionCondition, string, string]> = [
    ["sealed", "precintado", "precintadas"],
    ["complete", "completo", "completas"],
    ["game-manual", "juego + manual", "juego + manual"],
    ["loose", "suelto", "sueltas"],
    ["unknown", "sin indicar", "sin indicar"],
  ];
  const parts = labels.flatMap(([condition, singular, plural]) => {
    const units = counts[condition];
    if (!units) return [];
    if (compact && units === 1) return [singular];
    return [`${units} ${units === 1 ? singular : plural}`];
  });
  return parts.join(" · ");
}
