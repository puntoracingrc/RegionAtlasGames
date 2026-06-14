export type DetailEntitySource = "museum" | "pricecharting" | "serialstation" | "wikidata" | "merged";

export type DetailEntity = {
  name: string;
  slug: string;
  museumPath?: string | null;
  pcPath?: string | null;
  wikidataId?: string | null;
  serialstationId?: string | null;
  source?: DetailEntitySource;
};

/** @deprecated use DetailEntity */
export type MuseumEntity = DetailEntity;

export type GameDetailsFieldSource = "museum" | "pricecharting" | "serialstation" | "wikidata";

export type GameDetailsSources = {
  museum?: { museumPath: string; fetchedAt: string };
  pricecharting?: { pcPath: string; fetchedAt: string; productId?: number | null };
  serialstation?: {
    serialstationId: string;
    titleId?: string | null;
    matchMethod?: "reference" | "title" | null;
    matchScore?: number | null;
    fetchedAt: string;
  };
  wikidata?: { wikidataId: string; fetchedAt: string; matchScore?: number | null };
};

export type GameDetailsSeoFaq = { question: string; answer: string };

export type GameDetailsSeoMeta = {
  seoTitle?: string;
  seoDescription?: string;
  coverAlt?: string;
  jsonLdDescription?: string;
  faqs?: GameDetailsSeoFaq[];
  highlights?: string[];
  generatedAt?: string;
  method?: "ai" | "template";
  model?: string | null;
};

export type GameDetails = {
  year: number | null;
  releaseDate: string | null;
  reference: string | null;
  players: number | null;
  support: string | null;
  developer: DetailEntity | null;
  publisher: DetailEntity | null;
  genres: DetailEntity[];
  series: DetailEntity | null;
  museumPath?: string | null;
  pcProductId?: number | null;
  ean?: string | null;
  sources?: GameDetailsSources;
  fieldSources?: Partial<
    Record<
      | "developer"
      | "publisher"
      | "genres"
      | "series"
      | "reference"
      | "year"
      | "releaseDate"
      | "players"
      | "support",
      GameDetailsFieldSource
    >
  >;
  fetchedAt: string;
  mergedAt?: string;
  description?: string | null;
  descriptionMeta?: {
    generatedAt?: string;
    method?: "ai" | "template";
    model?: string | null;
    referenceUsed?: boolean;
    referenceUrl?: string | null;
  };
  seoMeta?: GameDetailsSeoMeta | null;
};

export type IndexEntry = {
  name: string;
  slug: string;
  museumPath: string;
  gameIds: string[];
  byPlatform: Record<string, number>;
  gameCount: number;
  asDeveloper?: string[];
  asPublisher?: string[];
  wikidataId?: string | null;
  aliasSlugs?: string[];
  aliasNames?: string[];
  mergeMethod?: "manual" | "wikidata" | "museum" | "normalized" | "slug";
};

export type PlatformStatus = "closed" | "semi-closed";

export type Platform = {
  slug: string;
  name: string;
  shortName: string;
  manufacturer: "nintendo" | "sony" | "sega";
  status: PlatformStatus;
  estimatedCatalogSize: number;
  sortOrder: number;
  description: string;
};

export type CatalogGame = {
  id: string;
  slug: string;
  title: string;
  titlePc: string | null;
  platformSlug: string;
  region: string;
  edition: string;
  listingStatus: "listed" | "pending" | "excluded";
  excludeCategory?: string | null;
  excludeReason?: string | null;
  museumRegion?: string | null;
  museumPath?: string | null;
  museumSlug?: string | null;
  coverUrl: string | null;
  pcId: number | null;
  pcPath?: string | null;
  pcRegion: string | null;
  pcCondition: string | null;
  matchConfidence: string | null;
  marketMin: number | null;
  marketMax: number | null;
  recommendedPrice: number | null;
  /** Media por estado (todas las fuentes verificadas) */
  estimatedPriceLoose?: number | null;
  estimatedPriceComplete?: number | null;
  estimatedPriceSealed?: number | null;
  /** Origen de datos agregados (TodoColeccion, CeX, …) */
  priceDataSources?: string | null;
  pcRefPrice: number | null;
  deltaEsVsPc: number | null;
  priceSource: string | null;
  updatedAt: string | null;
  hasEsPrice: boolean;
  /** true solo si el precio ES proviene de anuncios con región verificada */
  priceRegionVerified?: boolean;
  /** Referencia retail CeX (no mezclada con mercado P2P) */
  cexSellPrice?: number | null;
  cexCashPrice?: number | null;
  cexProductUrl?: string | null;
  cexMatchedAt?: string | null;
  cexRegionVerified?: boolean;
  /** Referencia retail Japan Game Online (import JP en ES) */
  jgoRetailPrice?: number | null;
  jgoProductUrl?: string | null;
  jgoMatchedAt?: string | null;
  jgoCondition?: string | null;
  jgoInStock?: boolean;
  /** Referencia retail Chollo Games (importación Madrid) */
  cholloRetailPrice?: number | null;
  cholloProductUrl?: string | null;
  cholloMatchedAt?: string | null;
  cholloCondition?: string | null;
  cholloInStock?: boolean;
  /** Referencia retail Kaoto Store (Shopify) */
  kaotoRetailPrice?: number | null;
  kaotoProductUrl?: string | null;
  kaotoMatchedAt?: string | null;
  kaotoCondition?: string | null;
  kaotoInStock?: boolean;
  /** Mejor lote activo TodoColeccion (particular / subasta ES) */
  tcListingPrice?: number | null;
  tcProductUrl?: string | null;
  tcMatchedAt?: string | null;
  /** Referencia retail TodoConsolas (segunda mano ES) */
  tcnsRetailPrice?: number | null;
  tcnsProductUrl?: string | null;
  tcnsMatchedAt?: string | null;
  tcnsCondition?: string | null;
  tcnsInStock?: boolean;
};

