import { listedCatalog } from "@/lib/catalog";
import { normalizeCatalogSearchSlug, normalizeCatalogSearchText } from "@/lib/catalog-search-normalize";
import { resolveCanonicalGenreEntity } from "@/lib/genre-canonical";
import { getGameDetails } from "@/lib/indexes";
import { getAllGameFacetTaxonomyEntities, findGameFacetEntityBySlug } from "@/lib/game-facets/taxonomy";
import type { GameFacetTaxonomyEntity } from "@/lib/game-facets/types";
import { readAdminSeriesAssignmentsForPublic } from "@/lib/admin-series-manager";
import type { CatalogGame, DetailEntity } from "@/lib/types";

export type GameFacetProfileView = {
  entity: GameFacetTaxonomyEntity;
  title: string;
  subtitle: string;
  games: CatalogGame[];
};

function entityTerms(entity: GameFacetTaxonomyEntity): Set<string> {
  return new Set(
    [entity.id, entity.name, entity.slug, ...(entity.aliases ?? [])]
      .flatMap((term) => [normalizeCatalogSearchText(term), normalizeCatalogSearchSlug(term)])
      .filter(Boolean),
  );
}

function detailEntityTerms(entity: DetailEntity): string[] {
  return [entity.name, entity.slug]
    .flatMap((term) => [normalizeCatalogSearchText(term), normalizeCatalogSearchSlug(term)])
    .filter(Boolean);
}

function matchesAnyDetailEntity(entities: DetailEntity[], terms: Set<string>): boolean {
  return entities.some((entity) => detailEntityTerms(entity).some((term) => terms.has(term)));
}

function matchesGameFacet(game: CatalogGame, entity: GameFacetTaxonomyEntity, assignment?: { tags?: DetailEntity[]; facets?: DetailEntity[] }): boolean {
  const terms = entityTerms(entity);
  const details = getGameDetails(game.id);
  const canonicalGenres = (details?.genres ?? []).map(resolveCanonicalGenreEntity);

  return (
    matchesAnyDetailEntity(details?.genres ?? [], terms) ||
    matchesAnyDetailEntity(canonicalGenres.map((genre) => ({ name: genre.name, slug: genre.slug })), terms) ||
    matchesAnyDetailEntity(details?.subgenres ?? [], terms) ||
    matchesAnyDetailEntity(details?.facets ?? [], terms) ||
    matchesAnyDetailEntity(details?.tags ?? [], terms) ||
    matchesAnyDetailEntity(assignment?.tags ?? [], terms) ||
    matchesAnyDetailEntity(assignment?.facets ?? [], terms)
  );
}

export function findGameFacetProfileEntity(slug: string): GameFacetTaxonomyEntity | undefined {
  const normalized = normalizeCatalogSearchSlug(slug);
  return (
    findGameFacetEntityBySlug(slug) ??
    getAllGameFacetTaxonomyEntities().find((entity) => {
      if (normalizeCatalogSearchSlug(entity.id) === normalized) return true;
      return entity.aliases?.some((alias) => normalizeCatalogSearchSlug(alias) === normalized) ?? false;
    })
  );
}

export async function buildGameFacetProfileView(slug: string): Promise<GameFacetProfileView | null> {
  const entity = findGameFacetProfileEntity(slug);
  if (!entity) return null;

  const assignments = await readAdminSeriesAssignmentsForPublic();
  const games = listedCatalog.filter((game) => matchesGameFacet(game, entity, assignments[game.id]));

  return {
    entity,
    title: entity.name,
    subtitle: `${games.length.toLocaleString("es-ES")} juegos relacionados`,
    games,
  };
}

export async function buildGameFacetCounts(): Promise<Record<string, number>> {
  const assignments = await readAdminSeriesAssignmentsForPublic();
  const entities = getAllGameFacetTaxonomyEntities();
  const counts: Record<string, number> = {};

  for (const entity of entities) counts[entity.slug] = 0;

  for (const game of listedCatalog) {
    for (const entity of entities) {
      if (matchesGameFacet(game, entity, assignments[game.id])) {
        counts[entity.slug] = (counts[entity.slug] ?? 0) + 1;
      }
    }
  }

  return counts;
}
