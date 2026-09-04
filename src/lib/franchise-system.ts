import franchisesData from "../../data/franchise-system/franchises.json";
import classificationsData from "../../data/franchise-system/series-classification.json";
import seriesRelationsData from "../../data/franchise-system/series-franchise-relations.json";
import gameRelationsData from "../../data/franchise-system/game-franchise-relations.json";
import relationshipsData from "../../data/franchise-system/entity-relationships.json";
import redirectsData from "../../data/franchise-system/legacy-series-redirects.json";
import { getCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import { getSeries } from "./indexes";
import type { IndexEntry } from "./types";
import type {
  EntityRelationship,
  FranchiseEntity,
  FranchiseReference,
  FranchiseSystemState,
  GameFranchiseRelation,
  LegacySeriesRedirect,
  RelationshipEntityRef,
  SeriesClassificationEntry,
  SeriesFranchiseRelation,
} from "./franchise-types";

type FranchiseFile = { schemaVersion: number; entities: Record<string, FranchiseEntity> };
type ClassificationFile = { schemaVersion: number; entries: Record<string, SeriesClassificationEntry> };

const franchiseEntities = (franchisesData as FranchiseFile).entities;
const franchiseEntitiesById = new Map(
  Object.values(franchiseEntities).map((franchise) => [franchise.id, franchise]),
);
const classifications = (classificationsData as ClassificationFile).entries;
const seriesFranchiseRelations = (seriesRelationsData as { relations: SeriesFranchiseRelation[] }).relations;
const gameFranchiseRelations = (gameRelationsData as { relations: GameFranchiseRelation[] }).relations;
const entityRelationships = (relationshipsData as { relationships: EntityRelationship[] }).relationships;
const legacyRedirects = (redirectsData as { redirects: LegacySeriesRedirect[] }).redirects;

const gameRelationsByGameId = new Map<string, GameFranchiseRelation[]>();
const gameRelationsByFranchise = new Map<string, GameFranchiseRelation[]>();
for (const relation of gameFranchiseRelations) {
  gameRelationsByGameId.set(relation.gameId, [...(gameRelationsByGameId.get(relation.gameId) ?? []), relation]);
  gameRelationsByFranchise.set(
    relation.franchiseSlug,
    [...(gameRelationsByFranchise.get(relation.franchiseSlug) ?? []), relation],
  );
}

const seriesRelationsBySeries = new Map<string, SeriesFranchiseRelation[]>();
const seriesRelationsByFranchise = new Map<string, SeriesFranchiseRelation[]>();
for (const relation of seriesFranchiseRelations) {
  seriesRelationsBySeries.set(
    relation.seriesSlug,
    [...(seriesRelationsBySeries.get(relation.seriesSlug) ?? []), relation],
  );
  seriesRelationsByFranchise.set(
    relation.franchiseSlug,
    [...(seriesRelationsByFranchise.get(relation.franchiseSlug) ?? []), relation],
  );
}

const redirectByLegacySlug = new Map(legacyRedirects.map((redirect) => [redirect.legacySeriesSlug, redirect]));

export type PublicFranchiseReference = {
  slug: string;
  name: string;
  catalogEntryCount: number;
  matchedCatalogEntryCount: number;
  matchedCatalogIds: string[];
};

export type EntityRelationshipDisplay = {
  id: string;
  label: string;
  relationshipType: EntityRelationship["relationshipType"];
  entityType: EntityRelationship["sourceType"];
  entityId: string;
  entityName: string;
  href: string;
};

export function resolveFranchiseIndexEntry(
  franchise: FranchiseEntity,
  relations: GameFranchiseRelation[] = gameFranchiseRelations,
): IndexEntry {
  const relevantRelations = relations === gameFranchiseRelations
    ? gameRelationsByFranchise.get(franchise.slug) ?? []
    : relations.filter((relation) => relation.franchiseId === franchise.id);
  const games = relevantRelations
    .map((relation) => getCatalogGame(relation.gameId))
    .filter((game) => Boolean(game));
  const gameIds = [...new Set(games.map((game) => game!.id))];
  const byPlatform: Record<string, number> = {};
  for (const game of games) {
    if (!game) continue;
    byPlatform[game.platformSlug] = (byPlatform[game.platformSlug] ?? 0) + 1;
  }
  return {
    name: franchise.name,
    slug: franchise.slug,
    museumPath: `/franquicia/${franchise.slug}`,
    gameIds,
    gameCount: gameIds.length,
    byPlatform: Object.fromEntries(Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b))),
    description: franchise.description,
    backgroundImageUrl: franchise.backgroundImageUrl,
    backgroundImageOpacity: franchise.backgroundImageOpacity,
    backgroundReadability: franchise.backgroundReadability,
    active: franchise.status === "published",
  };
}

