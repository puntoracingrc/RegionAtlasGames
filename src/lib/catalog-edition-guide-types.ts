export const BROAD_REGION_VALUES = [
  "EUROPE",
  "NORTH_AMERICA",
  "LATIN_AMERICA",
  "ASIA",
  "OCEANIA",
  "MIDDLE_EAST",
  "AFRICA",
  "OTHER",
] as const;

export type CatalogBroadRegion = (typeof BROAD_REGION_VALUES)[number];

export const CATALOG_MARKET_REGION_VALUES = [
  "ES",
  "PT",
  "FR",
  "IT",
  "DE",
  "AT",
  "CH",
  "GB",
  "IE",
  "BE",
  "NL",
  "LU",
  "DK",
  "SE",
  "NO",
  "FI",
  "PL",
  "CZ",
  "SK",
  "HU",
  "RO",
  "BG",
  "GR",
  "TR",
  "RU",
  "UA",
  "US",
  "CA",
  "MX",
  "BR",
  "AR",
  "CL",
  "CO",
  "PE",
  "JP",
  "KR",
  "HK",
  "TW",
  "CN",
  "SG",
  "MY",
  "TH",
  "ID",
  "PH",
  "IN",
  "AU",
  "NZ",
  "AE",
  "SA",
  "QA",
  "KW",
  "BH",
  "OM",
  "ZA",
  "MZ",
  "AO",
] as const;

export type CatalogMarketRegion = (typeof CATALOG_MARKET_REGION_VALUES)[number];

export const PHYSICAL_EDITION_TYPE_VALUES = [
  "STANDARD",
  "COMPILATION",
  "BUDGET_REISSUE",
  "SPECIAL",
  "COLLECTOR",
  "DELUXE",
  "GOLD",
  "LIMITED",
  "STEELBOOK",
  "OTHER",
] as const;

export type CatalogPhysicalEditionType = (typeof PHYSICAL_EDITION_TYPE_VALUES)[number];

export const CATALOG_PHYSICAL_PRICE_CONDITION_VALUES = [
  "sealed",
  "newRetail",
  "complete",
  "gameManual",
  "loose",
] as const;

export type CatalogPhysicalPriceCondition =
  (typeof CATALOG_PHYSICAL_PRICE_CONDITION_VALUES)[number];

export const PHYSICAL_VARIANT_CONFIDENCE_VALUES = [
  "CONFIRMED_PHYSICAL_COPY",
  "CONFIRMED",
  "HIGH",
  "PENDING_IDENTIFIER",
  "UNCONFIRMED",
] as const;

export type CatalogPhysicalVariantConfidence =
  (typeof PHYSICAL_VARIANT_CONFIDENCE_VALUES)[number];

export const PHYSICAL_RELEASE_STATUS_VALUES = [
  "RELEASED",
  "CANCELED_PHYSICAL_RELEASE",
] as const;

export type CatalogPhysicalReleaseStatus =
  (typeof PHYSICAL_RELEASE_STATUS_VALUES)[number];

export const PHYSICAL_CONTENT_STATUS_VALUES = [
  "PHYSICAL_FULL_GAME",
  "PHYSICAL_DOWNLOAD_REQUIRED",
  "GAME_KEY_CARD",
  "CODE_IN_BOX",
  "COLLECTOR_WITHOUT_GAME",
  "DIGITAL_ONLY",
  "CANCELED_PHYSICAL",
  "PROMOTIONAL_NOT_FOR_RESALE",
  "PRESS_KIT",
  "RETAILER_BUNDLE",
  "HARDWARE_BUNDLE",
  "UNKNOWN_PHYSICAL_STATUS",
] as const;

export type CatalogPhysicalContentStatus =
  (typeof PHYSICAL_CONTENT_STATUS_VALUES)[number];

export const PHYSICAL_BONUS_ITEM_TYPE_VALUES = ["STEELBOOK_CASE"] as const;
export type CatalogPhysicalBonusItemType =
  (typeof PHYSICAL_BONUS_ITEM_TYPE_VALUES)[number];

export const RELATED_RELEASE_TYPE_VALUES = ["EXPANSION"] as const;
export type CatalogRelatedReleaseType =
  (typeof RELATED_RELEASE_TYPE_VALUES)[number];

