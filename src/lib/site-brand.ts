/** Marca pública: logo «Region Atlas» · legal RegionAtlasGames · sigla RAG */
export const SITE_LOGO = "Region Atlas";
export const SITE_LOGO_ALT = "Region Atlas Games";
export const SITE_LOGO_DARK_SRC = "/brand/logo-dark-mode.png";
export const SITE_LOGO_LIGHT_SRC = "/brand/logo-light-mode.png";
export const SITE_NAME = "RegionAtlasGames";
export const SITE_ACRONYM = "RAG";
export const SITE_DEFAULT_URL = "https://regionatlas.games";

export const SITE_TITLE =
  "Region Atlas — Catálogo por región y precios de mercado en España";

export const SITE_DESCRIPTION =
  "Catálogo multiregión de videojuegos clásicos y modernos. Busca por consola, compañía, género o SKU. Precios orientados al mercado español.";

export function siteTitleSuffix(page?: string): string {
  return page ? `${page} | ${SITE_LOGO}` : SITE_TITLE;
}
