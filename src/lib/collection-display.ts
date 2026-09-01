import type { CollectionCondition, CollectionView } from "./types";

export type CollectionConditionCounts = Record<CollectionCondition, number>;

export type CollectionDisplayItem = {
  game: CollectionView;
  entries: number;
  units: number;
  conditionCounts: CollectionConditionCounts;
  itemIds: string[];
  earliestAddedAt: string | null;
  latestAddedAt: string | null;
  earliestPurchasedAt: string | null;
  latestPurchasedAt: string | null;
};

const EMPTY_COUNTS: CollectionConditionCounts = {
  sealed: 0,
  complete: 0,
  "game-manual": 0,
  loose: 0,
  unknown: 0,
};

export function collectionCondition(item: CollectionView): CollectionCondition {
  return item.sealed ? "sealed" : item.collectionCondition ?? "unknown";
}

function validDate(value: string | null | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

function earlierDate(current: string | null, candidate: string | null): string | null {
  if (!current) return candidate;
  if (!candidate) return current;
  return Date.parse(candidate) < Date.parse(current) ? candidate : current;
}

function laterDate(current: string | null, candidate: string | null): string | null {
  if (!current) return candidate;
  if (!candidate) return current;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

export function groupCollectionDisplayItems(items: CollectionView[]): CollectionDisplayItem[] {
  const groups = new Map<string, CollectionDisplayItem>();

  for (const item of items) {
    const units = Math.max(1, item.quantity || 1);
    const key = item.catalogMatched && item.catalogId ? `catalog:${item.catalogId}` : `item:${item.id}`;
    const condition = collectionCondition(item);
    const current = groups.get(key);
    const addedAt = validDate(item.addedAt);
    const purchasedAt = validDate(item.purchasedAt);

    if (!current) {
      const conditionCounts = { ...EMPTY_COUNTS, [condition]: units };
      groups.set(key, {
        game: { ...item, quantity: units },
        entries: 1,
        units,
        conditionCounts,
        itemIds: [item.id],
        earliestAddedAt: addedAt,
        latestAddedAt: addedAt,
        earliestPurchasedAt: purchasedAt,
        latestPurchasedAt: purchasedAt,
      });
      continue;
    }

    current.entries += 1;
    current.units += units;
    current.itemIds.push(item.id);
    current.conditionCounts[condition] += units;
    current.earliestAddedAt = earlierDate(current.earliestAddedAt, addedAt);
    current.latestAddedAt = laterDate(current.latestAddedAt, addedAt);
    current.earliestPurchasedAt = earlierDate(current.earliestPurchasedAt, purchasedAt);
    current.latestPurchasedAt = laterDate(current.latestPurchasedAt, purchasedAt);
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