export const PHYSICAL_PRODUCT_TYPE_VALUES = [
  "NATIVE_GAME_DISC",
  "NATIVE_GAME_CARD",
  "GAME_KEY_CARD",
  "PREVIOUS_GEN_DISC_WITH_UPGRADE",
  "DOWNLOAD_CODE_IN_BOX",
  "PROMOTIONAL_NOT_FOR_RESALE",
  "PRESS_KIT",
  "RETAILER_BUNDLE",
  "HARDWARE_BUNDLE",
  "COLLECTOR_WITHOUT_GAME",
  "DIGITAL_ONLY_PRODUCT",
  "UNKNOWN_PHYSICAL_PRODUCT",
] as const;

export type CatalogPhysicalProductType = (typeof PHYSICAL_PRODUCT_TYPE_VALUES)[number];

export const PHYSICAL_RESEARCH_STATUS_VALUES = [
  "UNCONFIRMED",
  "PENDING_REVIEW",
  "PHYSICAL_VARIANT_NOT_CONFIRMED",
] as const;

export type CatalogPhysicalResearchStatus =
  (typeof PHYSICAL_RESEARCH_STATUS_VALUES)[number];

export const PHYSICAL_EVIDENCE_TYPE_VALUES = [
  "REAL_SCAN",
  "REAL_PHOTO",
  "UNBOXING_FRAME",
  "RETAILER_PHOTO_CONFIRMED",
  "RETAILER_ASSET",
  "PUBLISHER_MOCKUP",
  "PRE_RELEASE_ASSET",
  "PUBLISHER_DOCUMENTATION",
  "OWNER_CONFIRMATION",
  "UNKNOWN",
] as const;

export type CatalogPhysicalEvidenceType = (typeof PHYSICAL_EVIDENCE_TYPE_VALUES)[number];

export type CatalogPhysicalEvidence = {
  id: string;
  type: CatalogPhysicalEvidenceType;
  label: string;
  url?: string;
  summary?: string;
  supports: string[];
};

export type CatalogEditionSource = {
  label: string;
  url?: string;
};

export type CatalogEditionImage = {
  key: string;
  placement?: "GALLERY" | "CONTENTS";
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  caption: string;
  evidenceType: CatalogPhysicalEvidenceType;
  sha256?: string;
  thumbnailSha256?: string;
  originalUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
  originalSha256?: string;
  sourceUrl?: string;
  sourcePageUrl?: string;
  inspectedAt?: string;
};

export const COMPONENT_LANGUAGE_BASIS_VALUES = ["OBSERVED", "DECLARED"] as const;
export type CatalogComponentLanguageBasis = (typeof COMPONENT_LANGUAGE_BASIS_VALUES)[number];

export const PHYSICAL_COMPONENT_VALUES = [
  "BOX",
  "OUTER_BOX",
  "INNER_GAME",
  "FRONT",
  "BACK",
  "SPINE",
  "MANUAL",
  "OTHER",
] as const;
export type CatalogPhysicalComponent = (typeof PHYSICAL_COMPONENT_VALUES)[number];

export type CatalogComponentLanguageEvidence = {
  component: CatalogPhysicalComponent;
  languages: string[];
  basis: CatalogComponentLanguageBasis;
  exhaustive: boolean;
  note?: string;
  evidence: CatalogPhysicalEvidence[];
};

export type CatalogEditionCatalogLink = {
  catalogId: string;
  href: string;
  current: boolean;
  region: string;
};

export type CatalogCollectibleVariant = {
  id: string;
  label: string;
  stickers: string[];
  markings: string[];
  barcode?: string;
  boxCode?: string;
  notes: string[];
  evidence: CatalogPhysicalEvidence[];
  scanSetIds: string[];
  priceIdentity: string;
};

export type CatalogPhysicalDimensions = {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  approximate: boolean;
  comparisonImageUrl?: string;
  sourceLabel: string;
  notes: string[];
  comparison?: {
    label: string;
    widthCm: number;
    heightCm: number;
    depthCm: number;
    sourceLabel: string;
    sourceUrl: string;
  };
};

export type CatalogSharedDisc = {
  id: string;
  label: string;
  technicalRegion?: CatalogBroadRegion;
  serial?: string;
  xemid?: string;
  mediaId?: string;
  ratingSystems: string[];
  evidence: CatalogPhysicalEvidence[];
};

