import { decodeHtmlEntities } from "./decode-html-entities";
import type { CatalogGame, GameDetails } from "./types";

export function decodeCatalogDisplayText(value: string): string {
  let current = value;
  for (let pass = 0; pass < 5; pass += 1) {
    const decoded = decodeHtmlEntities(current);
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

export function normalizeCatalogGamePresentation(game: CatalogGame): CatalogGame {
  const title = decodeCatalogDisplayText(game.title);
  const titlePc = game.titlePc ? decodeCatalogDisplayText(game.titlePc) : game.titlePc;
  if (title === game.title && titlePc === game.titlePc) return game;
  return { ...game, title, titlePc };
}

export function normalizeGameDetailsPresentation(details: GameDetails): GameDetails {
  const description = details.description
    ? decodeCatalogDisplayText(details.description)
    : details.description;
  const reference = details.reference
    ? decodeCatalogDisplayText(details.reference)
    : details.reference;
  if (description === details.description && reference === details.reference) return details;
  return { ...details, description, reference };
}
