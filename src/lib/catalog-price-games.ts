import type { CatalogGame } from "./types";

export type CatalogPriceGames = Record<string, CatalogGame | undefined>;

/** Resolve each exact price identity once, with bounded I/O for large collections. */
export async function loadCatalogPriceGames(
  ids: readonly string[],
  resolve: (id: string) => Promise<CatalogGame | undefined>,
  initial: readonly CatalogGame[] = [],
): Promise<CatalogPriceGames> {
  const games: CatalogPriceGames = Object.fromEntries(initial.map(game => [game.id, game]));
  const pending = [...new Set(ids)].filter(id => !games[id]);
  for (let start = 0; start < pending.length; start += 4) {
    await Promise.all(pending.slice(start, start + 4).map(async id => {
      const game = await resolve(id);
      // Never substitute the page's game or a different regional identity.
      games[id] = game?.id === id ? game : undefined;
    }));
  }
  return games;
}

export function editionPriceGame(catalogIds: readonly string[], games: CatalogPriceGames): CatalogGame | undefined {
  return catalogIds.map(id => games[id]).find(game => game !== undefined);
}
