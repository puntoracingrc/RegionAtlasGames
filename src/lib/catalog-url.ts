import type { CatalogGame } from "./types";
import { getCatalogGame, listedCatalog } from "./catalog";
import { getRegionDisplay } from "./region-display";
import { slugify } from "./slug";

function regionSlugForSeo(region: string): string {
  const short = getRegionDisplay(region).shortLabel.toLowerCase();
  if (short !== "?") return slugify(short === "uk" ? "pal-uk" : `pal-${short}`);
  return slugify(region.replace(/^PAL\s+/i, "pal-"));
}

/** Canonical SEO slug: e.g. super-mario-world-snes-pal-es */
export function buildCatalogSeoSlug(game: CatalogGame): string {
  return `${game.slug}-${game.platformSlug}-${regionSlugForSeo(game.region)}`;
}

const catalogBySeoSlug = new Map<string, CatalogGame>();
for (const game of listedCatalog) {
  catalogBySeoSlug.set(buildCatalogSeoSlug(game), game);
}

export function getCatalogGameBySeoSlug(slug: string): CatalogGame | undefined {
  return catalogBySeoSlug.get(slug);
}

export function resolveCatalogGameParam(param: string): CatalogGame | undefined {
  return catalogBySeoSlug.get(param) ?? getCatalogGame(param);
}

export function catalogGamePath(game: CatalogGame | string): string {
  const g = typeof game === "string" ? getCatalogGame(game) : game;
  if (!g) return "/catalogo";
  return `/catalogo/${buildCatalogSeoSlug(g)}`;
}

export function getListedGamesWithEsPrice(): CatalogGame[] {
  return listedCatalog.filter((g) => g.hasEsPrice);
}
