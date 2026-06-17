import taxonomyData from "../../../data/game-facets-taxonomy.json";
import { normalizeFacetSlug, normalizeFacetText } from "./normalize";
import type { GameFacetTaxonomyEntity, GameFacetsTaxonomy } from "./types";
import { validateGameFacetsTaxonomy } from "./validate";

const taxonomy = taxonomyData as GameFacetsTaxonomy;
const validation = validateGameFacetsTaxonomy(taxonomy);

if (!validation.ok) {
  throw new Error(`GAME_FACETS_V1 taxonomy inválida: ${validation.errors.join("; ")}`);
}

export function getGameFacetsTaxonomy(): GameFacetsTaxonomy {
  return taxonomy;
}

export function getAllGameFacetTaxonomyEntities(): GameFacetTaxonomyEntity[] {
  return [...taxonomy.genres, ...taxonomy.subgenres, ...taxonomy.facets];
}

export function findGameFacetEntityById(id: string): GameFacetTaxonomyEntity | undefined {
  return getAllGameFacetTaxonomyEntities().find((entity) => entity.id === id);
}

export function findGameFacetEntityBySlug(slug: string): GameFacetTaxonomyEntity | undefined {
  const normalizedSlug = normalizeFacetSlug(slug);
  return getAllGameFacetTaxonomyEntities().find((entity) => normalizeFacetSlug(entity.slug) === normalizedSlug);
}

export function findGameFacetEntityByNameOrAlias(value: string): GameFacetTaxonomyEntity | undefined {
  const normalizedValue = normalizeFacetText(value);
  return getAllGameFacetTaxonomyEntities().find((entity) => {
    if (normalizeFacetText(entity.name) === normalizedValue) return true;
    return entity.aliases?.some((alias) => normalizeFacetText(alias) === normalizedValue) ?? false;
  });
}

export function getGameFacetTaxonomyCounts(): { genres: number; subgenres: number; facets: number } {
  return {
    genres: taxonomy.genres.length,
    subgenres: taxonomy.subgenres.length,
    facets: taxonomy.facets.length,
  };
}