export type CollectionItem = {
  id: string;
  catalogId: string | null;
  catalogMatched?: boolean;
  inRetroCatalog: boolean;
  title: string;
  titlePc?: string | null;
  consoleName?: string | null;
  pcImportId?: number | null;
  platformSlug: string;
  region: string;
  sealed: boolean;
  quantity: number;
  quantityPc: number | null;
  buyPrice: number | null;
  previousSalePrice: number | null;
  totalValue: number | null;
  notes: string | null;
  marketMin: number | null;
  marketMax: number | null;
  recommendedPrice: number | null;
  estimatedPriceLoose?: number | null;
  estimatedPriceComplete?: number | null;
  estimatedPriceSealed?: number | null;
  priceDataSources?: string | null;
  pcRefPrice: number | null;
  deltaEsVsPc: number | null;
  priceSource: string | null;
  updatedAt: string | null;
  hasEsPrice: boolean;
  /** ISO — cuándo se añadió a la colección (manual o enlace a catálogo). */
  addedAt?: string | null;
  priceRegionVerified?: boolean;
  cexSellPrice?: number | null;
  cexCashPrice?: number | null;
  cexProductUrl?: string | null;
  cexMatchedAt?: string | null;
  cexRegionVerified?: boolean;
  jgoRetailPrice?: number | null;
  jgoProductUrl?: string | null;
  jgoMatchedAt?: string | null;
  jgoCondition?: string | null;
  jgoInStock?: boolean;
  cholloRetailPrice?: number | null;
  cholloProductUrl?: string | null;
  cholloMatchedAt?: string | null;
  cholloCondition?: string | null;
  cholloInStock?: boolean;
  kaotoRetailPrice?: number | null;
  kaotoProductUrl?: string | null;
  kaotoMatchedAt?: string | null;
  kaotoCondition?: string | null;
  kaotoInStock?: boolean;
  tcListingPrice?: number | null;
  tcProductUrl?: string | null;
  tcMatchedAt?: string | null;
  tcnsRetailPrice?: number | null;
  tcnsProductUrl?: string | null;
  tcnsMatchedAt?: string | null;
  tcnsCondition?: string | null;
  tcnsInStock?: boolean;
};

export type CatalogMeta = {
  importedAt: string;
  source: string;
  catalogScope: string;
  platformCount: number;
  catalogListed: number;
  catalogExcluded?: number;
  catalogTotal?: number;
  catalogEstimatedTotal: number;
  listedByPlatform: Record<string, number>;
  excludedByPlatform?: Record<string, number>;
  curationByCategory?: Record<string, number>;
  lastCuratedAt?: string;
  gamesWithDetails?: number;
  indexCompanies?: number;
  indexGenres?: number;
  collection: {
    totalItems: number;
    retroItems: number;
    outOfScopeItems: number;
    totalUnits: number;
    withEsPrice: number;
    pendingEsPrice: number;
    totalRecommendedValue: number;
    totalBuyValue: number;
  };
};

/** Vista unificada para tarjetas de colección */
export type CollectionView = CollectionItem & {
  coverUrl: string | null;
  titlePc: string | null;
  pcId: number | null;
  /** Ficha de catálogo detectada pero aún no enlazada por el usuario */
  availableCatalogId?: string | null;
};

export type CollectionSort = "added-desc" | "title-asc" | "year-asc" | "year-desc";

export type GameFilters = {
  q: string;
  platform: string;
  developer: string;
  publisher: string;
  sort: CollectionSort;
  sealed: "all" | "yes" | "no";
};

/** @deprecated usar CollectionView */
export type Game = CollectionView;
