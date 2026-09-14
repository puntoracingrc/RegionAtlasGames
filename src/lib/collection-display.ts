import type { CollectionCondition, CollectionView } from "./types";
import type { CatalogBroadRegion } from "./catalog-edition-guide-types";
import {
  COLLECTION_CONDITION_SHORT_LABELS,
  priceForCollectionCondition,
} from "./condition-prices";
import { normalizeLegacyCollectionCondition } from "./collection-condition-policy";
import { collectionStorageIdentityKey } from "./collection-identity";

export type CollectionConditionCounts = Record<CollectionCondition, number>;

export type CollectionDisplayItem = {
  game: CollectionView;
  /** Stable key for an edition-family card; the stored copy identities stay in itemIds. */
  groupKey?: string;
  entries: number;
  units: number;
  conditionCounts: CollectionConditionCounts;
  physicalEditionIds: string[];
  aggregatedConditionValues?: CollectionConditionValue[];
  itemIds: string[];
  earliestAddedAt: string | null;
  latestAddedAt: string | null;
  earliestPurchasedAt: string | null;
  latestPurchasedAt: string | null;
};

export type CollectionConditionValue = {
  condition: CollectionCondition;
  label: string;
  units: number;
  unitPrice: number | null;
  totalPrice: number | null;
};

const CONDITION_ORDER: CollectionCondition[] = [
  "sealed",
  "complete",
  "game-manual",
  "loose",
];

const EMPTY_COUNTS: CollectionConditionCounts = {
  sealed: 0,
  complete: 0,
  "game-manual": 0,
  loose: 0,
  unknown: 0,
};

