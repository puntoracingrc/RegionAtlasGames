import { resolveCanonicalEntity } from "./company-canonical";
import { resolveCanonicalGenreEntity } from "./genre-canonical";
import { getCompany, getGenre } from "./indexes";
import type { DetailEntity, GameDetails } from "./types";

export type EntityLink = { href: string; name: string; slug: string };

/** Enlace a ficha de compañía solo si existe en el índice unificado. */
export function companyEntityLink(
  entity: DetailEntity | null | undefined,
): EntityLink | null {
  if (!entity) return null;
  const canonical = resolveCanonicalEntity(entity);
  if (!getCompany(canonical.slug)) return null;
  return {
    href: `/compania/${canonical.slug}`,
    name: canonical.name,
    slug: canonical.slug,
  };
}

/** Enlace a ficha de género solo si existe en el índice unificado. */
export function genreEntityLink(entity: DetailEntity): EntityLink | null {
  const canonical = resolveCanonicalGenreEntity(entity);
  if (!getGenre(canonical.slug)) return null;
  return {
    href: `/genero/${canonical.slug}`,
    name: canonical.name,
    slug: canonical.slug,
  };
}

/** Géneros deduplicados por slug canónico (p. ej. Racing + Conducción → una sola ficha). */
export function uniqueGenreEntityLinks(entities: DetailEntity[]): EntityLink[] {
  const seen = new Set<string>();
  const links: EntityLink[] = [];
  for (const entity of entities) {
    const link = genreEntityLink(entity);
    if (!link || seen.has(link.slug)) continue;
    seen.add(link.slug);
    links.push(link);
  }
  return links;
}

export function resolveGameEntityLinks(
  details: Pick<GameDetails, "developer" | "publisher" | "genres">,
): {
  developer: EntityLink | null;
  publisher: EntityLink | null;
  genres: EntityLink[];
} {
  return {
    developer: companyEntityLink(details.developer),
    publisher: companyEntityLink(details.publisher),
    genres: uniqueGenreEntityLinks(details.genres ?? []),
  };
}
