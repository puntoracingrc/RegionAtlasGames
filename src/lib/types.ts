export type MuseumEntity = {
  name: string;
  slug: string;
  museumPath: string;
};

export type GameDetails = {
  year: number | null;
  releaseDate: string | null;
  reference: string | null;
  players: number | null;
  support: string | null;
  developer: MuseumEntity | null;
  publisher: MuseumEntity | null;
  genres: MuseumEntity[];
  series: MuseumEntity | null;
  museumPath: string;
  fetchedAt: string;
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
};

export type CollectionItem = {
  id: string;
  catalogId: string | null;
  inRetroCatalog: boolean;
  title: string;
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
  pcRefPrice: number | null;
  deltaEsVsPc: number | null;
  priceSource: string | null;
  updatedAt: string | null;
  hasEsPrice: boolean;
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
};

export type GameFilters = {
  q: string;
  platform: string;
  sealed: "all" | "yes" | "no";
  priced: "all" | "yes" | "no";
};

/** @deprecated usar CollectionView */
export type Game = CollectionView;