export function getFranchiseEntity(slug: string): FranchiseEntity | undefined {
  return franchiseEntities[slug];
}

export function getFranchiseIndexEntry(slug: string): IndexEntry | undefined {
  const franchise = getFranchiseEntity(slug);
  return franchise?.status === "published" ? resolveFranchiseIndexEntry(franchise) : undefined;
}

export function getFranchiseIndexList(): IndexEntry[] {
  return Object.values(franchiseEntities)
    .filter((franchise) => franchise.status === "published")
    .map((franchise) => resolveFranchiseIndexEntry(franchise))
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es", { numeric: true }));
}

export function listPublicFranchisesForCatalogEntries(catalogIds: string[]): PublicFranchiseReference[] {
  const selectedCatalogIds = new Set(catalogIds.map((id) => id.trim()).filter(Boolean));
  if (selectedCatalogIds.size === 0) return [];

  return getFranchiseIndexList()
    .map((entry) => {
      const matchedCatalogIds = entry.gameIds.filter((id) => selectedCatalogIds.has(id));
      return {
        slug: entry.slug,
        name: entry.name,
        catalogEntryCount: entry.gameCount,
        matchedCatalogEntryCount: matchedCatalogIds.length,
        matchedCatalogIds,
      };
    })
    .filter((entry) => entry.matchedCatalogEntryCount > 0)
    .sort(
      (a, b) =>
        b.matchedCatalogEntryCount - a.matchedCatalogEntryCount ||
        a.name.localeCompare(b.name, "es", { numeric: true }),
    );
}

export function getSeriesClassification(slug: string): SeriesClassificationEntry | undefined {
  return classifications[slug];
}

export function getLegacySeriesRedirect(slug: string): LegacySeriesRedirect | undefined {
  return redirectByLegacySlug.get(slug);
}

export function isPromotedLegacySeries(slug: string): boolean {
  return redirectByLegacySlug.has(slug);
}

export function getSeriesFranchiseRelations(slug: string): SeriesFranchiseRelation[] {
  return [...(seriesRelationsBySeries.get(slug) ?? [])];
}

export function getFranchiseSeriesRelations(slug: string): SeriesFranchiseRelation[] {
  return [...(seriesRelationsByFranchise.get(slug) ?? [])];
}

export function getGameFranchiseRelations(gameId: string): GameFranchiseRelation[] {
  return [...(gameRelationsByGameId.get(gameId) ?? [])];
}

export function getFranchisesForCatalogEntry(catalogId: string): FranchiseReference[] {
  return getGameFranchiseRelations(catalogId)
    .map((relation) => {
      const franchise = franchiseEntities[relation.franchiseSlug];
      if (!franchise || franchise.status !== "published") return null;
      return {
        id: franchise.id,
        slug: franchise.slug,
        name: franchise.name,
        primary: relation.primary,
        role: relation.role,
        membership: relation.membership,
      } satisfies FranchiseReference;
    })
    .filter((reference): reference is FranchiseReference => Boolean(reference))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "es"));
}

export function getEntityRelationshipsFor(ref: RelationshipEntityRef): EntityRelationship[] {
  return entityRelationships.filter((relationship) =>
    (relationship.sourceType === ref.type && relationship.sourceId === ref.id) ||
    (relationship.targetType === ref.type && relationship.targetId === ref.id));
}

export function getAllEntityRelationships(): EntityRelationship[] {
  return [...entityRelationships];
}

export function getAllSeriesFranchiseRelations(): SeriesFranchiseRelation[] {
  return seriesFranchiseRelations.map((relation) => ({ ...relation }));
}

export function getAllGameFranchiseRelations(): GameFranchiseRelation[] {
  return gameFranchiseRelations.map((relation) => ({
    ...relation,
    inheritedFromSeriesSlugs: [...relation.inheritedFromSeriesSlugs],
  }));
}

