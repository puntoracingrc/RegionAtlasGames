export const BROAD_REGION_VALUES = [
  "EUROPE",
  "NORTH_AMERICA",
  "ASIA",
  "OTHER",
] as const;

export type CatalogBroadRegion = (typeof BROAD_REGION_VALUES)[number];

export const PHYSICAL_EDITION_TYPE_VALUES = [
  "STANDARD",
  "SPECIAL",
  "COLLECTOR",
  "DELUXE",
  "LIMITED",
  "STEELBOOK",
  "OTHER",
] as const;

export type CatalogPhysicalEditionType = (typeof PHYSICAL_EDITION_TYPE_VALUES)[number];

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
};

export type CatalogPhysicalEdition = {
  id: string;
  label: string;
  broadRegion: CatalogBroadRegion;
  editionType: CatalogPhysicalEditionType;
  packagingLanguages: string[];
  ratingSystems: string[];
  barcode?: string;
  catalogNumber?: string;
  serial?: string;
  boxCode?: string;
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

const EDITION_TYPE_LABELS: Record<CatalogPhysicalEditionType, string> = {
  STANDARD: "Estándar",
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
    normalized.includes("taiwan")
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

export function isStrongPhysicalEvidence(type: CatalogPhysicalEvidenceType): boolean {
  return type === "REAL_SCAN" || type === "REAL_PHOTO" || type === "UNBOXING_FRAME" ||
    type === "RETAILER_PHOTO_CONFIRMED";
}

export function canEvidenceDefinePhysicalVariant(type: CatalogPhysicalEvidenceType): boolean {
  return isStrongPhysicalEvidence(type);
}