export type CatalogEditionFamily = {
  id: string;
  label: string;
  representativeCatalogId: string;
  physicalEditionIds: string[];
  priceConditions: CatalogPhysicalPriceCondition[];
};

export type CatalogPhysicalEdition = {
  id: string;
  label: string;
  broadRegion: CatalogBroadRegion;
  editionType: CatalogPhysicalEditionType;
  /** Planned physical releases may remain documented without counting as released editions. */
  releaseStatus: CatalogPhysicalReleaseStatus;
  /**
   * Las guías documentales pueden distinguir varias cajas bajo un mismo
   * catalogId. Las relaciones derivadas conservan el catalogId regional como
   * identidad y no crean una identidad coleccionable paralela.
   */
  collectionIdentity: "physical-variant" | "catalog-entry";
  /** Mercados geográficos documentados; V2 usa códigos de país y nunca los deduce del packaging. */
  marketRegions: string[];
  /** Países donde las fuentes prueban circulación, aunque la caja pertenezca a otro mercado. */
  evidenceMarkets: CatalogMarketRegion[];
  /** Mercados de distribución declarados de forma explícita por fabricante o distribuidor. */
  distributionMarkets: CatalogMarketRegion[];
  packagingLanguages: string[];
  /** Idiomas del software; nunca se reutilizan para completar los idiomas del packaging. */
  softwareLanguages: string[];
  componentLanguageEvidence: CatalogComponentLanguageEvidence[];
  ratingSystems: string[];
  /** Digital/software family identifiers such as PPSA; never treated as packaging identifiers. */
  softwareFamilyCodes: string[];
  productCodes: string[];
  /** Estado material del producto; separa soporte completo, descargas y objetos no retail. */
  physicalContentStatus?: CatalogPhysicalContentStatus;
  /** Tipo de soporte incluido; evita contar una caja con código o un disco de otra generación como disco nativo. */
  physicalProductType?: CatalogPhysicalProductType;
  /** Plataforma impresa/prensada en el soporte físico, no la consola compatible mediante actualización. */
  nativePhysicalPlatform?: string;
  compatiblePlatforms: string[];
  containsDisc?: boolean;
  hasGameCard?: boolean;
  gameStoredOnCard?: boolean;
  fullGameDownloadRequired?: boolean;
  physicalGameCardCount?: number;
  gameKeyCardCount?: number;
  physicalGameCount?: number;
  countsAsNativePhysicalRelease?: boolean;
  upgradeToPS5?: boolean;
  upgradePath?: string;
  redeems?: string;
  requiresBaseGame?: boolean;
  expansionOf?: string;
  confidence?: CatalogPhysicalVariantConfidence;
  barcode?: string;
  catalogNumber?: string;
  serial?: string;
  boxCode?: string;
  releaseDate?: string;
  releaseDateContext?: string;
  dimensions?: CatalogPhysicalDimensions;
  physicalContents: string[];
  digitalContents: string[];
  sharedDiscId?: string;
  catalogIds: string[];
  catalogLinks: CatalogEditionCatalogLink[];
  scanSetIds: string[];
  evidence: CatalogPhysicalEvidence[];
  images: CatalogEditionImage[];
  includesEditionIds: string[];
  includesVariantIds: string[];
  containsCatalogIds: string[];
  variants: CatalogCollectibleVariant[];
  notes: string[];
};

export type CatalogPhysicalBonusItem = {
  id: string;
  label: string;
  relatedGameId: string;
  type: CatalogPhysicalBonusItemType;
  retailer?: string;
  market: CatalogMarketRegion;
  upc?: string;
  includesGame: false;
  catalogIds: string[];
  catalogLinks: CatalogEditionCatalogLink[];
  evidence: CatalogPhysicalEvidence[];
  notes: string[];
};

export type CatalogRelatedRelease = {
  id: string;
  label: string;
  type: CatalogRelatedReleaseType;
  expansionOf: string;
  evidence: CatalogPhysicalEvidence[];
  notes: string[];
};

export type CatalogPhysicalResearchTask = {
  id: string;
  label: string;
  status: CatalogPhysicalResearchStatus;
  marketRegions: CatalogMarketRegion[];
  notes: string[];
};

