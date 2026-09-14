import { getCatalogGame } from "@/lib/catalog";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import type { CatalogListGame } from "@/lib/types";

/** Adds rich detail fields only to the catalog cards that will be rendered. */
export async function enrichCatalogCards(games: CatalogListGame[]): Promise<CatalogListGame[]> {
  const { toCatalogListGame } = await import("@/lib/catalog-list-game");
  return games.flatMap((game) => {
    const source = game.sourceCatalogGame ?? getCatalogGame(game.id);
    if (!source) return [];
    const richGame = toCatalogListGame(source);
    return [toCatalogCardGame({
      ...richGame,
      title: game.title,
      physicalEditionGroup: game.physicalEditionGroup,
      isGrail: game.isGrail,
      isTopSegment: game.isTopSegment,
    })];
  });
}
