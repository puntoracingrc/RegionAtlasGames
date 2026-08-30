import type { CatalogGame, CollectionItem } from "./types";

type ImportRetailGame = Pick<
  CatalogGame | CollectionItem,
  | "region"
  | "jgoRetailPrice"
  | "cholloRetailPrice"
  | "kaotoRetailPrice"
  | "jgoMatchedAt"
  | "cholloMatchedAt"
  | "kaotoMatchedAt"
>;

type RetailObservation = {
  price: number;
  matchedAt?: string | null;
};

function importRetailObservations(game: ImportRetailGame): RetailObservation[] {
  const observations: RetailObservation[] = [];
  if (game.jgoRetailPrice != null) {
    observations.push({ price: game.jgoRetailPrice, matchedAt: game.jgoMatchedAt });
  }
  if (game.cholloRetailPrice != null) {
    observations.push({ price: game.cholloRetailPrice, matchedAt: game.cholloMatchedAt });
  }
  if (game.kaotoRetailPrice != null) {
    observations.push({ price: game.kaotoRetailPrice, matchedAt: game.kaotoMatchedAt });
  }
  return observations;
}

export function hasJapanRetailReference(game: ImportRetailGame): boolean {
  const region = (game.region || "").toLowerCase();
  return (
    (region === "japón" || region === "japan") &&
    importRetailObservations(game).length > 0
  );
}

export function bestJapanRetailPrice(game: ImportRetailGame): number | null {
  const prices = importRetailObservations(game).map((observation) => observation.price);
  return prices.length > 0 ? Math.min(...prices) : null;
}

export function latestJapanRetailMatchedAt(game: ImportRetailGame): string | null {
  const dates = importRetailObservations(game)
    .map((observation) => observation.matchedAt)
    .filter(Boolean) as string[];
  return dates.sort().at(-1) ?? null;
}