export type CatalogEditionGuideModel = {
  schemaVersion: 1 | 2;
  origin: "documented-guide" | "catalog-derived";
  id: string;
  title: string;
  reviewedAt: string;
  note: string;
  game: {
    title: string;
    platformSlug: string;
    canonicalCatalogId: string;
    canonicalGameId?: string;
    platformReleaseId?: string;
    /** Títulos históricos que deben seguir encontrando la obra canónica. */
    aliases?: string[];
  };
  physicalEditions: CatalogPhysicalEdition[];
  physicalBonusItems: CatalogPhysicalBonusItem[];
  relatedReleases: CatalogRelatedRelease[];
  editionFamilies: CatalogEditionFamily[];
  sharedDiscs: CatalogSharedDisc[];
  sources: CatalogEditionSource[];
  evidenceNote: string;
  researchTasks: CatalogPhysicalResearchTask[];
  currentCatalogId?: string;
  currentEditionId?: string;
  currentEditionFamilyId?: string;
  currentBonusItemId?: string;
};

export function isReleasedPhysicalEdition(edition: CatalogPhysicalEdition): boolean {
  if (edition.releaseStatus !== "RELEASED" || edition.countsAsNativePhysicalRelease === false) {
    return false;
  }
  if (edition.physicalContentStatus && [
    "GAME_KEY_CARD",
    "CODE_IN_BOX",
    "COLLECTOR_WITHOUT_GAME",
    "DIGITAL_ONLY",
    "CANCELED_PHYSICAL",
    "PROMOTIONAL_NOT_FOR_RESALE",
    "PRESS_KIT",
    "RETAILER_BUNDLE",
    "HARDWARE_BUNDLE",
    "UNKNOWN_PHYSICAL_STATUS",
  ].includes(edition.physicalContentStatus)) {
    return false;
  }
  return !edition.physicalProductType || ![
    "GAME_KEY_CARD",
    "PREVIOUS_GEN_DISC_WITH_UPGRADE",
    "DOWNLOAD_CODE_IN_BOX",
    "PROMOTIONAL_NOT_FOR_RESALE",
    "PRESS_KIT",
    "RETAILER_BUNDLE",
    "HARDWARE_BUNDLE",
    "COLLECTOR_WITHOUT_GAME",
    "DIGITAL_ONLY_PRODUCT",
    "UNKNOWN_PHYSICAL_PRODUCT",
  ].includes(edition.physicalProductType);
}

const PHYSICAL_CONTENT_STATUS_LABELS: Record<CatalogPhysicalContentStatus, string> = {
  PHYSICAL_FULL_GAME: "Juego completo en soporte",
  PHYSICAL_DOWNLOAD_REQUIRED: "Descarga adicional requerida",
  GAME_KEY_CARD: "Game-Key Card",
  CODE_IN_BOX: "Código en caja",
  COLLECTOR_WITHOUT_GAME: "Coleccionista sin juego",
  DIGITAL_ONLY: "Sólo digital",
  CANCELED_PHYSICAL: "Lanzamiento físico cancelado",
  PROMOTIONAL_NOT_FOR_RESALE: "Promocional · no destinado a venta",
  PRESS_KIT: "Kit de prensa",
  RETAILER_BUNDLE: "Pack de tienda",
  HARDWARE_BUNDLE: "Pack de hardware",
  UNKNOWN_PHYSICAL_STATUS: "Estado físico pendiente",
};

export function catalogPhysicalContentStatusLabel(status: CatalogPhysicalContentStatus): string {
  return PHYSICAL_CONTENT_STATUS_LABELS[status];
}

export type CatalogPriceRange = {
  min: number;
  max: number;
};

export type CatalogPhysicalEditionGroupSummary = {
  guideId: string;
  canonicalCatalogId: string;
  editionFamilyId?: string;
  editionFamilyLabel?: string;
  catalogIds: string[];
  legacyRegions: string[];
  /** Mercados nacionales V2 documentados que mantienen la pertenencia a los filtros. */
  marketRegions: string[];
  /** Banderas resumidas para la tarjeta cuando se muestran todas las regiones. */
  overviewRegions: string[];
  physicalEditionCount: number;
  collectibleVariantCount: number;
  broadRegions: Array<{
    value: CatalogBroadRegion;
    label: string;
    editionCount: number;
  }>;
  editionTypes: CatalogPhysicalEditionType[];
  ratingSystems: string[];
  packagingLanguages: string[];
  priceRanges: Partial<Record<"complete" | "sealed", CatalogPriceRange>>;
};

