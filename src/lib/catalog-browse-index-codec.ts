import type {
  CatalogBroadRegion,
  CatalogPhysicalEditionGroupSummary,
  CatalogPhysicalEditionType,
  CatalogPriceRange,
} from "./catalog-edition-guide-types";
import type { CatalogListGame } from "./types";
import type { CatalogGame } from "./types";
import { createHash } from "node:crypto";

type PriceRangeTuple = [min: number, max: number];
type BroadRegionTuple = [
  value: CatalogBroadRegion,
  label: string,
  editionCount: number,
];

type PhysicalEditionGroupTuple = [
  guideId: string,
  canonicalCatalogId: string,
  editionFamilyId: string | null,
  editionFamilyLabel: string | null,
  catalogIds: string[],
  legacyRegions: string[],
  marketRegions: string[],
  overviewRegions: string[],
  physicalEditionCount: number,
  collectibleVariantCount: number,
  broadRegions: BroadRegionTuple[],
  editionTypes: CatalogPhysicalEditionType[],
  ratingSystems: string[],
  packagingLanguages: string[],
  completePriceRange: PriceRangeTuple | null,
  sealedPriceRange: PriceRangeTuple | null,
];

export type CatalogBrowseGameTuple = [
  id: string,
  slug: string,
  title: string,
  platformSlug: string,
  region: string,
  regionalStatus: CatalogListGame["regionalStatus"] | null,
  canonicalSeoSlug: string | null,
  physicalVariant: CatalogListGame["physicalVariant"] | null,
  coverUrl: string | null,
  recommendedPrice: number | null,
  estimatedPriceLoose: number | null,
  estimatedPriceGameManual: number | null,
  estimatedPriceComplete: number | null,
  estimatedPriceSealed: number | null,
  estimatedPriceNewRetail: number | null,
  pcRefPrice: number | null,
  hasEsPrice: boolean,
  priceRegionVerified: boolean | null,
  displayPlatform: string,
  displayYear: number | null,
  physicalEditionGroup: PhysicalEditionGroupTuple | null,
  isGrail: boolean,
  isTopSegment: boolean,
  searchText: string,
  gameSearchText: string,
  companySearchText: string,
  companies: string[],
  sortGenre: string | null,
  sortReference: string | null,
  genreSlugs: string[],
  subgenreSlugs: string[],
  facetSlugs: string[],
  definedMask: number,
];

const DEFINED = {
  regionalStatus: 1 << 0,
  canonicalSeoSlug: 1 << 1,
  physicalVariant: 1 << 2,
  estimatedPriceLoose: 1 << 3,
  estimatedPriceGameManual: 1 << 4,
  estimatedPriceComplete: 1 << 5,
  estimatedPriceSealed: 1 << 6,
  estimatedPriceNewRetail: 1 << 7,
  priceRegionVerified: 1 << 8,
} as const;

function compactSearchText(value = ""): string {
  return [...new Set(value.split(" ").filter(Boolean))].join(" ");
}

function encodePriceRange(range: CatalogPriceRange | undefined): PriceRangeTuple | null {
  return range ? [range.min, range.max] : null;
}

function decodePriceRange(range: PriceRangeTuple | null): CatalogPriceRange | undefined {
  return range ? { min: range[0], max: range[1] } : undefined;
}

function encodePhysicalEditionGroup(
  group: CatalogPhysicalEditionGroupSummary | undefined,
): PhysicalEditionGroupTuple | null {
  if (!group) return null;
  return [
    group.guideId,
    group.canonicalCatalogId,
    group.editionFamilyId ?? null,
    group.editionFamilyLabel ?? null,
    group.catalogIds,
    group.legacyRegions,
    group.marketRegions,
    group.overviewRegions,
    group.physicalEditionCount,
    group.collectibleVariantCount,
    group.broadRegions.map((entry) => [entry.value, entry.label, entry.editionCount]),
    group.editionTypes,
    group.ratingSystems,
    group.packagingLanguages,
    encodePriceRange(group.priceRanges.complete),
    encodePriceRange(group.priceRanges.sealed),
  ];
}

function decodePhysicalEditionGroup(
  group: PhysicalEditionGroupTuple | null,
): CatalogPhysicalEditionGroupSummary | undefined {
  if (!group) return undefined;
  const complete = decodePriceRange(group[14]);
  const sealed = decodePriceRange(group[15]);
  return {
    guideId: group[0],
    canonicalCatalogId: group[1],
    ...(group[2] ? { editionFamilyId: group[2] } : {}),
    ...(group[3] ? { editionFamilyLabel: group[3] } : {}),
    catalogIds: group[4],
    legacyRegions: group[5],
    marketRegions: group[6],
    overviewRegions: group[7],
    physicalEditionCount: group[8],
    collectibleVariantCount: group[9],
    broadRegions: group[10].map((entry) => ({
      value: entry[0],
      label: entry[1],
      editionCount: entry[2],
    })),
    editionTypes: group[11],
    ratingSystems: group[12],
    packagingLanguages: group[13],
    priceRanges: {
      ...(complete ? { complete } : {}),
      ...(sealed ? { sealed } : {}),
    },
  };
}

