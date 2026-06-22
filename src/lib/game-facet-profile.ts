import { publicListedCatalog } from "@/lib/catalog";
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
  recommendedGames: CatalogGame[];
  originGame?: CatalogGame;
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
    ...removeHiddenEntities(details?.genres ?? [], assignment?.hiddenGenres),
    ...removeHiddenEntities(details?.subgenres ?? [], assignment?.hiddenFacets),
    ...removeHiddenEntities(details?.facets ?? [], assignment?.hiddenFacets),
    ...removeHiddenEntities(details?.tags ?? [], assignment?.hiddenTags),
    ...(assignment?.genres ?? []),
    ...(assignment?.tags ?? []),
    ...(assignment?.facets ?? []),
  ];
}

function matchesGameFacet(game: CatalogGame, entity: GameFacetTaxonomyEntity, assignment?: AdminSeriesAssignment): boolean {
  const terms = entityTerms(entity);
  const details = getGameDetails(game.id);
  const canonicalGenres = (details?.genres ?? []).map(resolveCanonicalGenreEntity);

  return (
    matchesAnyDetailEntity(removeHiddenEntities(details?.genres ?? [], assignment?.hiddenGenres), terms) ||
    matchesAnyDetailEntity(
      removeHiddenEntities(canonicalGenres.map((genre) => ({ name: genre.name, slug: genre.slug })), assignment?.hiddenGenres),
      terms,
    ) ||
    matchesAnyDetailEntity(assignmentAwareEntities(details, assignment), terms)
  );
}

function taxonomyKeys(entities: DetailEntity[]): Set<string> {
  return new Set(
    entities
      .flatMap((entity) => {
        const taxonomyEntity =
          findGameFacetEntityBySlug(entity.slug) ?? findGameFacetEntityByNameOrAlias(entity.name);
        return [entity.slug, entity.name, taxonomyEntity?.slug, taxonomyEntity?.id];
      })
      .flatMap((term) => (term ? [normalizeCatalogSearchSlug(term), normalizeCatalogSearchText(term)] : []))
      .filter(Boolean),
  );
}

function overlapScore(a: Set<string>, b: Set<string>, weight: number): number {
  let score = 0;
  for (const key of a) {
    if (b.has(key)) score += weight;
  }
  return score;
}

function scoreRelatedGame(originGame: CatalogGame, candidate: CatalogGame): number {
  const originDetails = getGameDetails(originGame.id);
  const candidateDetails = getGameDetails(candidate.id);
  if (!originDetails || !candidateDetails) return 0;

  const originGenres = taxonomyKeys(originDetails.genres ?? []);
  const candidateGenres = taxonomyKeys(candidateDetails.genres ?? []);
  const originSubgenres = taxonomyKeys(originDetails.subgenres ?? []);
  const candidateSubgenres = taxonomyKeys(candidateDetails.subgenres ?? []);
  const originFacets = taxonomyKeys([...(originDetails.facets ?? []), ...(originDetails.tags ?? [])]);
  const candidateFacets = taxonomyKeys([...(candidateDetails.facets ?? []), ...(candidateDetails.tags ?? [])]);

  return (
    overlapScore(originGenres, candidateGenres, 4) +
    overlapScore(originSubgenres, candidateSubgenres, 3) +
    overlapScore(originFacets, candidateFacets, 2) +
    (originGame.platformSlug === candidate.platformSlug ? 1 : 0) +
    (originGame.region === candidate.region ? 0.5 : 0)
  );
}

export function pickRecommendedGames(games: CatalogGame[], fromCatalogId?: string | null): {
  originGame?: CatalogGame;
  recommendedGames: CatalogGame[];
} {
  const originGame = fromCatalogId ? publicListedCatalog.find((game) => game.id === fromCatalogId) : undefined;

  if (!originGame) {
    return {
      recommendedGames: games.slice(0, 6),
    };
  }

  const recommendedGames = games
    .filter((game) => game.id !== originGame.id)
    .map((game) => ({ game, score: scoreRelatedGame(originGame, game) }))
    .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title, "es", { sensitivity: "base" }))
    .slice(0, 6)
    .map(({ game }) => game);

  return { originGame, recommendedGames };
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

export async function buildGameFacetProfileView(
  slug: string,
  options: { fromCatalogId?: string | null } = {},
): Promise<GameFacetProfileView | null> {
  const entity = findGameFacetProfileEntity(slug);
  if (!entity) return null;

  const assignments = await readAdminSeriesAssignmentsForPublic();
  const games = publicListedCatalog.filter((game) => matchesGameFacet(game, entity, assignments[game.id]));
  const { originGame, recommendedGames } = pickRecommendedGames(games, options.fromCatalogId);

  return {
    entity,
    title: entity.name,
    subtitle: `${games.length.toLocaleString("es-ES")} juegos relacionados`,
    games,
    recommendedGames,
    originGame,
  };
}

export async function buildGameFacetCounts(): Promise<Record<string, number>> {
  const assignments = await readAdminSeriesAssignmentsForPublic();
  const entities = getAllGameFacetTaxonomyEntities();
  const counts: Record<string, number> = {};

  for (const entity of entities) counts[entity.slug] = 0;

  for (const game of publicListedCatalog) {
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
