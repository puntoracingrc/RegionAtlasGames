export type DetailEntitySource = "museum" | "pricecharting" | "serialstation" | "wikidata" | "game-es" | "merged";

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

export type GameDetailsFieldSource = "museum" | "pricecharting" | "serialstation" | "wikidata" | "game-es";

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
  gameEs?: {
    sku: string;
    productUrl: string;
    imageUrl?: string | null;
    fetchedAt: string;
    preowned?: { sku: string; productUrl: string; fetchedAt: string } | null;
  };
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

export type GameVideo = {
  provider: "youtube";
  source: "youtube-serpapi" | "manual";
  videoId: string;
  url: string;
  title: string;
  channelTitle?: string | null;
  channelUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  duration?: string | null;
  kind?: "official-trailer" | "official-gameplay" | "official-video" | "related";
  fetchedAt?: string;
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
  /** Subgéneros controlados por la taxonomía nueva. No sustituyen al género principal. */
  subgenres?: DetailEntity[];
  /** Facetas controladas: tono, mecánicas, tema, formato, mercado, etc. */
  facets?: DetailEntity[];
  /** Etiquetas flexibles estilo Steam: no sustituyen a los géneros. */
  tags?: DetailEntity[];
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
      | "subgenres"
      | "facets"
      | "tags"
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
  videos?: GameVideo[];
  pegi?: number | null;
};

export type IndexEntry = {
  name: string;
  slug: string;
  museumPath: string;
  gameIds: string[];
  byPlatform: Record<string, number>;
  gameCount: number;
  description?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number | null;
  backgroundReadability?: "soft" | "normal" | "strong" | null;
  active?: boolean;
  asDeveloper?: string[];
  asPublisher?: string[];
  wikidataId?: string | null;
  aliasSlugs?: string[];
  aliasNames?: string[];
  mergeMethod?: "manual" | "wikidata" | "museum" | "normalized" | "slug";
};

export type CompanyProfileStatus = "active" | "defunct" | "subsidiary" | "unknown";

export type CompanyProfileSeoMeta = {
  seoTitle?: string;
  seoDescription?: string;
  jsonLdDescription?: string;
};

export type CompanyProfileSources = {
  wikidata?: { wikidataId: string; fetchedAt: string; url?: string };
  wikipedia?: { url: string; title?: string; fetchedAt: string };
  officialWebsite?: { url: string; fetchedAt: string };
};

export type CompanyRelation = {
  slug: string;
  name: string;
};

/** Contenido enriquecido por compañía (Wikidata/Wikipedia + IA). */
export type CompanyProfile = {
  slug: string;
  name: string;
  wikidataId?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: CompanyProfileStatus;
  isParentCompany?: boolean;
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  mergedWithCompany?: CompanyRelation | null;
  predecessorCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  history?: string | null;
  seoMeta?: CompanyProfileSeoMeta | null;
  sources?: CompanyProfileSources;
  generatedAt?: string | null;
  method?: "ai" | "template" | "wikidata" | null;
};

export type PlatformStatus = "closed" | "semi-closed" | "open";

export type Platform = {
  slug: string;
  name: string;
  shortName: string;
  manufacturer: "nintendo" | "sony" | "sega" | "snk" | "microsoft";
  status: PlatformStatus;
  estimatedCatalogSize: number;
  sortOrder: number;
  description: string;
  active?: boolean;
  newsEnabled?: boolean;
};

export type RegionalPackagingVariant = {
  region: string;
  /** Sistema de clasificación visible en la portada física. */
  ratingSystem?: "PEGI" | "ESRB" | "CERO" | "USK" | null;
  /** Idiomas visibles en la portada física, expresados como códigos ISO cortos. */
  frontCoverLanguages?: string[] | null;
  /** Idiomas visibles en la contraportada física, expresados como códigos ISO cortos. */
  backCoverLanguages?: string[] | null;
};

export type NewsSection = "home" | "platform" | "company";

export type NewsItem = {
  id: string;
  section: NewsSection;
  topic: string;
  title: string;
  sourceName: string;
  sourceIconUrl?: string | null;
  url: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  snippet?: string | null;
  query: string;
  fetchedAt: string;
};