export function collectionCondition(item: CollectionView): CollectionCondition {
  return normalizeLegacyCollectionCondition(item.collectionCondition, item.sealed);
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function groupExactCollectionDisplayItems(items: CollectionView[]): CollectionDisplayItem[] {
  const groups = new Map<string, CollectionDisplayItem>();

  for (const item of items) {
    const units = Math.max(1, item.quantity || 1);
    const key = item.catalogMatched && item.catalogId
      ? collectionStorageIdentityKey(item)
      : `item:${item.id}`;
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
        physicalEditionIds: item.physicalEditionId ? [item.physicalEditionId] : [],
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
    current.physicalEditionIds = unique([
      ...current.physicalEditionIds,
      ...(item.physicalEditionId ? [item.physicalEditionId] : []),
    ]);
    current.game.totalValue =
      current.game.totalValue == null && item.totalValue == null
        ? null
        : Math.round(((current.game.totalValue ?? 0) + (item.totalValue ?? 0)) * 100) / 100;
  }

  return [...groups.values()];
}

function combinedConditionValues(items: CollectionDisplayItem[]): CollectionConditionValue[] {
  return CONDITION_ORDER.flatMap((condition) => {
    const values = items.flatMap((item) =>
      baseCollectionConditionValues(item).filter((entry) => entry.condition === condition),
    );
    if (!values.length) return [];
    const units = values.reduce((total, value) => total + value.units, 0);
    const knownTotals = values.filter((value) => value.totalPrice != null);
    const totalPrice = knownTotals.length === values.length
      ? Math.round(knownTotals.reduce((total, value) => total + value.totalPrice!, 0) * 100) / 100
      : null;
    const unitPrices = unique(values.map((value) => value.unitPrice));
    return [{
      condition,
      label: COLLECTION_CONDITION_SHORT_LABELS[condition],
      units,
      unitPrice: unitPrices.length === 1 ? unitPrices[0] : null,
      totalPrice,
    }];
  });
}

function mergedPhysicalEditionGroup(items: CollectionDisplayItem[]) {
  const summaries = items.flatMap((item) => item.game.physicalEditionGroup
    ? [item.game.physicalEditionGroup]
    : []);
  const first = summaries[0];
  if (!first) return undefined;

  const broadRegions = new Map<string, { value: CatalogBroadRegion; label: string; editionIds: Set<string> }>();
  const collectibleVariants = new Map<string, number>();
  for (const item of items) {
    const summary = item.game.physicalEditionGroup;
    if (!summary) continue;
    const editionIds = item.physicalEditionIds.length
      ? item.physicalEditionIds
      : [`catalog:${summary.catalogIds.join("|")}`];
    for (const broadRegion of summary.broadRegions) {
      const current = broadRegions.get(broadRegion.value) ?? {
        value: broadRegion.value,
        label: broadRegion.label,
        editionIds: new Set<string>(),
      };
      for (const editionId of editionIds) current.editionIds.add(editionId);
      broadRegions.set(broadRegion.value, current);
    }
    for (const editionId of editionIds) {
      if (!collectibleVariants.has(editionId)) {
        collectibleVariants.set(editionId, summary.collectibleVariantCount);
      }
    }
  }

  const priceRange = (condition: "complete" | "sealed") => {
    const ranges = summaries.flatMap((summary) => summary.priceRanges[condition]
      ? [summary.priceRanges[condition]!]
      : []);
    if (!ranges.length) return undefined;
    return {
      min: Math.min(...ranges.map((range) => range.min)),
      max: Math.max(...ranges.map((range) => range.max)),
    };
  };
  const complete = priceRange("complete");
  const sealed = priceRange("sealed");

  return {
    ...first,
    catalogIds: unique(summaries.flatMap((summary) => summary.catalogIds)),
    legacyRegions: unique(summaries.flatMap((summary) => summary.legacyRegions)),
    marketRegions: unique(summaries.flatMap((summary) => summary.marketRegions)),
    overviewRegions: unique(summaries.flatMap((summary) => summary.overviewRegions)),
    physicalEditionCount: unique(items.flatMap((item) => item.physicalEditionIds)).length || 1,
    collectibleVariantCount: [...collectibleVariants.values()].reduce((total, count) => total + count, 0),
    broadRegions: [...broadRegions.values()].map((entry) => ({
      value: entry.value,
      label: entry.label,
      editionCount: entry.editionIds.size,
    })),
    editionTypes: unique(summaries.flatMap((summary) => summary.editionTypes)),
    ratingSystems: unique(summaries.flatMap((summary) => summary.ratingSystems)),
    packagingLanguages: unique(summaries.flatMap((summary) => summary.packagingLanguages)),
    priceRanges: {
      ...(complete ? { complete } : {}),
      ...(sealed ? { sealed } : {}),
    },
  };
}

function mergeCollectionFamily(
  groupKey: string,
  items: CollectionDisplayItem[],
): CollectionDisplayItem {
  const physicalEditionGroup = mergedPhysicalEditionGroup(items)!;
  const representative = items.find((item) =>
    item.game.catalogId === physicalEditionGroup.canonicalCatalogId,
  ) ?? items.find((item) => Boolean(item.game.coverUrl)) ?? items[0];
  const conditionCounts = items.reduce<CollectionConditionCounts>((counts, item) => {
    for (const condition of Object.keys(counts) as CollectionCondition[]) {
      counts[condition] += item.conditionCounts[condition];
    }
    return counts;
  }, { ...EMPTY_COUNTS });
  const units = items.reduce((total, item) => total + item.units, 0);
  const totalValues = items.map((item) => item.game.totalValue);
  const totalValue = totalValues.every((value) => value == null)
    ? null
    : Math.round(totalValues.reduce<number>((total, value) => total + (value ?? 0), 0) * 100) / 100;
  const physicalEditionIds = unique(items.flatMap((item) => item.physicalEditionIds));

  return {
    game: {
      ...representative.game,
      catalogId: physicalEditionGroup.canonicalCatalogId,
      physicalVariantId: physicalEditionIds.length === 1
        ? representative.game.physicalVariantId
        : undefined,
      physicalVariantLabel: undefined,
      editionFamilyLabel: physicalEditionGroup.editionFamilyLabel,
      physicalEditionId: physicalEditionIds.length === 1 ? physicalEditionIds[0] : undefined,
      physicalEditionGroup,
      quantity: units,
      sealed: conditionCounts.sealed === units,
      totalValue,
      recommendedPrice: totalValue == null || units === 0
        ? representative.game.recommendedPrice
        : Math.round((totalValue / units) * 100) / 100,
    },
    groupKey,
    entries: items.reduce((total, item) => total + item.entries, 0),
    units,
    conditionCounts,
    physicalEditionIds,
    aggregatedConditionValues: combinedConditionValues(items),
    itemIds: items.flatMap((item) => item.itemIds),
    earliestAddedAt: items.reduce((date, item) => earlierDate(date, item.earliestAddedAt), null as string | null),
    latestAddedAt: items.reduce((date, item) => laterDate(date, item.latestAddedAt), null as string | null),
    earliestPurchasedAt: items.reduce((date, item) => earlierDate(date, item.earliestPurchasedAt), null as string | null),
    latestPurchasedAt: items.reduce((date, item) => laterDate(date, item.latestPurchasedAt), null as string | null),
  };
}

export function groupCollectionDisplayItems(items: CollectionView[]): CollectionDisplayItem[] {
  const exactItems = groupExactCollectionDisplayItems(items);
  const families = new Map<string, CollectionDisplayItem[]>();
  const ungrouped: CollectionDisplayItem[] = [];

  for (const item of exactItems) {
    const summary = item.game.physicalEditionGroup;
    if (!summary?.editionFamilyId) {
      ungrouped.push(item);
      continue;
    }
    const key = `family:${summary.guideId}:${summary.editionFamilyId}`;
    families.set(key, [...(families.get(key) ?? []), item]);
  }

  return [
    ...[...families.entries()].map(([key, familyItems]) => mergeCollectionFamily(key, familyItems)),
    ...ungrouped,
  ];
}

function baseCollectionConditionValues(
  item: CollectionDisplayItem,
): CollectionConditionValue[] {
  return CONDITION_ORDER.flatMap((condition) => {
    const units = item.conditionCounts[condition];
    if (units <= 0) return [];
    const unitPrice = priceForCollectionCondition(item.game, condition);
    return [{
      condition,
      label: COLLECTION_CONDITION_SHORT_LABELS[condition],
      units,
      unitPrice,
      totalPrice: unitPrice == null ? null : Math.round(unitPrice * units * 100) / 100,
    }];
  });
}

export function collectionConditionValues(
  item: CollectionDisplayItem,
): CollectionConditionValue[] {
  return item.aggregatedConditionValues ?? baseCollectionConditionValues(item);
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
  ];
  const parts = labels.flatMap(([condition, singular, plural]) => {
    const units = counts[condition];
    if (!units) return [];
    if (compact && units === 1) return [singular];
    return [`${units} ${units === 1 ? singular : plural}`];
  });
  return parts.join(" · ");
}