export type CatalogPhysicalEditionPublicIdentity = {
  familyLabel: string;
  metadataTitle: string;
  description: string;
  coverAlt: string;
  broadRegions: CatalogBroadRegion[];
  broadRegionLabel: string;
  marketRegions: CatalogMarketRegion[];
  currentMarketRegions: CatalogMarketRegion[];
};

export type CatalogPhysicalFilterOptions = {
  broadRegions: Array<{ value: CatalogBroadRegion; label: string }>;
  editionTypes: Array<{ value: CatalogPhysicalEditionType; label: string }>;
  ratingSystems: string[];
};

const BROAD_REGION_LABELS: Record<CatalogBroadRegion, string> = {
  EUROPE: "Europa",
  NORTH_AMERICA: "Norteamérica",
  LATIN_AMERICA: "Latinoamérica",
  ASIA: "Asia",
  OCEANIA: "Oceanía",
  MIDDLE_EAST: "Oriente Medio",
  AFRICA: "África",
  OTHER: "Otra región",
};

export type CatalogMarketNavigationGroup =
  | "europe"
  | "america"
  | "asia"
  | "oceania"
  | "middle-east"
  | "africa";

export const CATALOG_MARKET_REGION_META: Record<CatalogMarketRegion, {
  broadRegion: CatalogBroadRegion;
  legacyRegion: string;
  country: string;
  shortLabel: string;
  flagCode: string;
  navigationGroup: CatalogMarketNavigationGroup;
}> = {
  ES: { broadRegion: "EUROPE", legacyRegion: "PAL España", country: "España", shortLabel: "ES", flagCode: "ES", navigationGroup: "europe" },
  PT: { broadRegion: "EUROPE", legacyRegion: "PAL Portugal", country: "Portugal", shortLabel: "PT", flagCode: "PT", navigationGroup: "europe" },
  FR: { broadRegion: "EUROPE", legacyRegion: "PAL Francia", country: "Francia", shortLabel: "FR", flagCode: "FR", navigationGroup: "europe" },
  IT: { broadRegion: "EUROPE", legacyRegion: "PAL Italia", country: "Italia", shortLabel: "IT", flagCode: "IT", navigationGroup: "europe" },
  DE: { broadRegion: "EUROPE", legacyRegion: "PAL Alemania", country: "Alemania", shortLabel: "DE", flagCode: "DE", navigationGroup: "europe" },
  AT: { broadRegion: "EUROPE", legacyRegion: "PAL Austria", country: "Austria", shortLabel: "AT", flagCode: "AT", navigationGroup: "europe" },
  CH: { broadRegion: "EUROPE", legacyRegion: "PAL Suiza", country: "Suiza", shortLabel: "CH", flagCode: "CH", navigationGroup: "europe" },
  GB: { broadRegion: "EUROPE", legacyRegion: "PAL Reino Unido", country: "Reino Unido", shortLabel: "UK", flagCode: "GB", navigationGroup: "europe" },
  IE: { broadRegion: "EUROPE", legacyRegion: "PAL Irlanda", country: "Irlanda", shortLabel: "IE", flagCode: "IE", navigationGroup: "europe" },
  BE: { broadRegion: "EUROPE", legacyRegion: "PAL Bélgica", country: "Bélgica", shortLabel: "BE", flagCode: "BE", navigationGroup: "europe" },
  NL: { broadRegion: "EUROPE", legacyRegion: "PAL Países Bajos", country: "Países Bajos", shortLabel: "NL", flagCode: "NL", navigationGroup: "europe" },
  LU: { broadRegion: "EUROPE", legacyRegion: "PAL Luxemburgo", country: "Luxemburgo", shortLabel: "LU", flagCode: "LU", navigationGroup: "europe" },
  DK: { broadRegion: "EUROPE", legacyRegion: "PAL Dinamarca", country: "Dinamarca", shortLabel: "DK", flagCode: "DK", navigationGroup: "europe" },
  SE: { broadRegion: "EUROPE", legacyRegion: "PAL Suecia", country: "Suecia", shortLabel: "SE", flagCode: "SE", navigationGroup: "europe" },
  NO: { broadRegion: "EUROPE", legacyRegion: "PAL Noruega", country: "Noruega", shortLabel: "NO", flagCode: "NO", navigationGroup: "europe" },
  FI: { broadRegion: "EUROPE", legacyRegion: "PAL Finlandia", country: "Finlandia", shortLabel: "FI", flagCode: "FI", navigationGroup: "europe" },
  PL: { broadRegion: "EUROPE", legacyRegion: "PAL Polonia", country: "Polonia", shortLabel: "PL", flagCode: "PL", navigationGroup: "europe" },
  CZ: { broadRegion: "EUROPE", legacyRegion: "PAL Chequia", country: "Chequia", shortLabel: "CZ", flagCode: "CZ", navigationGroup: "europe" },
  SK: { broadRegion: "EUROPE", legacyRegion: "PAL Eslovaquia", country: "Eslovaquia", shortLabel: "SK", flagCode: "SK", navigationGroup: "europe" },
  HU: { broadRegion: "EUROPE", legacyRegion: "PAL Hungría", country: "Hungría", shortLabel: "HU", flagCode: "HU", navigationGroup: "europe" },
  RO: { broadRegion: "EUROPE", legacyRegion: "PAL Rumanía", country: "Rumanía", shortLabel: "RO", flagCode: "RO", navigationGroup: "europe" },
  BG: { broadRegion: "EUROPE", legacyRegion: "PAL Bulgaria", country: "Bulgaria", shortLabel: "BG", flagCode: "BG", navigationGroup: "europe" },
  GR: { broadRegion: "EUROPE", legacyRegion: "PAL Grecia", country: "Grecia", shortLabel: "GR", flagCode: "GR", navigationGroup: "europe" },
  TR: { broadRegion: "EUROPE", legacyRegion: "PAL Turquía", country: "Turquía", shortLabel: "TR", flagCode: "TR", navigationGroup: "europe" },
  RU: { broadRegion: "EUROPE", legacyRegion: "PAL Rusia", country: "Rusia", shortLabel: "RU", flagCode: "RU", navigationGroup: "europe" },
  UA: { broadRegion: "EUROPE", legacyRegion: "PAL Ucrania", country: "Ucrania", shortLabel: "UA", flagCode: "UA", navigationGroup: "europe" },
  US: { broadRegion: "NORTH_AMERICA", legacyRegion: "NTSC USA", country: "Estados Unidos", shortLabel: "US", flagCode: "US", navigationGroup: "america" },
  CA: { broadRegion: "NORTH_AMERICA", legacyRegion: "NTSC Canadá", country: "Canadá", shortLabel: "CA", flagCode: "CA", navigationGroup: "america" },
  MX: { broadRegion: "NORTH_AMERICA", legacyRegion: "NTSC México", country: "México", shortLabel: "MX", flagCode: "MX", navigationGroup: "america" },
  BR: { broadRegion: "LATIN_AMERICA", legacyRegion: "Brasil", country: "Brasil", shortLabel: "BR", flagCode: "BR", navigationGroup: "america" },
  AR: { broadRegion: "LATIN_AMERICA", legacyRegion: "Argentina", country: "Argentina", shortLabel: "AR", flagCode: "AR", navigationGroup: "america" },
  CL: { broadRegion: "LATIN_AMERICA", legacyRegion: "Chile", country: "Chile", shortLabel: "CL", flagCode: "CL", navigationGroup: "america" },
  CO: { broadRegion: "LATIN_AMERICA", legacyRegion: "Colombia", country: "Colombia", shortLabel: "CO", flagCode: "CO", navigationGroup: "america" },
  PE: { broadRegion: "LATIN_AMERICA", legacyRegion: "Perú", country: "Perú", shortLabel: "PE", flagCode: "PE", navigationGroup: "america" },
  JP: { broadRegion: "ASIA", legacyRegion: "NTSC-J Japón", country: "Japón", shortLabel: "JP", flagCode: "JP", navigationGroup: "asia" },
  KR: { broadRegion: "ASIA", legacyRegion: "NTSC-J Corea", country: "Corea del Sur", shortLabel: "KR", flagCode: "KR", navigationGroup: "asia" },
  HK: { broadRegion: "ASIA", legacyRegion: "NTSC-J Hong Kong", country: "Hong Kong", shortLabel: "HK", flagCode: "HK", navigationGroup: "asia" },
  TW: { broadRegion: "ASIA", legacyRegion: "NTSC-J Taiwán", country: "Taiwán", shortLabel: "TW", flagCode: "TW", navigationGroup: "asia" },
  CN: { broadRegion: "ASIA", legacyRegion: "China", country: "China", shortLabel: "CN", flagCode: "CN", navigationGroup: "asia" },
  SG: { broadRegion: "ASIA", legacyRegion: "Singapur", country: "Singapur", shortLabel: "SG", flagCode: "SG", navigationGroup: "asia" },
  MY: { broadRegion: "ASIA", legacyRegion: "Malasia", country: "Malasia", shortLabel: "MY", flagCode: "MY", navigationGroup: "asia" },
  TH: { broadRegion: "ASIA", legacyRegion: "Tailandia", country: "Tailandia", shortLabel: "TH", flagCode: "TH", navigationGroup: "asia" },
  ID: { broadRegion: "ASIA", legacyRegion: "Indonesia", country: "Indonesia", shortLabel: "ID", flagCode: "ID", navigationGroup: "asia" },
  PH: { broadRegion: "ASIA", legacyRegion: "Filipinas", country: "Filipinas", shortLabel: "PH", flagCode: "PH", navigationGroup: "asia" },
  IN: { broadRegion: "ASIA", legacyRegion: "India", country: "India", shortLabel: "IN", flagCode: "IN", navigationGroup: "asia" },
  AU: { broadRegion: "OCEANIA", legacyRegion: "PAL Australia", country: "Australia", shortLabel: "AU", flagCode: "AU", navigationGroup: "oceania" },
  NZ: { broadRegion: "OCEANIA", legacyRegion: "PAL Nueva Zelanda", country: "Nueva Zelanda", shortLabel: "NZ", flagCode: "NZ", navigationGroup: "oceania" },
  AE: { broadRegion: "MIDDLE_EAST", legacyRegion: "Emiratos Árabes Unidos", country: "Emiratos Árabes Unidos", shortLabel: "AE", flagCode: "AE", navigationGroup: "middle-east" },
  SA: { broadRegion: "MIDDLE_EAST", legacyRegion: "Arabia Saudí", country: "Arabia Saudí", shortLabel: "SA", flagCode: "SA", navigationGroup: "middle-east" },
  QA: { broadRegion: "MIDDLE_EAST", legacyRegion: "Catar", country: "Catar", shortLabel: "QA", flagCode: "QA", navigationGroup: "middle-east" },
  KW: { broadRegion: "MIDDLE_EAST", legacyRegion: "Kuwait", country: "Kuwait", shortLabel: "KW", flagCode: "KW", navigationGroup: "middle-east" },
  BH: { broadRegion: "MIDDLE_EAST", legacyRegion: "Baréin", country: "Baréin", shortLabel: "BH", flagCode: "BH", navigationGroup: "middle-east" },
  OM: { broadRegion: "MIDDLE_EAST", legacyRegion: "Omán", country: "Omán", shortLabel: "OM", flagCode: "OM", navigationGroup: "middle-east" },
  ZA: { broadRegion: "AFRICA", legacyRegion: "Sudáfrica", country: "Sudáfrica", shortLabel: "ZA", flagCode: "ZA", navigationGroup: "africa" },
  MZ: { broadRegion: "AFRICA", legacyRegion: "Mozambique", country: "Mozambique", shortLabel: "MZ", flagCode: "MZ", navigationGroup: "africa" },
  AO: { broadRegion: "AFRICA", legacyRegion: "Angola", country: "Angola", shortLabel: "AO", flagCode: "AO", navigationGroup: "africa" },
};