export type CatalogGame = {
  id: string;
  slug: string;
  title: string;
  titlePc: string | null;
  platformSlug: string;
  region: string;
  physicalVariant?: string | null;
  edition: string;
  /** Si la edición física incluía manual de fábrica; null/ausente = por confirmar. */
  manualExpected?: boolean | null;
  /** Contenido incluido de fábrica en esta edición física, confirmado o aprendido. */
  originalContents?: string[] | null;
  originalContentsSource?: string | null;
  originalContentsUpdatedAt?: string | null;
  /** Señales visuales verificadas que permiten distinguir variantes regionales. */
  regionalPackaging?: RegionalPackagingVariant[] | null;
  regionalPackagingSource?: string | null;
  regionalPackagingUpdatedAt?: string | null;
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
  estimatedPriceGameManual?: number | null;
  estimatedPriceComplete?: number | null;
  estimatedPriceSealed?: number | null;
  /** Producto nuevo en tienda; el precinto no esta confirmado. */
  estimatedPriceNewRetail?: number | null;
  /** Transporte estimado a España, separado del valor del artículo */
  estimatedShippingToSpainLoose?: number | null;
  estimatedShippingToSpainGameManual?: number | null;
  estimatedShippingToSpainComplete?: number | null;
  estimatedShippingToSpainSealed?: number | null;
  /** Artículo + transporte estimado a España; aduanas solo si eBay las incluye */
  estimatedTotalToSpainLoose?: number | null;
  estimatedTotalToSpainGameManual?: number | null;
  estimatedTotalToSpainComplete?: number | null;
  estimatedTotalToSpainSealed?: number | null;
  /** Origen de datos agregados (TodoColeccion, CeX, …) */
  priceDataSources?: string | null;
  pcRefPrice: number | null;
  deltaEsVsPc: number | null;
  priceSource: string | null;
  updatedAt: string | null;
  hasEsPrice: boolean;
  seedSource?: string | null;
  regionEvidence?: string[];
  regionVerified?: boolean;
  gameEsSku?: string | null;
  gameEsProductUrl?: string | null;
  gameEsImageUrl?: string | null;
  gameEsPreownedSku?: string | null;
  gameEsPreownedProductUrl?: string | null;
  /** Referencia agregada GAME seminuevo; el anuncio no se publica. */
  gameRetailPrice?: number | null;
  gameCondition?: string | null;
  gameMatchedAt?: string | null;
  /** true solo si el precio ES proviene de anuncios con región verificada */
  priceRegionVerified?: boolean;
  /** Referencia retail CeX, ponderada por debajo de las observaciones P2P. */
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

export type CatalogListGame = Pick<
  CatalogGame,
  | "id"
  | "slug"
  | "title"
  | "platformSlug"
  | "region"
  | "physicalVariant"
  | "coverUrl"
  | "recommendedPrice"
  | "estimatedPriceLoose"
  | "estimatedPriceGameManual"
  | "estimatedPriceComplete"
  | "estimatedPriceSealed"
  | "estimatedPriceNewRetail"
  | "pcRefPrice"
  | "hasEsPrice"
  | "priceRegionVerified"
> & {
  displayPlatform: string;
  displayYear: number | null;
  /** Campos internos del indice. Se omiten en las respuestas de tarjetas. */
  searchText?: string;
  gameSearchText?: string;
  companySearchText?: string;
  companies?: string[];
  sortGenre?: string;
  sortReference?: string;
  genreSlugs?: string[];
  subgenreSlugs?: string[];
  facetSlugs?: string[];
  isGrail: boolean;
  isTopSegment: boolean;
};

export type CollectionCondition = "sealed" | "complete" | "game-manual" | "loose" | "unknown";

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
  collectionCondition?: CollectionCondition;
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
  estimatedPriceGameManual?: number | null;
  estimatedPriceComplete?: number | null;
  estimatedPriceSealed?: number | null;
  estimatedPriceNewRetail?: number | null;
  estimatedShippingToSpainLoose?: number | null;
  estimatedShippingToSpainGameManual?: number | null;
  estimatedShippingToSpainComplete?: number | null;
  estimatedShippingToSpainSealed?: number | null;
  estimatedTotalToSpainLoose?: number | null;
  estimatedTotalToSpainGameManual?: number | null;
  estimatedTotalToSpainComplete?: number | null;
  estimatedTotalToSpainSealed?: number | null;
  priceDataSources?: string | null;
  pcRefPrice: number | null;
  deltaEsVsPc: number | null;
  priceSource: string | null;
  updatedAt: string | null;
  hasEsPrice: boolean;
  /** ISO — cuándo se añadió a la colección (manual o enlace a catálogo). */
  addedAt?: string | null;
  priceRegionVerified?: boolean;
  gameRetailPrice?: number | null;
  gameCondition?: string | null;
  gameMatchedAt?: string | null;
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
