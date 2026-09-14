export const BROAD_REGION_VALUES = [
  "EUROPE",
  "NORTH_AMERICA",
  "ASIA",
  "OTHER",
] as const;

export type CatalogBroadRegion = (typeof BROAD_REGION_VALUES)[number];

export const CATALOG_MARKET_REGION_VALUES = [
  "FR",
  "ES",
  "GB",
  "DE",
  "US",
  "JP",
  "KR",
  "HK",
  "TW",
] as const;

export type CatalogMarketRegion = (typeof CATALOG_MARKET_REGION_VALUES)[number];

export const PHYSICAL_EDITION_TYPE_VALUES = [
  "STANDARD",
  "COMPILATION",
  "BUDGET_REISSUE",
  "SPECIAL",
  "COLLECTOR",
  "DELUXE",
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
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  caption: string;
  evidenceType: CatalogPhysicalEvidenceType;
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
  /** Mercados geográficos documentados; V2 usa códigos de país y nunca los deduce del packaging. */
  marketRegions: string[];
  packagingLanguages: string[];
  ratingSystems: string[];
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

export type CatalogEditionGuideModel = {
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  reviewedAt: string;
  note: string;
  game: {
    title: string;
    platformSlug: string;
    canonicalCatalogId: string;
  };
  physicalEditions: CatalogPhysicalEdition[];
  editionFamilies: CatalogEditionFamily[];
  sharedDiscs: CatalogSharedDisc[];
  sources: CatalogEditionSource[];
  evidenceNote: string;
  currentCatalogId?: string;
  currentEditionId?: string;
  currentEditionFamilyId?: string;
};

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
  ASIA: "Asia",
  OTHER: "Otra región",
};

const CATALOG_MARKET_REGION_META: Record<CatalogMarketRegion, {
  broadRegion: CatalogBroadRegion;
  legacyRegion: string;
}> = {
  FR: { broadRegion: "EUROPE", legacyRegion: "PAL Francia" },
  ES: { broadRegion: "EUROPE", legacyRegion: "PAL España" },
  GB: { broadRegion: "EUROPE", legacyRegion: "PAL Reino Unido" },
  DE: { broadRegion: "EUROPE", legacyRegion: "PAL Alemania" },
  US: { broadRegion: "NORTH_AMERICA", legacyRegion: "NTSC USA" },
  JP: { broadRegion: "ASIA", legacyRegion: "NTSC-J Japón" },
  KR: { broadRegion: "ASIA", legacyRegion: "NTSC-J Corea" },
  HK: { broadRegion: "ASIA", legacyRegion: "NTSC-J Hong Kong" },
  TW: { broadRegion: "ASIA", legacyRegion: "NTSC-J Taiwán" },
};

const EDITION_TYPE_LABELS: Record<CatalogPhysicalEditionType, string> = {
  STANDARD: "Estándar",
  COMPILATION: "Recopilatorio",
  BUDGET_REISSUE: "Reedición económica",
  SPECIAL: "Special Edition",
  COLLECTOR: "Collector's Edition",
  DELUXE: "Deluxe Edition",
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

export function isStrongPhysicalEvidence(type: CatalogPhysicalEvidenceType): boolean {
  return type === "REAL_SCAN" || type === "REAL_PHOTO" || type === "UNBOXING_FRAME" ||
    type === "RETAILER_PHOTO_CONFIRMED";
}

export function canEvidenceDefinePhysicalVariant(type: CatalogPhysicalEvidenceType): boolean {
  return isStrongPhysicalEvidence(type);
}
