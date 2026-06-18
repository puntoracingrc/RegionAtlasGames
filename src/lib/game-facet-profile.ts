import { listedCatalog } from "@/lib/catalog";
import { normalizeCatalogSearchSlug, normalizeCatalogSearchText } from "@/lib/catalog-search-normalize";
import { resolveCanonicalGenreEntity } from "@/lib/genre-canonical";
import { getGameDetails } from "@/lib/indexes";
import {
  getAllGameFacetTaxonomyEntities,
  findGameFacetEntityByNameOrAlias,
  findGameFacetEntityBySlug,
} from "@/lib/game-facets/taxonomy";
import type { GameFacetTaxonomyEntity } from "@/lib/game-facets/types";
import { readAdminSeriesAssignmentsForPublic, type AdminSeriesAssignment } from "@/lib/admin-series-manager";
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

function removeHiddenEntities(existing: DetailEntity[], hidden: DetailEntity[] | undefined): DetailEntity[] {
  const hiddenSlugs = new Set((hidden ?? []).map((entity) => entity.slug));
  if (hiddenSlugs.size === 0) return existing;
  return existing.filter((entity) => !hiddenSlugs.has(entity.slug));
}

function assignmentAwareEntities(details: ReturnType<typeof getGameDetails>, assignment?: AdminSeriesAssignment): DetailEntity[] {
  return [
    ...removeHiddenEntities(details?.subgenres ?? [], assignment?.hiddenFacets),
    ...removeHiddenEntities(details?.facets ?? [], assignment?.hiddenFacets),
    ...removeHiddenEntities(details?.tags ?? [], assignment?.hiddenTags),
    ...(assignment?.tags ?? []),
    ...(assignment?.facets ?? []),
  ];
}

function matchesGameFacet(game: CatalogGame, entity: GameFacetTaxonomyEntity, assignment?: AdminSeriesAssignment): boolean {
  const terms = entityTerms(entity);
  const details = getGameDetails(game.id);
  const canonicalGenres = (details?.genres ?? []).map(resolveCanonicalGenreEntity);

  return (
    matchesAnyDetailEntity(details?.genres ?? [], terms) ||
    matchesAnyDetailEntity(canonicalGenres.map((genre) => ({ name: genre.name, slug: genre.slug })), terms) ||
    matchesAnyDetailEntity(assignmentAwareEntities(details, assignment), terms)
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
    const details = getGameDetails(game.id);
    const matchedSlugs = new Set<string>();
    const canonicalGenres = (details?.genres ?? []).map(resolveCanonicalGenreEntity);
    const detailEntities = [
      ...(details?.genres ?? []),
      ...canonicalGenres.map((genre) => ({ name: genre.name, slug: genre.slug })),
      ...assignmentAwareEntities(details, assignments[game.id]),
    ];

    for (const detailEntity of detailEntities) {
      const entity =
        findGameFacetEntityBySlug(detailEntity.slug) ??
        findGameFacetEntityByNameOrAlias(detailEntity.name);
      if (entity) matchedSlugs.add(entity.slug);
    }

    for (const slug of matchedSlugs) {
      if (slug in counts) counts[slug] = (counts[slug] ?? 0) + 1;
    }
  }

  return counts;
}
