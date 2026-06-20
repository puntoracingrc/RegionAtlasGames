import taxonomyData from "../../../data/game-facets-taxonomy.json";
import { normalizeFacetSlug, normalizeFacetText } from "./normalize";
import type { GameFacetTaxonomyEntity, GameFacetsTaxonomy } from "./types";
import { validateGameFacetsTaxonomy } from "./validate";

const taxonomy = taxonomyData as GameFacetsTaxonomy;
const validation = validateGameFacetsTaxonomy(taxonomy);

if (!validation.ok) {
  throw new Error(`GAME_FACETS_V1 taxonomy inválida: ${validation.errors.join("; ")}`);
}

const allEntities: GameFacetTaxonomyEntity[] = [...taxonomy.genres, ...taxonomy.subgenres, ...taxonomy.facets];
const entityById = new Map(allEntities.map((entity) => [entity.id, entity]));
const entityBySlug = new Map<string, GameFacetTaxonomyEntity>();
const entityBySearchAlias = new Map<string, GameFacetTaxonomyEntity>();
const entityByNameAlias = new Map<string, GameFacetTaxonomyEntity>();

function setIfMissing(map: Map<string, GameFacetTaxonomyEntity>, key: string | undefined, entity: GameFacetTaxonomyEntity): void {
  const normalizedKey = key ? normalizeFacetText(key) : "";
  if (normalizedKey && !map.has(normalizedKey)) map.set(normalizedKey, entity);
}

for (const entity of allEntities) {
  entityBySlug.set(normalizeFacetSlug(entity.slug), entity);
  for (const alias of entity.searchAliases ?? []) setIfMissing(entityBySearchAlias, alias, entity);
  setIfMissing(entityByNameAlias, entity.name, entity);
  setIfMissing(entityByNameAlias, entity.nameEn, entity);
  for (const alias of entity.aliases ?? []) setIfMissing(entityByNameAlias, alias, entity);
}

export function getGameFacetsTaxonomy(): GameFacetsTaxonomy {
  return taxonomy;
}

export function getAllGameFacetTaxonomyEntities(): GameFacetTaxonomyEntity[] {
  return allEntities;
}

export function findGameFacetEntityById(id: string): GameFacetTaxonomyEntity | undefined {
  return entityById.get(id);
}

export function findGameFacetEntityBySlug(slug: string): GameFacetTaxonomyEntity | undefined {
  return entityBySlug.get(normalizeFacetSlug(slug));
}

export function findGameFacetEntityByNameOrAlias(value: string): GameFacetTaxonomyEntity | undefined {
  const normalizedValue = normalizeFacetText(value);
  const bySearchAlias = entityBySearchAlias.get(normalizedValue);
  if (bySearchAlias) return bySearchAlias;
  return entityByNameAlias.get(normalizedValue);
}

export function getGameFacetTaxonomyCounts(): { genres: number; subgenres: number; facets: number } {
  return {
    genres: taxonomy.genres.length,
    subgenres: taxonomy.subgenres.length,
    facets: taxonomy.facets.length,
  };
}
