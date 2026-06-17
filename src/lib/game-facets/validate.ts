import { GAME_FACET_FAMILIES, type GameFacetTaxonomyEntity, type GameFacetsTaxonomy, type GameFacetTaxonomyValidationResult } from "./types";

const VALID_STATUSES = new Set(["approved", "review", "hidden"]);
const VALID_TYPES = new Set(["genre", "subgenre", "facet"]);
const VALID_FAMILIES = new Set<string>(GAME_FACET_FAMILIES);

function validateEntityShape(entity: GameFacetTaxonomyEntity, collectionName: string, index: number): string[] {
  const errors: string[] = [];
  const label = `${collectionName}[${index}]`;
  if (!entity || typeof entity !== "object") return [`${label} no es un objeto válido`];
  if (!entity.id || typeof entity.id !== "string") errors.push(`${label} no tiene id string`);
  if (!entity.name || typeof entity.name !== "string") errors.push(`${label} no tiene name string`);
  if (!entity.slug || typeof entity.slug !== "string") errors.push(`${label} no tiene slug string`);
  if (!VALID_TYPES.has(entity.type)) errors.push(`${label} tiene type no válido`);
  if (!entity.description || typeof entity.description !== "string") errors.push(`${label} no tiene description string`);
  if (!VALID_STATUSES.has(entity.status)) errors.push(`${label} tiene status no válido`);
  if (entity.aliases && !Array.isArray(entity.aliases)) errors.push(`${label} aliases debe ser array si existe`);
  if ((entity.type === "subgenre" || entity.type === "facet") && !VALID_FAMILIES.has(entity.family)) {
    errors.push(`${label} tiene family no válida`);
  }
  if (entity.type === "subgenre" && (!Array.isArray(entity.parentGenreIds) || entity.parentGenreIds.length === 0)) {
    errors.push(`${label} debe tener parentGenreIds no vacío`);
  }
  return errors;
}

export function flattenGameFacetsTaxonomy(taxonomy: GameFacetsTaxonomy): GameFacetTaxonomyEntity[] {
  return [...taxonomy.genres, ...taxonomy.subgenres, ...taxonomy.facets];
}

export function validateGameFacetsTaxonomy(taxonomy: GameFacetsTaxonomy): GameFacetTaxonomyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(taxonomy.genres)) errors.push("taxonomy.genres debe ser array");
  if (!Array.isArray(taxonomy.subgenres)) errors.push("taxonomy.subgenres debe ser array");
  if (!Array.isArray(taxonomy.facets)) errors.push("taxonomy.facets debe ser array");
  if (errors.length) return { ok: false, errors, warnings };

  taxonomy.genres.forEach((entity, index) => errors.push(...validateEntityShape(entity, "genres", index)));
  taxonomy.subgenres.forEach((entity, index) => errors.push(...validateEntityShape(entity, "subgenres", index)));
  taxonomy.facets.forEach((entity, index) => errors.push(...validateEntityShape(entity, "facets", index)));

  const entities = flattenGameFacetsTaxonomy(taxonomy);
  const ids = new Set<string>();
  const genreSlugs = new Set<string>();
  const subgenreSlugs = new Set<string>();
  const facetSlugs = new Set<string>();
  const genreIds = new Set(taxonomy.genres.map((genre) => genre.id));

  for (const entity of entities) {
    if (ids.has(entity.id)) errors.push(`id duplicado: ${entity.id}`);
    ids.add(entity.id);

    const slugSet = entity.type === "genre" ? genreSlugs : entity.type === "subgenre" ? subgenreSlugs : facetSlugs;
    if (slugSet.has(entity.slug)) errors.push(`slug duplicado en ${entity.type}: ${entity.slug}`);
    slugSet.add(entity.slug);

    if (entity.aliases?.some((alias) => !alias.trim())) warnings.push(`alias vacío en ${entity.id}`);
  }

  for (const subgenre of taxonomy.subgenres) {
    for (const parentGenreId of subgenre.parentGenreIds) {
      if (!genreIds.has(parentGenreId)) errors.push(`parentGenreId inexistente en ${subgenre.id}: ${parentGenreId}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
