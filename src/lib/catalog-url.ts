import type { CatalogGame } from "./types";
import { getCatalogGame, listedCatalog } from "./catalog";
export { buildCatalogSeoSlug, catalogGamePath } from "./catalog-path";
import { buildCatalogSeoSlug } from "./catalog-path";

const catalogBySeoSlug = new Map<string, CatalogGame>();

function ensureCatalogSeoSlugIndex(): void {
  if (catalogBySeoSlug.size > 0) return;
  for (const game of listedCatalog) {
    catalogBySeoSlug.set(buildCatalogSeoSlug(game), game);
  }
}

export function getCatalogGameBySeoSlug(slug: string): CatalogGame | undefined {
  ensureCatalogSeoSlugIndex();
  return catalogBySeoSlug.get(slug);
}

export function resolveCatalogGameParam(param: string): CatalogGame | undefined {
  ensureCatalogSeoSlugIndex();
  return catalogBySeoSlug.get(param) ?? getCatalogGame(param);
}

export function getListedGamesWithEsPrice(): CatalogGame[] {
  return listedCatalog.filter((g) => g.hasEsPrice);
}
