import searchAliasesData from "../../data/game-search-aliases.json";
import { getAllGameFacetTaxonomyEntities, findGameFacetEntityByNameOrAlias } from "@/lib/game-facets/taxonomy";
import { normalizeCatalogSearchSlug, normalizeCatalogSearchText } from "@/lib/catalog-search-normalize";
import { getGenreEntity } from "@/lib/genre-canonical";

type GameSearchAliasesFile = { groups?: string[][] };

const aliasesFile = searchAliasesData as GameSearchAliasesFile;
const MANUAL_EQUIVALENCE_GROUPS: string[][] = aliasesFile.groups ?? [];
const manualAliasLookup = new Map<string, string[]>();
const textAliasCache = new Map<string, string[]>();
const genreAliasCache = new Map<string, string[]>();

for (const group of MANUAL_EQUIVALENCE_GROUPS) {
  const normalizedGroup = [...new Set(group.flatMap((term) => [normalizeCatalogSearchText(term), normalizeCatalogSearchSlug(term)]).filter(Boolean))];
  for (const term of normalizedGroup) {
    manualAliasLookup.set(term, normalizedGroup);
  }
}

function entityTerms(entity: { id: string; name: string; slug: string; aliases?: string[] }): string[] {
  return [entity.id, entity.name, entity.slug, ...(entity.aliases ?? [])];
}

export function catalogSearchAliasesForText(value: string | null | undefined): string[] {
  const normalized = normalizeCatalogSearchText(value);
  const slug = normalizeCatalogSearchSlug(value);
  if (!normalized && !slug) return [];
  const cacheKey = `${normalized}|${slug}`;
  const cached = textAliasCache.get(cacheKey);
  if (cached) return cached;

  const aliases = new Set<string>();
  for (const key of [normalized, slug]) {
    for (const alias of manualAliasLookup.get(key) ?? []) aliases.add(alias);
  }

  const facetEntity = findGameFacetEntityByNameOrAlias(value ?? "");
  if (facetEntity) {
    for (const term of entityTerms(facetEntity)) {
      aliases.add(normalizeCatalogSearchText(term));
      aliases.add(normalizeCatalogSearchSlug(term));
    }
  }

  const result = [...aliases].filter(Boolean);
  textAliasCache.set(cacheKey, result);
  return result;
}

export function catalogSearchAliasesForGenre(genre: { slug: string; name: string } | null | undefined): string[] {
  if (!genre) return [];
  const cacheKey = `${normalizeCatalogSearchSlug(genre.slug)}|${normalizeCatalogSearchText(genre.name)}`;
  const cached = genreAliasCache.get(cacheKey);
  if (cached) return cached;

  const aliases = new Set<string>();
  for (const term of [genre.slug, genre.name]) {
    aliases.add(normalizeCatalogSearchText(term));
    aliases.add(normalizeCatalogSearchSlug(term));
    for (const alias of catalogSearchAliasesForText(term)) aliases.add(alias);
  }

  const genreEntity = getGenreEntity(genre.slug);
  if (genreEntity) {
    for (const term of [
      genreEntity.slug,
      genreEntity.name,
      ...(genreEntity.aliasSlugs ?? []),
      ...(genreEntity.aliasNames ?? []),
    ]) {
      aliases.add(normalizeCatalogSearchText(term));
      aliases.add(normalizeCatalogSearchSlug(term));
      for (const alias of catalogSearchAliasesForText(term)) aliases.add(alias);
    }
  }

  for (const entity of getAllGameFacetTaxonomyEntities()) {
    const terms = entityTerms(entity).map((term) => normalizeCatalogSearchText(term));
    if (terms.includes(normalizeCatalogSearchText(genre.name)) || terms.includes(normalizeCatalogSearchText(genre.slug))) {
      for (const term of entityTerms(entity)) {
        aliases.add(normalizeCatalogSearchText(term));
        aliases.add(normalizeCatalogSearchSlug(term));
        for (const alias of catalogSearchAliasesForText(term)) aliases.add(alias);
      }
    }
  }

  const result = [...aliases].filter(Boolean);
  genreAliasCache.set(cacheKey, result);
  return result;
}
