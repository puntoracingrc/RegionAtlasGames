import { getCollectionPlatformShortName } from "./collection-platform-groups";
import { normalizeImportedPlatformSlug } from "./collection-platform-slugs";
import { getPriceHistory, type PriceHistorySnapshot } from "./price-history";
import type { CollectionSummary } from "./collection-store";
import type { CollectionView } from "./types";

export type HomePlatformSummary = {
  slug: string;
  label: string;
  games: number;
  units: number;
  share: number;
};

export type CollectionValuePoint = {
  at: string;
  value: number;
};

export type HomeCollectionSnapshot = {
  summary: CollectionSummary;
  priceCoveragePct: number;
  favoritePlatforms: HomePlatformSummary[];
  recentItems: CollectionView[];
  valueHistory: CollectionValuePoint[];
};

type TimelineOptions = {
  now?: string;
  historyForGame?: (catalogId: string) => PriceHistorySnapshot[];
};

function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function snapshotPrice(item: CollectionView, snapshot: PriceHistorySnapshot): number | null {
  if (item.sealed || item.collectionCondition === "sealed") {
    return (
      snapshot.sealed ??
      snapshot.complete ??
      snapshot.gameManual ??
      snapshot.loose ??
      snapshot.newRetail ??
      null
    );
  }

  return (
    snapshot.complete ??
    snapshot.gameManual ??
    snapshot.loose ??
    snapshot.sealed ??
    snapshot.newRetail ??
    null
  );
}

function compactTimeline(points: CollectionValuePoint[], limit = 8): CollectionValuePoint[] {
  if (points.length <= limit) return points;
  const indexes = new Set<number>([0, points.length - 1]);
  for (let i = 1; i < limit - 1; i += 1) {
    indexes.add(Math.round((i / (limit - 1)) * (points.length - 1)));
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => points[index]);
}

function latestPointPerDay(points: CollectionValuePoint[]): CollectionValuePoint[] {
  const byDay = new Map<string, CollectionValuePoint>();
  for (const point of points) byDay.set(point.at.slice(0, 10), point);
  return [...byDay.values()];
}

export function buildCollectionValueTimeline(
  items: CollectionView[],
  currentValue: number,
  options: TimelineOptions = {},
): CollectionValuePoint[] {
  if (items.length === 0) return [];

  const now = options.now ?? new Date().toISOString();
  const nowTime = validTime(now) ?? Date.now();
  const historyForGame = options.historyForGame ?? getPriceHistory;
  const histories = new Map<string, PriceHistorySnapshot[]>();
  const dates = new Set<number>();

  for (const item of items) {
    const addedAt = validTime(item.addedAt);
    if (addedAt != null && addedAt <= nowTime) dates.add(addedAt);
    if (!item.catalogId) continue;
    const series = historyForGame(item.catalogId).filter(
      (snapshot) => (validTime(snapshot.at) ?? Number.POSITIVE_INFINITY) <= nowTime,
    );
    histories.set(item.catalogId, series);
    for (const snapshot of series) {
      const at = validTime(snapshot.at);
      if (at != null) dates.add(at);
    }
  }
  dates.add(nowTime);

  const points = [...dates]
    .sort((a, b) => a - b)
    .map((at) => {
      if (at === nowTime) {
        return { at: now, value: Math.round(currentValue * 100) / 100 };
      }

      let value = 0;
      for (const item of items) {
        const addedAt = validTime(item.addedAt);
        if (addedAt != null && addedAt > at) continue;
        const series = item.catalogId ? histories.get(item.catalogId) ?? [] : [];
        const snapshot = [...series]
          .reverse()
          .find((candidate) => (validTime(candidate.at) ?? Number.POSITIVE_INFINITY) <= at);
        const unitPrice = snapshot ? snapshotPrice(item, snapshot) : null;
        if (unitPrice != null) value += unitPrice * Math.max(1, item.quantity || 1);
      }
      return { at: new Date(at).toISOString(), value: Math.round(value * 100) / 100 };
    });

  const withoutDuplicateMoments = points.filter(
    (point, index) => index === points.length - 1 || point.at !== points[index + 1]?.at,
  );
  return compactTimeline(latestPointPerDay(withoutDuplicateMoments));
}

export function buildFavoritePlatforms(items: CollectionView[], limit = 4): HomePlatformSummary[] {
  const counts = new Map<string, { games: number; units: number }>();
  const gamesByPlatform = new Map<string, Set<string>>();
  let totalUnits = 0;

  for (const item of items) {
    const slug = normalizeImportedPlatformSlug(item.platformSlug);
    const current = counts.get(slug) ?? { games: 0, units: 0 };
    const units = Math.max(1, item.quantity || 1);
    const games = gamesByPlatform.get(slug) ?? new Set<string>();
    games.add(item.catalogId ?? `${item.region}:${item.title.trim().toLocaleLowerCase("es")}`);
    gamesByPlatform.set(slug, games);
    current.games = games.size;
    current.units += units;
    totalUnits += units;
    counts.set(slug, current);
  }

  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: getCollectionPlatformShortName(slug),
      games: count.games,
      units: count.units,
      share: totalUnits > 0 ? Math.round((count.units / totalUnits) * 100) : 0,
    }))
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label, "es"))
    .slice(0, limit);
}

export function buildHomeCollectionSnapshot(
  items: CollectionView[],
  summary: CollectionSummary,
  options: TimelineOptions = {},
): HomeCollectionSnapshot {
  const recentItems = [...items]
    .map((item, index) => ({ item, index, at: validTime(item.addedAt) ?? index }))
    .sort((a, b) => b.at - a.at || b.index - a.index)
    .slice(0, 6)
    .map(({ item }) => item);

  return {
    summary,
    priceCoveragePct:
      summary.totalItems > 0 ? Math.round((summary.withEsPrice / summary.totalItems) * 100) : 0,
    favoritePlatforms: buildFavoritePlatforms(items),
    recentItems,
    valueHistory: buildCollectionValueTimeline(items, summary.totalRecommendedValue, options),
  };
}