const EDITION_TYPE_LABELS: Record<CatalogPhysicalEditionType, string> = {
  STANDARD: "Estándar",
  COMPILATION: "Recopilatorio",
  BUDGET_REISSUE: "Reedición económica",
  SPECIAL: "Special Edition",
  COLLECTOR: "Collector's Edition",
  DELUXE: "Deluxe Edition",
  GOLD: "Gold Edition",
  LIMITED: "Limited Edition",
  STEELBOOK: "Steelbook",
  OTHER: "Otra edición",
};

export function catalogBroadRegionLabel(region: CatalogBroadRegion): string {
  return BROAD_REGION_LABELS[region];
}

export function catalogPhysicalEditionTypeLabel(type: CatalogPhysicalEditionType): string {
  return EDITION_TYPE_LABELS[type];
}

export function catalogEditionFamilyHasVariants(physicalEditionCount: number): boolean {
  return physicalEditionCount > 1;
}

export function catalogEditionFamilyCountLabel(physicalEditionCount: number): string {
  if (catalogEditionFamilyHasVariants(physicalEditionCount)) {
    return `${physicalEditionCount} variantes físicas`;
  }
  return `${physicalEditionCount} ${physicalEditionCount === 1 ? "edición física" : "ediciones físicas"}`;
}

export function parseCatalogBroadRegion(value: string | null | undefined): CatalogBroadRegion | "all" {
  return value && (BROAD_REGION_VALUES as readonly string[]).includes(value)
    ? value as CatalogBroadRegion
    : "all";
}

