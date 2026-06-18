import { getGameFacetsTaxonomy } from "./game-facets/taxonomy";

export type AdminGameEditorTaxonomyOption = {
  slug: string;
  name: string;
  type: "genre" | "subgenre" | "facet";
  family?: string;
  parentGenreSlugs?: string[];
};

export function getAdminGameEditorTaxonomyOptions(): {
  genres: AdminGameEditorTaxonomyOption[];
  subgenres: AdminGameEditorTaxonomyOption[];
  facets: AdminGameEditorTaxonomyOption[];
} {
  const taxonomy = getGameFacetsTaxonomy();
  const genreSlugById = new Map(taxonomy.genres.map((genre) => [genre.id, genre.slug]));

  return {
    genres: taxonomy.genres
      .filter((entity) => entity.status === "approved")
      .map((entity): AdminGameEditorTaxonomyOption => ({ slug: entity.slug, name: entity.name, type: "genre" }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    subgenres: taxonomy.subgenres
      .filter((entity) => entity.status === "approved")
      .map((entity): AdminGameEditorTaxonomyOption => ({
        slug: entity.slug,
        name: entity.name,
        type: "subgenre",
        family: entity.family,
        parentGenreSlugs: entity.parentGenreIds
          .map((id) => genreSlugById.get(id))
          .filter((slug): slug is string => Boolean(slug)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    facets: taxonomy.facets
      .filter((entity) => entity.status === "approved")
      .map((entity): AdminGameEditorTaxonomyOption => ({ slug: entity.slug, name: entity.name, type: "facet", family: entity.family }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
  };
}
