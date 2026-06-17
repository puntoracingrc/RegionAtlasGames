import type { CatalogGame } from "./types";
import { decodeHtmlEntities } from "./decode-html-entities";
import { getRegionDisplay } from "./region-display";
import { slugify } from "./slug";

type CatalogPathGame = Pick<CatalogGame, "slug" | "platformSlug" | "region">;

function regionSlugForSeo(region: string): string {
  const short = getRegionDisplay(region).shortLabel.toLowerCase();
  if (short !== "?") return slugify(short === "uk" ? "pal-uk" : `pal-${short}`);
  return slugify(region.replace(/^PAL\s+/i, "pal-"));
}

export function buildCatalogSeoSlug(game: CatalogPathGame): string {
  return `${cleanCatalogSlug(game.slug)}-${game.platformSlug}-${regionSlugForSeo(game.region)}`;
}

export function catalogGamePath(game: CatalogPathGame | string): string {
  if (typeof game === "string") return `/catalogo/${game}`;
  return `/catalogo/${buildCatalogSeoSlug(game)}`;
}

export function cleanCatalogSlug(slug: string): string {
  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    decodedSlug = slug;
  }
  return slugify(decodeHtmlEntities(decodedSlug));
}
