import { GAME_FACET_FAMILIES, type GameFacetTaxonomyEntity, type GameFacetsTaxonomy, type GameFacetTaxonomyValidationResult } from "./types";

const VALID_STATUSES = new Set(["approved", "review", "hidden"]);
const VALID_TYPES = new Set(["genre", "subgenre", "facet"]);
const VALID_FAMILIES = new Set<string>(GAME_FACET_FAMILIES);
const VALID_PRIORITIES = new Set(["A", "B", "C", "D"]);

function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validateEntityShape(entity: GameFacetTaxonomyEntity, collectionName: string, index: number): string[] {
  const errors: string[] = [];
  const label = `${collectionName}[${index}]`;
  if (!entity || typeof entity !== "object") return [`${label} no es un objeto válido`];
  if (!entity.id || typeof entity.id !== "string") errors.push(`${label} no tiene id string`);
  if (!entity.name || typeof entity.name !== "string") errors.push(`${label} no tiene name string`);
  if (entity.nameEn && typeof entity.nameEn !== "string") errors.push(`${label} nameEn debe ser string si existe`);
  if (!entity.slug || typeof entity.slug !== "string") errors.push(`${label} no tiene slug string`);
  if (entity.canonicalSlug && typeof entity.canonicalSlug !== "string") errors.push(`${label} canonicalSlug debe ser string si existe`);
  if (!VALID_TYPES.has(entity.type)) errors.push(`${label} tiene type no válido`);
  if (!entity.description || typeof entity.description !== "string") errors.push(`${label} no tiene description string`);
  if (!VALID_STATUSES.has(entity.status)) errors.push(`${label} tiene status no válido`);
  if (entity.priority && !VALID_PRIORITIES.has(entity.priority)) errors.push(`${label} tiene priority no válida`);
  if (entity.publicEligible !== undefined && typeof entity.publicEligible !== "boolean") errors.push(`${label} publicEligible debe ser boolean si existe`);
  if (entity.seoEligible !== undefined && typeof entity.seoEligible !== "boolean") errors.push(`${label} seoEligible debe ser boolean si existe`);
  if (entity.group !== undefined && typeof entity.group !== "string") errors.push(`${label} group debe ser string si existe`);
  if (entity.subfamily !== undefined && typeof entity.subfamily !== "string") errors.push(`${label} subfamily debe ser string si existe`);
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
    const aliases = entity.aliases ?? [];
    const comparableTerms = [entity.name, entity.nameEn, entity.slug, entity.canonicalSlug, ...aliases]
      .filter((term): term is string => typeof term === "string" && Boolean(term.trim()))
      .map(normalizeComparable);
    const uniqueComparableTerms = new Set(comparableTerms);
    if (uniqueComparableTerms.size !== comparableTerms.length) warnings.push(`alias/nombre repetido en ${entity.id}`);
  }

  const comparableOwner = new Map<string, string>();
  const knownEquivalentPairs = new Set([
    "cars|coches",
    "coches|cars",
    "horror|terror",
    "terror|horror",
    "football|futbol",
    "futbol|football",
    "soccer|futbol",
    "futbol|soccer",
    "basketball|baloncesto",
    "baloncesto|basketball",
    "racing|carreras",
    "carreras|racing",
  ]);
  for (const entity of entities) {
    const terms = [entity.name, entity.nameEn, entity.slug, entity.canonicalSlug, ...(entity.aliases ?? [])]
      .filter((term): term is string => typeof term === "string" && Boolean(term.trim()))
      .map(normalizeComparable);
    for (const term of terms) {
      const owner = comparableOwner.get(term);
      if (owner && owner !== entity.id) {
        warnings.push(`posible alias duplicado: "${term}" aparece en ${owner} y ${entity.id}`);
      } else {
        comparableOwner.set(term, entity.id);
      }
    }
  }
  for (const [term, owner] of comparableOwner) {
    for (const [otherTerm, otherOwner] of comparableOwner) {
      if (owner === otherOwner) continue;
      if (knownEquivalentPairs.has(`${term}|${otherTerm}`)) {
        warnings.push(`posible equivalente semántico: "${term}" (${owner}) / "${otherTerm}" (${otherOwner})`);
      }
    }
  }

  for (const subgenre of taxonomy.subgenres) {
    for (const parentGenreId of subgenre.parentGenreIds) {
      if (!genreIds.has(parentGenreId)) errors.push(`parentGenreId inexistente en ${subgenre.id}: ${parentGenreId}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