export function getAllFranchiseEntities(): FranchiseEntity[] {
  return Object.values(franchiseEntities).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function getBaseFranchiseSystemState(): FranchiseSystemState {
  return {
    franchises: Object.fromEntries(
      Object.values(franchiseEntities).map((franchise) => [franchise.slug, { ...franchise }]),
    ),
    seriesFranchiseRelations: getAllSeriesFranchiseRelations(),
    gameFranchiseRelations: getAllGameFranchiseRelations(),
    entityRelationships: getAllEntityRelationships().map((relationship) => ({ ...relationship })),
  };
}

function resolveRelationshipEntity(
  ref: RelationshipEntityRef,
  franchises: Record<string, FranchiseEntity> = franchiseEntities,
): {
  name: string;
  href: string;
} | null {
  if (ref.type === "franchise") {
    const franchise = franchises === franchiseEntities
      ? franchiseEntitiesById.get(ref.id)
      : Object.values(franchises).find((entry) => entry.id === ref.id);
    return franchise?.status === "published"
      ? { name: franchise.name, href: `/franquicia/${franchise.slug}` }
      : null;
  }
  if (ref.type === "series") {
    const series = getSeries(ref.id);
    if (!series) return null;
    const redirect = getLegacySeriesRedirect(series.slug);
    return {
      name: series.name,
      href: redirect?.destination ?? `/saga/${series.slug}`,
    };
  }
  const game = getCatalogGame(ref.id);
  return game ? { name: game.title, href: catalogGamePath(game) } : null;
}

function relationshipLabel(
  relationshipType: EntityRelationship["relationshipType"],
  currentIsSource: boolean,
): string {
  const labels: Record<EntityRelationship["relationshipType"], [string, string]> = {
    sequel_to: ["Secuela de", "Tiene como secuela"],
    prequel_to: ["Precuela de", "Tiene como precuela"],
    spin_off_of: ["Spin-off de", "Tiene como spin-off"],
    remake_of: ["Remake de", "Tiene como remake"],
    remaster_of: ["Remasterización de", "Tiene como remasterización"],
    reboot_of: ["Reinicio de", "Tiene como reinicio"],
    crossover_with: ["Crossover con", "Crossover con"],
    derived_from: ["Derivada de", "Origen de"],
    expansion_of: ["Expansión de", "Tiene como expansión"],
    standalone_expansion_of: ["Expansión independiente de", "Tiene como expansión independiente"],
    successor_of: ["Sucesora de", "Tiene como sucesora"],
    parent_of: ["Entidad principal de", "Derivada de"],
    subseries_of: ["Subserie de", "Tiene como subserie"],
    compilation_of: ["Recopilación de", "Incluida en la recopilación"],
  };
  return labels[relationshipType][currentIsSource ? 0 : 1];
}

export function getEntityRelationshipDisplays(
  ref: RelationshipEntityRef,
  options?: {
    relationships?: EntityRelationship[];
    franchises?: Record<string, FranchiseEntity>;
  },
): EntityRelationshipDisplay[] {
  const relationships = options?.relationships ?? entityRelationships;
  return relationships
    .filter((relationship) =>
      (relationship.sourceType === ref.type && relationship.sourceId === ref.id) ||
      (relationship.targetType === ref.type && relationship.targetId === ref.id),
    )
    .map((relationship) => {
      const currentIsSource = relationship.sourceType === ref.type && relationship.sourceId === ref.id;
      const relatedRef = currentIsSource
        ? { type: relationship.targetType, id: relationship.targetId }
        : { type: relationship.sourceType, id: relationship.sourceId };
      const related = resolveRelationshipEntity(relatedRef, options?.franchises);
      if (!related) return null;
      return {
        id: relationship.id,
        label: relationshipLabel(relationship.relationshipType, currentIsSource),
        relationshipType: relationship.relationshipType,
        entityType: relatedRef.type,
        entityId: relatedRef.id,
        entityName: related.name,
        href: related.href,
      } satisfies EntityRelationshipDisplay;
    })
    .filter((item): item is EntityRelationshipDisplay => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label, "es") || a.entityName.localeCompare(b.entityName, "es"));
}
