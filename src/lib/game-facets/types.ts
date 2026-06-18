export type GameFacetTaxonomyType = "genre" | "subgenre" | "facet";

export type GameFacetStatus = "approved" | "review" | "hidden";

export type GameFacetPriority = "A" | "B" | "C" | "D";

export type GameFacetFamily =
  | "content"
  | "edition"
  | "format"
  | "gameplay"
  | "market"
  | "mechanic"
  | "perspective"
  | "player_mode"
  | "setting"
  | "sport"
  | "technical"
  | "theme"
  | "visual";

export const GAME_FACET_FAMILIES: readonly GameFacetFamily[] = [
  "content",
  "edition",
  "format",
  "gameplay",
  "market",
  "mechanic",
  "perspective",
  "player_mode",
  "setting",
  "sport",
  "technical",
  "theme",
  "visual",
] as const;

export type GameFacetBase = {
  id: string;
  name: string;
  nameEn?: string;
  slug: string;
  canonicalSlug?: string;
  type: GameFacetTaxonomyType;
  aliases?: string[];
  description: string;
  status: GameFacetStatus;
  priority?: GameFacetPriority;
  publicEligible?: boolean;
  seoEligible?: boolean;
  group?: string;
  subfamily?: string;
};

export type GameFacetGenre = GameFacetBase & {
  type: "genre";
};

export type GameFacetSubgenre = GameFacetBase & {
  type: "subgenre";
  family: GameFacetFamily;
  parentGenreIds: string[];
};

export type GameFacet = GameFacetBase & {
  type: "facet";
  family: GameFacetFamily;
};

export type GameFacetsTaxonomy = {
  genres: GameFacetGenre[];
  subgenres: GameFacetSubgenre[];
  facets: GameFacet[];
};

export type GameFacetTaxonomyEntity = GameFacetGenre | GameFacetSubgenre | GameFacet;

export type GameFacetTaxonomyValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};