export function encodeCatalogBrowseGame(game: CatalogListGame): CatalogBrowseGameTuple {
  const definedMask =
    (game.regionalStatus !== undefined ? DEFINED.regionalStatus : 0) |
    (game.canonicalSeoSlug !== undefined ? DEFINED.canonicalSeoSlug : 0) |
    (game.physicalVariant !== undefined ? DEFINED.physicalVariant : 0) |
    (game.estimatedPriceLoose !== undefined ? DEFINED.estimatedPriceLoose : 0) |
    (game.estimatedPriceGameManual !== undefined ? DEFINED.estimatedPriceGameManual : 0) |
    (game.estimatedPriceComplete !== undefined ? DEFINED.estimatedPriceComplete : 0) |
    (game.estimatedPriceSealed !== undefined ? DEFINED.estimatedPriceSealed : 0) |
    (game.estimatedPriceNewRetail !== undefined ? DEFINED.estimatedPriceNewRetail : 0) |
    (game.priceRegionVerified !== undefined ? DEFINED.priceRegionVerified : 0);
  return [
    game.id,
    game.slug,
    game.title,
    game.platformSlug,
    game.region,
    game.regionalStatus ?? null,
    game.canonicalSeoSlug ?? null,
    game.physicalVariant ?? null,
    game.coverUrl ?? null,
    game.recommendedPrice ?? null,
    game.estimatedPriceLoose ?? null,
    game.estimatedPriceGameManual ?? null,
    game.estimatedPriceComplete ?? null,
    game.estimatedPriceSealed ?? null,
    game.estimatedPriceNewRetail ?? null,
    game.pcRefPrice ?? null,
    game.hasEsPrice === true,
    game.priceRegionVerified ?? null,
    game.displayPlatform,
    game.displayYear,
    encodePhysicalEditionGroup(game.physicalEditionGroup),
    game.isGrail,
    game.isTopSegment,
    compactSearchText(game.searchText),
    compactSearchText(game.gameSearchText),
    compactSearchText(game.companySearchText),
    game.companies ?? [],
    game.sortGenre ?? null,
    game.sortReference ?? null,
    game.genreSlugs ?? [],
    game.subgenreSlugs ?? [],
    game.facetSlugs ?? [],
    definedMask,
  ];
}

export function decodeCatalogBrowseGame(game: CatalogBrowseGameTuple): CatalogListGame {
  const physicalEditionGroup = decodePhysicalEditionGroup(game[20]);
  const definedMask = game[32];
  return {
    id: game[0],
    slug: game[1],
    title: game[2],
    platformSlug: game[3],
    region: game[4],
    ...(definedMask & DEFINED.regionalStatus ? { regionalStatus: game[5]! } : {}),
    ...(definedMask & DEFINED.canonicalSeoSlug ? { canonicalSeoSlug: game[6]! } : {}),
    ...(definedMask & DEFINED.physicalVariant ? { physicalVariant: game[7] } : {}),
    coverUrl: game[8],
    recommendedPrice: game[9],
    ...(definedMask & DEFINED.estimatedPriceLoose ? { estimatedPriceLoose: game[10] } : {}),
    ...(definedMask & DEFINED.estimatedPriceGameManual ? { estimatedPriceGameManual: game[11] } : {}),
    ...(definedMask & DEFINED.estimatedPriceComplete ? { estimatedPriceComplete: game[12] } : {}),
    ...(definedMask & DEFINED.estimatedPriceSealed ? { estimatedPriceSealed: game[13] } : {}),
    ...(definedMask & DEFINED.estimatedPriceNewRetail ? { estimatedPriceNewRetail: game[14] } : {}),
    pcRefPrice: game[15],
    hasEsPrice: game[16],
    ...(definedMask & DEFINED.priceRegionVerified ? { priceRegionVerified: game[17]! } : {}),
    displayPlatform: game[18],
    displayYear: game[19],
    ...(physicalEditionGroup ? { physicalEditionGroup } : {}),
    isGrail: game[21],
    isTopSegment: game[22],
    searchText: game[23],
    gameSearchText: game[24],
    companySearchText: game[25],
    companies: game[26],
    sortGenre: game[27] ?? "\uffff",
    sortReference: game[28] ?? game[1] ?? game[0],
    genreSlugs: game[29],
    subgenreSlugs: game[30],
    facetSlugs: game[31],
  };
}

function stableJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

/** Conservative hash: any hot catalog change keeps using the exact live path. */
export function catalogBrowseFingerprint(game: CatalogGame): string {
  return createHash("sha256").update(stableJson(game)).digest("base64url").slice(0, 16);
}