export function parseCatalogPhysicalEditionType(
  value: string | null | undefined,
): CatalogPhysicalEditionType | "all" {
  return value && (PHYSICAL_EDITION_TYPE_VALUES as readonly string[]).includes(value)
    ? value as CatalogPhysicalEditionType
    : "all";
}

export function catalogBroadRegionFromLegacyRegion(region: string): CatalogBroadRegion {
  const normalized = region.trim().toLowerCase();
  const registered = Object.entries(CATALOG_MARKET_REGION_META).find(([code, market]) => (
    code.toLowerCase() === normalized ||
    market.legacyRegion.toLowerCase() === normalized ||
    market.country.toLowerCase() === normalized
  ));
  if (registered) return registered[1].broadRegion;
  if (normalized.includes("usa") || normalized.includes("canad") || normalized.includes("north america")) {
    return "NORTH_AMERICA";
  }
  if (
    normalized.includes("jap") ||
    normalized.includes("asia") ||
    normalized.includes("korea") ||
    normalized.includes("corea") ||
    normalized.includes("hong kong") ||
    normalized.includes("taiw")
  ) {
    return "ASIA";
  }
  if (
    normalized.includes("pal") ||
    normalized.includes("europa") ||
    normalized.includes("spain") ||
    normalized.includes("españa") ||
    normalized.includes("ital") ||
    normalized.includes("german") ||
    normalized.includes("alem") ||
    normalized.includes("fran") ||
    normalized.includes("uk")
  ) {
    return "EUROPE";
  }
  return "OTHER";
}

