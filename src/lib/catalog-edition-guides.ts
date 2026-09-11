import guideData from "../../data/catalog-edition-guides.json";
import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import type { CatalogGame } from "./types";

type Edition = typeof guideData.guides[number]["editions"][number];

function matches(game: CatalogGame, entry: Edition): boolean {
  return game.id === entry.catalogId && game.platformSlug === entry.identity.platformSlug &&
    game.slug === entry.identity.slug && game.region === entry.identity.region &&
    game.edition === entry.identity.edition;
}

export function getCatalogEditionGuide(game: CatalogGame) {
  const guide = guideData.guides.find(guide => guide.editions.some(entry => matches(game, entry)));
  if (!guide) return undefined;
  const current = guide.editions.find(entry => matches(game, entry))!;
  return {
    ...guide,
    images: guide.images.filter(image => current.imageKeys.includes(image.key)),
    editions: guide.editions.flatMap(entry => {
      const target = getCatalogGame(entry.catalogId);
      if (!target || !isPublicCatalogGame(target) || !matches(target, entry)) return [];
      return [{ ...entry, href: catalogGamePath(target), current: entry.catalogId === game.id }];
    }),
  };
}
