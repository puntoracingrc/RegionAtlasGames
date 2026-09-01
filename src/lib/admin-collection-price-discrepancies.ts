import { getCatalogGame } from "./catalog";
import { priceForCollectionCondition } from "./condition-prices";
import { readUserCollection } from "./collection-store";
import type { CollectionCondition } from "./types";
import { normalizeLegacyCollectionCondition } from "./collection-condition-policy";
import { readUsers } from "./users";

const MIN_USERS = 3;
const MIN_CATALOG_GAP_EUR = 15;
const MIN_CATALOG_GAP_RATIO = 0.35;
const MIN_USER_SPREAD_EUR = 20;
const MIN_USER_SPREAD_RATIO = 0.5;

export type CollectionPriceEstimateSample = {
  userId: string;
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
  condition: CollectionCondition;
  ownerEstimatedPrice: number;
  catalogPrice: number | null;
};

export type AdminCollectionPriceDiscrepancy = {
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
  condition: CollectionCondition;
  userCount: number;
  catalogPrice: number | null;
  userMedian: number;
  userMin: number;
  userMax: number;
  catalogDifferencePercent: number | null;
  userSpreadPercent: number;
  reason: "catalog" | "users" | "both";
};

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  return Math.round(((ordered[middle - 1] + ordered[middle]) / 2) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildCollectionPriceDiscrepancies(
  samples: CollectionPriceEstimateSample[],
): AdminCollectionPriceDiscrepancy[] {
  const groups = new Map<string, CollectionPriceEstimateSample[]>();
  for (const sample of samples) {
    if (!Number.isFinite(sample.ownerEstimatedPrice) || sample.ownerEstimatedPrice <= 0) continue;
    const key = `${sample.catalogId}:${sample.condition}`;
    const group = groups.get(key);
    if (group) group.push(sample);
    else groups.set(key, [sample]);
  }

  const discrepancies: AdminCollectionPriceDiscrepancy[] = [];
  for (const group of groups.values()) {
    const byUser = new Map<string, number[]>();
    for (const sample of group) {
      const values = byUser.get(sample.userId);
      if (values) values.push(sample.ownerEstimatedPrice);
      else byUser.set(sample.userId, [sample.ownerEstimatedPrice]);
    }
    if (byUser.size < MIN_USERS) continue;

    const userValues = [...byUser.values()].map((values) => median(values));
    const userMedian = median(userValues);
    const userMin = Math.min(...userValues);
    const userMax = Math.max(...userValues);
    const userSpread = userMax - userMin;
    const userSpreadPercent = userMedian > 0 ? roundPercent((userSpread / userMedian) * 100) : 0;
    const first = group[0];
    const catalogPrice = first.catalogPrice;
    const catalogDifference = catalogPrice != null ? userMedian - catalogPrice : null;
    const catalogDifferencePercent =
      catalogPrice != null && catalogPrice > 0 && catalogDifference != null
        ? roundPercent((catalogDifference / catalogPrice) * 100)
        : null;
    const catalogMismatch =
      catalogPrice != null &&
      catalogPrice > 0 &&
      catalogDifference != null &&
      Math.abs(catalogDifference) >= MIN_CATALOG_GAP_EUR &&
      Math.abs(catalogDifference) / catalogPrice >= MIN_CATALOG_GAP_RATIO;
    const usersDisagree =
      userSpread >= MIN_USER_SPREAD_EUR &&
      userMedian > 0 &&
      userSpread / userMedian >= MIN_USER_SPREAD_RATIO;
    if (!catalogMismatch && !usersDisagree) continue;

    discrepancies.push({
      catalogId: first.catalogId,
      title: first.title,
      platformSlug: first.platformSlug,
      region: first.region,
      condition: first.condition,
      userCount: byUser.size,
      catalogPrice,
      userMedian,
      userMin,
      userMax,
      catalogDifferencePercent,
      userSpreadPercent,
      reason: catalogMismatch && usersDisagree ? "both" : catalogMismatch ? "catalog" : "users",
    });
  }

  return discrepancies.sort((a, b) => {
    const aSeverity = Math.max(Math.abs(a.catalogDifferencePercent ?? 0), a.userSpreadPercent);
    const bSeverity = Math.max(Math.abs(b.catalogDifferencePercent ?? 0), b.userSpreadPercent);
    return bSeverity - aSeverity || a.title.localeCompare(b.title, "es");
  });
}

export async function getAdminCollectionPriceDiscrepancies(): Promise<AdminCollectionPriceDiscrepancy[]> {
  const users = await readUsers();
  const samples: CollectionPriceEstimateSample[] = [];

  for (let index = 0; index < users.length; index += 20) {
    const batch = users.slice(index, index + 20);
    const collections = await Promise.all(
      batch.map((user) => readUserCollection(user.id).catch(() => null)),
    );
    collections.forEach((collection, collectionIndex) => {
      if (!collection) return;
      const userId = batch[collectionIndex].id;
      for (const item of collection.items) {
        if (!item.catalogId || item.ownerEstimatedPrice == null || item.ownerEstimatedPrice <= 0) continue;
        const game = getCatalogGame(item.catalogId);
        if (!game) continue;
        const condition = normalizeLegacyCollectionCondition(
          item.collectionCondition,
          item.sealed,
        );
        samples.push({
          userId,
          catalogId: game.id,
          title: game.title,
          platformSlug: game.platformSlug,
          region: game.region,
          condition,
          ownerEstimatedPrice: item.ownerEstimatedPrice,
          catalogPrice: priceForCollectionCondition(game, condition),
        });
      }
    });
  }

  return buildCollectionPriceDiscrepancies(samples);
}