export function isCatalogMarketRegion(region: string): region is CatalogMarketRegion {
  return (CATALOG_MARKET_REGION_VALUES as readonly string[]).includes(region);
}

export function isCatalogPhysicalPriceCondition(
  condition: string,
): condition is CatalogPhysicalPriceCondition {
  return (CATALOG_PHYSICAL_PRICE_CONDITION_VALUES as readonly string[]).includes(condition);
}

export function catalogBroadRegionFromMarketRegion(region: string): CatalogBroadRegion {
  return isCatalogMarketRegion(region)
    ? CATALOG_MARKET_REGION_META[region].broadRegion
    : catalogBroadRegionFromLegacyRegion(region);
}

export function catalogMarketRegionToLegacyRegion(region: string): string {
  return isCatalogMarketRegion(region)
    ? CATALOG_MARKET_REGION_META[region].legacyRegion
    : region;
}

export function catalogMarketRegionMeta(region: string) {
  return isCatalogMarketRegion(region) ? CATALOG_MARKET_REGION_META[region] : undefined;
}

export function isStrongPhysicalEvidence(type: CatalogPhysicalEvidenceType): boolean {
  return type === "REAL_SCAN" || type === "REAL_PHOTO" || type === "UNBOXING_FRAME" ||
    type === "RETAILER_PHOTO_CONFIRMED";
}

export function canEvidenceDefinePhysicalVariant(type: CatalogPhysicalEvidenceType): boolean {
  return isStrongPhysicalEvidence(type);
}
