import type { CatalogGame } from "./types";
import { getCatalogGame, publicListedCatalog } from "./catalog";
export { buildCatalogSeoSlug, catalogGamePath } from "./catalog-path";
import { buildCatalogSeoSlug, cleanCatalogSlug } from "./catalog-path";

const catalogBySeoSlug = new Map<string, CatalogGame>();

function ensureCatalogSeoSlugIndex(): void {
  if (catalogBySeoSlug.size > 0) return;
  for (const game of publicListedCatalog) {
    const seoSlug = buildCatalogSeoSlug(game);
    catalogBySeoSlug.set(seoSlug, game);
    catalogBySeoSlug.set(cleanCatalogSlug(seoSlug), game);
  }
}

export function getCatalogGameBySeoSlug(slug: string): CatalogGame | undefined {
  ensureCatalogSeoSlugIndex();
  return catalogBySeoSlug.get(slug);
}

export function resolveCatalogGameParam(param: string): CatalogGame | undefined {
  ensureCatalogSeoSlugIndex();
  return catalogBySeoSlug.get(param) ?? catalogBySeoSlug.get(cleanCatalogSlug(param)) ?? getCatalogGame(param);
}

export function getListedGamesWithEsPrice(): CatalogGame[] {
  return publicListedCatalog.filter((g) => g.hasEsPrice);
}
