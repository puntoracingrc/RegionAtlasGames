import guideData from "../../data/catalog-edition-guides.json";
import acPs3GuideData from "../../data/catalog-edition-guides-ac-ps3.json";
import acPs4WorldwideGuideData from "../../data/catalog-edition-guides-ac-ps4-worldwide.json";
import ac4BlackFlagGuideData from "../../data/catalog-edition-guides-ac4-black-flag.json";
import acChroniclesGuideData from "../../data/catalog-edition-guides-ac-chronicles.json";
import acPs4GuideData from "../../data/catalog-edition-guides-ac-ps4.json";
import acMirageGuideData from "../../data/catalog-edition-guides-ac-mirage.json";
import acMiragePs5GuideData from "../../data/catalog-edition-guides-ac-mirage-ps5.json";
import acSyndicatePs4GuideData from "../../data/catalog-edition-guides-ac-syndicate-ps4.json";
import acEzioCollectionPs4GuideData from "../../data/catalog-edition-guides-ac-ezio-collection-ps4.json";
import acUnityValhallaGuideData from "../../data/catalog-edition-guides-ac-unity-valhalla.json";
import acOdysseyGuideData from "../../data/catalog-edition-guides-ac-odyssey.json";
import acShadowsPs5GuideData from "../../data/catalog-edition-guides-ac-shadows-ps5.json";
import acValhallaPs5GuideData from "../../data/catalog-edition-guides-ac-valhalla-ps5.json";
import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import {
  buildCatalogDerivedGuideIndex,
  buildCatalogDerivedGuideForGame,
  buildRuntimeCatalogEditionGuide,
  extendDocumentedGuidesWithCatalog,
} from "./catalog-derived-edition-guides";
import {
  catalogBroadRegionFromLegacyRegion,
  catalogBroadRegionFromMarketRegion,
  isCatalogPhysicalPriceCondition,
  isCatalogMarketRegion,
  type CatalogEditionGuideModel,
  type CatalogEditionFamily,
  type CatalogEditionImage,
  type CatalogPhysicalEdition,
  type CatalogPhysicalBonusItem,
  type CatalogRelatedRelease,
  type CatalogPhysicalPriceCondition,
  type CatalogPhysicalEditionType,
  type CatalogPhysicalProductType,
  type CatalogPhysicalResearchStatus,
  type CatalogPhysicalVariantConfidence,
} from "./catalog-edition-guide-types";
import type { CatalogGame } from "./types";

type LegacyGuide = {
  id: string;
  title: string;
  reviewedAt: string;
  note: string;
  editions: Array<{
    catalogId: string;
    identity: { platformSlug: string; slug: string; region: string; edition: string };
    label: string;
    description: string;
    imageKeys: string[];
  }>;
  images: Array<Omit<CatalogEditionImage, "evidenceType"> & { evidenceType?: CatalogEditionImage["evidenceType"] }>;
  sources: Array<{ label: string; url?: string }>;
  evidenceNote: string;
};

type PhysicalGuide = {
  schemaVersion: 2;
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
    aliases?: string[];
  };
  editionFamilies?: Array<{
    id: string;
    label: string;
    representativeCatalogId: string;
    physicalEditionIds: string[];
    priceConditions: CatalogPhysicalPriceCondition[];
  }>;
  physicalEditions: Array<{
    id: string;
    label: string;
    broadRegion: CatalogPhysicalEdition["broadRegion"];
    editionType: CatalogPhysicalEditionType;
    releaseStatus?: CatalogPhysicalEdition["releaseStatus"];
    marketRegions?: string[];
    evidenceMarkets?: string[];
    distributionMarkets?: string[];
    packagingLanguages?: string[];
    softwareLanguages?: string[];
    componentLanguageEvidence?: Array<{
      component: CatalogPhysicalEdition["componentLanguageEvidence"][number]["component"];
      languages: string[];
      basis: CatalogPhysicalEdition["componentLanguageEvidence"][number]["basis"];
      exhaustive: boolean;
      note?: string;
      evidenceIds?: string[];
    }>;
    ratingSystems?: string[];
    softwareFamilyCodes?: string[];
    productCodes?: string[];
    physicalProductType?: CatalogPhysicalProductType;
    nativePhysicalPlatform?: string;
    compatiblePlatforms?: string[];
    containsDisc?: boolean;
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
    dimensions?: CatalogPhysicalEdition["dimensions"];
    physicalContents?: string[];
    digitalContents?: string[];
    sharedDiscId?: string;
    catalogIds?: string[];
    scanSetIds?: string[];
    evidenceIds?: string[];
    imageKeys?: string[];
    includesEditionIds?: string[];
    includesVariantIds?: string[];
    containsCatalogIds?: string[];
    variants?: Array<{
      id: string;
      label: string;
      stickers?: string[];
      markings?: string[];
      barcode?: string;
      boxCode?: string;
      notes?: string[];
      evidenceIds?: string[];
      scanSetIds?: string[];
      priceIdentity: string;
    }>;
    notes?: string[];
  }>;
  physicalBonusItems?: Array<{
    id: string;
    label: string;
    relatedGameId: string;
    type: CatalogPhysicalBonusItem["type"];
    retailer?: string;
    market: string;
    upc?: string;
    includesGame: false;
    catalogIds?: string[];
    evidenceIds?: string[];
    notes?: string[];
  }>;
  relatedReleases?: Array<{
    id: string;
    label: string;
    type: CatalogRelatedRelease["type"];
    expansionOf: string;
    evidenceIds?: string[];
    notes?: string[];
  }>;
  sharedDiscs?: Array<{
    id: string;
    label: string;
    technicalRegion?: CatalogPhysicalEdition["broadRegion"];
    serial?: string;
    ratingSystems?: string[];
    evidenceIds?: string[];
  }>;
  evidence: Array<{
    id: string;
    type: CatalogPhysicalEdition["evidence"][number]["type"];
    label: string;
    url?: string;
    summary?: string;
    supports: string[];
  }>;
  images?: CatalogEditionImage[];
  sources: Array<{ label: string; url?: string }>;
  evidenceNote: string;
  researchTasks?: Array<{
    id: string;
    label: string;
    status: CatalogPhysicalResearchStatus;
    marketRegions?: string[];
    notes?: string[];
  }>;
};

export type RawCatalogEditionGuide = LegacyGuide | PhysicalGuide;
type RawGuideDocument = { schemaVersion: 1 | 2; guides: RawCatalogEditionGuide[] };

const rawGuideDocuments = [
  guideData,
  acPs3GuideData,
  acPs4WorldwideGuideData,
  ac4BlackFlagGuideData,
  acChroniclesGuideData,
  acPs4GuideData,
  acMirageGuideData,
  acMiragePs5GuideData,
  acSyndicatePs4GuideData,
  acEzioCollectionPs4GuideData,
  acUnityValhallaGuideData,
  acOdysseyGuideData,
  acShadowsPs5GuideData,
  acValhallaPs5GuideData,
] as unknown as RawGuideDocument[];
let normalizedGuidesCache: CatalogEditionGuideModel[] | null = null;
let derivedGuidesCache: ReturnType<typeof buildCatalogDerivedGuideIndex> | null = null;
let documentedGuideByCatalogIdCache: Map<string, CatalogEditionGuideModel> | null = null;
let documentedCatalogIdsCache: Set<string> | null = null;
const lazyDerivedGuideByCatalogId = new Map<string, CatalogEditionGuideModel>();

function catalogIdsOwnedByGuide(guide: CatalogEditionGuideModel): string[] {
  return [
    ...guide.physicalEditions.flatMap((edition) => edition.catalogIds),
    ...guide.physicalBonusItems.flatMap((item) => item.catalogIds),
  ];
}

function requiredCatalogGame(catalogId: string, platformSlug?: string): CatalogGame {
  const game = getCatalogGame(catalogId);
  if (!game || !isPublicCatalogGame(game)) {
    throw new Error(`[catalog-edition-guides] Unknown or non-public catalogId: ${catalogId}`);
  }
  if (platformSlug && game.platformSlug !== platformSlug) {
    throw new Error(`[catalog-edition-guides] ${catalogId} belongs to ${game.platformSlug}, not ${platformSlug}`);
  }
  return game;
}

function legacyEditionType(label: string): CatalogPhysicalEditionType {
  const normalized = label.toLowerCase();
  if (normalized.includes("collector")) return "COLLECTOR";
  if (normalized.includes("gold")) return "GOLD";
  if (normalized.includes("deluxe")) return "DELUXE";
  if (normalized.includes("limited")) return "LIMITED";
  if (normalized.includes("steelbook")) return "STEELBOOK";
  if (normalized.includes("special") || normalized.includes("lenticular")) return "SPECIAL";
  return "STANDARD";
}

function ensureUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`[catalog-edition-guides] Duplicate ${label}`);
  }
}

function normalizeLegacyGuide(raw: LegacyGuide): CatalogEditionGuideModel {
  ensureUnique(raw.editions.map((entry) => entry.catalogId), `${raw.id} catalogId`);
  const canonical = requiredCatalogGame(raw.editions[0].catalogId);
  const allImages = raw.images.map((image) => ({
    ...image,
    evidenceType: image.evidenceType ?? "RETAILER_ASSET" as const,
  }));
  const physicalEditions = raw.editions.map((entry): CatalogPhysicalEdition => {
    const target = requiredCatalogGame(entry.catalogId, entry.identity.platformSlug);
    const identityMatches = target.slug === entry.identity.slug && target.region === entry.identity.region &&
      target.edition === entry.identity.edition;
    if (!identityMatches) {
      throw new Error(`[catalog-edition-guides] Legacy identity mismatch: ${entry.catalogId}`);
    }
    const images = allImages.filter((image) => entry.imageKeys.includes(image.key));
    return {
      id: entry.catalogId,
      label: entry.label,
      broadRegion: catalogBroadRegionFromLegacyRegion(entry.identity.region),
      editionType: legacyEditionType(entry.label),
      releaseStatus: "RELEASED",
      collectionIdentity: "catalog-entry",
      marketRegions: [target.region],
      evidenceMarkets: [],
      distributionMarkets: [],
      packagingLanguages: [],
      softwareLanguages: [],
      componentLanguageEvidence: [],
      ratingSystems: [],
      softwareFamilyCodes: [],
      productCodes: [],
      compatiblePlatforms: [entry.identity.platformSlug],
      physicalContents: [],
      digitalContents: [],
      catalogIds: [entry.catalogId],
      catalogLinks: [{ catalogId: entry.catalogId, href: catalogGamePath(target), current: false, region: target.region }],
      scanSetIds: [],
      evidence: images.map((image) => ({
        id: `legacy-image:${image.key}`,
        type: image.evidenceType,
        label: image.caption,
        url: image.url,
        supports: [],
      })),
      images,
      includesEditionIds: [],
      includesVariantIds: [],
      containsCatalogIds: [],
      variants: [],
      notes: entry.description ? [entry.description] : [],
    };
  });

  const editionsByType = new Map<CatalogPhysicalEditionType, CatalogPhysicalEdition[]>();
  for (const edition of physicalEditions) {
    editionsByType.set(edition.editionType, [...(editionsByType.get(edition.editionType) ?? []), edition]);
  }
  const editionFamilies: CatalogEditionFamily[] = [...editionsByType.entries()].map(([type, editions]) => ({
    id: `legacy-${type.toLowerCase().replaceAll("_", "-")}`,
    label: editions[0].label.split("·")[0].trim(),
    representativeCatalogId: editions[0].catalogIds[0],
    physicalEditionIds: editions.map((edition) => edition.id),
    priceConditions: ["sealed", "newRetail", "complete"],
  }));

  return {
    schemaVersion: 2,
    origin: "documented-guide",
    id: raw.id,
    title: raw.title,
    reviewedAt: raw.reviewedAt,
    note: raw.note,
    game: { title: canonical.title, platformSlug: canonical.platformSlug, canonicalCatalogId: canonical.id },
    physicalEditions,
    physicalBonusItems: [],
    relatedReleases: [],
    editionFamilies,
    sharedDiscs: [],
    sources: raw.sources,
    evidenceNote: raw.evidenceNote,
    researchTasks: [],
  };
}

function normalizePhysicalGuide(raw: PhysicalGuide): CatalogEditionGuideModel {
  const evidenceById = new Map(raw.evidence.map((entry) => [entry.id, entry]));
  const imagesByKey = new Map((raw.images ?? []).map((entry) => [entry.key, entry]));
  const editionIds = raw.physicalEditions.map((entry) => entry.id);
  const bonusItemIds = (raw.physicalBonusItems ?? []).map((entry) => entry.id);
  const relatedReleaseIds = (raw.relatedReleases ?? []).map((entry) => entry.id);
  const sharedDiscIds = (raw.sharedDiscs ?? []).map((entry) => entry.id);
  const variantIds = raw.physicalEditions.flatMap((entry) => (entry.variants ?? []).map((variant) => variant.id));
  const priceIdentities = raw.physicalEditions.flatMap((entry) => (entry.variants ?? []).map((variant) => variant.priceIdentity));
  const catalogIds = [
    ...raw.physicalEditions.flatMap((entry) => entry.catalogIds ?? []),
    ...(raw.physicalBonusItems ?? []).flatMap((entry) => entry.catalogIds ?? []),
  ];
  ensureUnique(editionIds, `${raw.id} physical edition id`);
  ensureUnique(bonusItemIds, `${raw.id} physical bonus item id`);
  ensureUnique(relatedReleaseIds, `${raw.id} related release id`);
  ensureUnique(sharedDiscIds, `${raw.id} shared disc id`);
  ensureUnique(variantIds, `${raw.id} collectible variant id`);
  ensureUnique(priceIdentities, `${raw.id} collectible variant price identity`);
  ensureUnique(catalogIds, `${raw.id} catalogId ownership`);
  requiredCatalogGame(raw.game.canonicalCatalogId, raw.game.platformSlug);
  if (!catalogIds.includes(raw.game.canonicalCatalogId)) {
    throw new Error(`[catalog-edition-guides] ${raw.id} canonicalCatalogId is not linked to an edition`);
  }
  ensureUnique(raw.game.aliases ?? [], `${raw.id} game alias`);

  const requireEvidence = (ids: string[] = []) => ids.map((id) => {
    const evidence = evidenceById.get(id);
    if (!evidence) throw new Error(`[catalog-edition-guides] ${raw.id} unknown evidence: ${id}`);
    return evidence;
  });
  const requireScanSets = (ids: string[] = []) => {
    for (const id of ids) {
      if (!getOwnedScanSetById(id)) throw new Error(`[catalog-edition-guides] ${raw.id} unknown owned scan set: ${id}`);
    }
    return ids;
  };
  for (const image of raw.images ?? []) {
    if (!image.evidenceType) {
      throw new Error(`[catalog-edition-guides] ${raw.id} v2 image without evidenceType: ${image.key}`);
    }
  }
  const requireImages = (keys: string[] = []) => keys.map((key) => {
    const image = imagesByKey.get(key);
    if (!image) throw new Error(`[catalog-edition-guides] ${raw.id} unknown image: ${key}`);
    return image;
  });

  const physicalEditions = raw.physicalEditions.map((entry): CatalogPhysicalEdition => {
    if (entry.sharedDiscId && !sharedDiscIds.includes(entry.sharedDiscId)) {
      throw new Error(`[catalog-edition-guides] ${entry.id} unknown sharedDiscId: ${entry.sharedDiscId}`);
    }
    for (const id of entry.includesEditionIds ?? []) {
      if (!editionIds.includes(id) || id === entry.id) {
        throw new Error(`[catalog-edition-guides] ${entry.id} invalid includesEditionId: ${id}`);
      }
    }
    for (const id of entry.includesVariantIds ?? []) {
      if (!variantIds.includes(id)) throw new Error(`[catalog-edition-guides] ${entry.id} unknown includesVariantId: ${id}`);
    }
    const marketRegions = entry.marketRegions ?? [];
    ensureUnique(marketRegions, `${entry.id} market region`);
    for (const marketRegion of marketRegions) {
      if (!isCatalogMarketRegion(marketRegion)) {
        throw new Error(`[catalog-edition-guides] ${entry.id} invalid V2 market code: ${marketRegion}`);
      }
      if (catalogBroadRegionFromMarketRegion(marketRegion) !== entry.broadRegion) {
        throw new Error(`[catalog-edition-guides] ${entry.id} market outside ${entry.broadRegion}: ${marketRegion}`);
      }
    }
    const evidenceMarkets = entry.evidenceMarkets ?? [];
    const distributionMarkets = entry.distributionMarkets ?? [];
    for (const [label, regions] of [
      ["evidence market", evidenceMarkets],
      ["distribution market", distributionMarkets],
    ] as const) {
      ensureUnique(regions, `${entry.id} ${label}`);
      for (const marketRegion of regions) {
        if (!isCatalogMarketRegion(marketRegion)) {
          throw new Error(`[catalog-edition-guides] ${entry.id} invalid ${label}: ${marketRegion}`);
        }
      }
    }
    ensureUnique(entry.softwareLanguages ?? [], `${entry.id} software language`);
    ensureUnique(entry.softwareFamilyCodes ?? [], `${entry.id} software family code`);
    ensureUnique(entry.productCodes ?? [], `${entry.id} product code`);
    ensureUnique(entry.compatiblePlatforms ?? [], `${entry.id} compatible platform`);
    if (entry.physicalProductType === "NATIVE_GAME_DISC" && (
      entry.nativePhysicalPlatform !== raw.game.platformSlug ||
      entry.containsDisc !== true ||
      entry.countsAsNativePhysicalRelease === false
    )) {
      throw new Error(`[catalog-edition-guides] ${entry.id} invalid native game disc classification`);
    }
    if (entry.physicalProductType === "PREVIOUS_GEN_DISC_WITH_UPGRADE" && !entry.upgradeToPS5) {
      throw new Error(`[catalog-edition-guides] ${entry.id} previous-gen disc is missing its upgrade path`);
    }
    if (entry.upgradeToPS5) {
      if (
        entry.nativePhysicalPlatform !== "ps4" ||
        !entry.compatiblePlatforms?.includes("ps4") ||
        !entry.compatiblePlatforms.includes("ps5") ||
        entry.upgradePath !== "FREE_DIGITAL_PS5_UPGRADE" ||
        entry.countsAsNativePhysicalRelease !== false
      ) {
        throw new Error(`[catalog-edition-guides] ${entry.id} invalid PS4 to PS5 upgrade classification`);
      }
    }
    if ((entry.physicalProductType === "DOWNLOAD_CODE_IN_BOX" || entry.containsDisc === false) && (
      entry.physicalProductType !== "DOWNLOAD_CODE_IN_BOX" ||
      entry.containsDisc !== false || entry.countsAsNativePhysicalRelease !== false
    )) {
      throw new Error(`[catalog-edition-guides] ${entry.id} code-in-box must be excluded from native physical counts`);
    }
    if (entry.requiresBaseGame && !entry.expansionOf) {
      throw new Error(`[catalog-edition-guides] ${entry.id} requiresBaseGame without expansionOf`);
    }
    const links = (entry.catalogIds ?? []).map((catalogId) => {
      const target = requiredCatalogGame(catalogId, raw.game.platformSlug);
      return { catalogId, href: catalogGamePath(target), current: false, region: target.region };
    });
    for (const catalogId of entry.containsCatalogIds ?? []) requiredCatalogGame(catalogId, raw.game.platformSlug);
    const variants = (entry.variants ?? []).map((variant) => ({
      ...variant,
      stickers: variant.stickers ?? [],
      markings: variant.markings ?? [],
      notes: variant.notes ?? [],
      evidence: requireEvidence(variant.evidenceIds),
      scanSetIds: requireScanSets(variant.scanSetIds),
    }));
    return {
      ...entry,
      collectionIdentity: "physical-variant",
      releaseStatus: entry.releaseStatus ?? "RELEASED",
      marketRegions,
      evidenceMarkets: evidenceMarkets.filter(isCatalogMarketRegion),
      distributionMarkets: distributionMarkets.filter(isCatalogMarketRegion),
      packagingLanguages: entry.packagingLanguages ?? [],
      softwareLanguages: entry.softwareLanguages ?? [],
      componentLanguageEvidence: (entry.componentLanguageEvidence ?? []).map((languageEvidence) => ({
        ...languageEvidence,
        evidence: requireEvidence(languageEvidence.evidenceIds),
      })),
      ratingSystems: entry.ratingSystems ?? [],
      softwareFamilyCodes: entry.softwareFamilyCodes ?? [],
      productCodes: entry.productCodes ?? [],
      compatiblePlatforms: entry.compatiblePlatforms ?? [raw.game.platformSlug],
      physicalContents: entry.physicalContents ?? [],
      digitalContents: entry.digitalContents ?? [],
      catalogIds: entry.catalogIds ?? [],
      catalogLinks: links,
      scanSetIds: requireScanSets(entry.scanSetIds),
      evidence: requireEvidence(entry.evidenceIds),
      images: requireImages(entry.imageKeys),
      includesEditionIds: entry.includesEditionIds ?? [],
      includesVariantIds: entry.includesVariantIds ?? [],
      containsCatalogIds: entry.containsCatalogIds ?? [],
      variants,
      notes: entry.notes ?? [],
    };
  });
  const physicalBonusItems = (raw.physicalBonusItems ?? []).map((entry): CatalogPhysicalBonusItem => {
    if (!isCatalogMarketRegion(entry.market)) {
      throw new Error(`[catalog-edition-guides] ${entry.id} invalid bonus market: ${entry.market}`);
    }
    if (entry.includesGame !== false) {
      throw new Error(`[catalog-edition-guides] ${entry.id} physical bonus must not include the game`);
    }
    if (raw.game.canonicalGameId && entry.relatedGameId !== raw.game.canonicalGameId) {
      throw new Error(`[catalog-edition-guides] ${entry.id} bonus points to a different canonical game`);
    }
    const catalogLinks = (entry.catalogIds ?? []).map((catalogId) => {
      const target = requiredCatalogGame(catalogId, raw.game.platformSlug);
      return { catalogId, href: catalogGamePath(target), current: false, region: target.region };
    });
    return {
      ...entry,
      market: entry.market,
      catalogIds: entry.catalogIds ?? [],
      catalogLinks,
      evidence: requireEvidence(entry.evidenceIds),
      notes: entry.notes ?? [],
    };
  });
  const relatedReleases = (raw.relatedReleases ?? []).map((entry): CatalogRelatedRelease => {
    if (raw.game.canonicalGameId && entry.expansionOf !== raw.game.canonicalGameId) {
      throw new Error(`[catalog-edition-guides] ${entry.id} points to a different canonical game`);
    }
    return {
      ...entry,
      evidence: requireEvidence(entry.evidenceIds),
      notes: entry.notes ?? [],
    };
  });
  const sharedDiscs = (raw.sharedDiscs ?? []).map((disc) => ({
    ...disc,
    ratingSystems: disc.ratingSystems ?? [],
    evidence: requireEvidence(disc.evidenceIds),
  }));
  const rawFamilies = raw.editionFamilies ?? [];
  ensureUnique(rawFamilies.map((family) => family.id), `${raw.id} edition family id`);
  ensureUnique(
    rawFamilies.map((family) => family.representativeCatalogId),
    `${raw.id} edition family representative`,
  );
  const familyEditionIds = rawFamilies.flatMap((family) => family.physicalEditionIds);
  ensureUnique(familyEditionIds, `${raw.id} edition family membership`);
  if (rawFamilies.length && familyEditionIds.length !== editionIds.length) {
    throw new Error(`[catalog-edition-guides] ${raw.id} edition families must classify every physical edition`);
  }
  const editionFamilies = rawFamilies.map((family): CatalogEditionFamily => {
    if (!family.physicalEditionIds.length) {
      throw new Error(`[catalog-edition-guides] ${raw.id} empty edition family: ${family.id}`);
    }
    if (!family.priceConditions.length) {
      throw new Error(`[catalog-edition-guides] ${raw.id} empty price conditions: ${family.id}`);
    }
    ensureUnique(family.priceConditions, `${family.id} price condition`);
    for (const condition of family.priceConditions) {
      if (!isCatalogPhysicalPriceCondition(condition)) {
        throw new Error(`[catalog-edition-guides] ${family.id} invalid price condition: ${condition}`);
      }
    }
    for (const editionId of family.physicalEditionIds) {
      if (!editionIds.includes(editionId)) {
        throw new Error(`[catalog-edition-guides] ${family.id} unknown physical edition: ${editionId}`);
      }
    }
    requiredCatalogGame(family.representativeCatalogId, raw.game.platformSlug);
    const familyCatalogIds = physicalEditions
      .filter((edition) => family.physicalEditionIds.includes(edition.id))
      .flatMap((edition) => edition.catalogIds);
    if (!familyCatalogIds.includes(family.representativeCatalogId)) {
      throw new Error(
        `[catalog-edition-guides] ${family.id} representative is not linked to one of its physical editions`,
      );
    }
    return { ...family };
  });
  const researchTaskIds = (raw.researchTasks ?? []).map((task) => task.id);
  ensureUnique(researchTaskIds, `${raw.id} research task id`);
  const researchTasks = (raw.researchTasks ?? []).map((task) => {
    const marketRegions = task.marketRegions ?? [];
    ensureUnique(marketRegions, `${task.id} research market`);
    for (const marketRegion of marketRegions) {
      if (!isCatalogMarketRegion(marketRegion)) {
        throw new Error(`[catalog-edition-guides] ${task.id} invalid research market: ${marketRegion}`);
      }
    }
    return {
      ...task,
      marketRegions: marketRegions.filter(isCatalogMarketRegion),
      notes: task.notes ?? [],
    };
  });

  return {
    schemaVersion: 2,
    origin: "documented-guide",
    id: raw.id,
    title: raw.title,
    reviewedAt: raw.reviewedAt,
    note: raw.note,
    game: raw.game,
    physicalEditions,
    physicalBonusItems,
    relatedReleases,
    editionFamilies,
    sharedDiscs,
    sources: raw.sources,
    evidenceNote: raw.evidenceNote,
    researchTasks,
  };
}

export function normalizeCatalogEditionGuide(raw: RawCatalogEditionGuide): CatalogEditionGuideModel {
  return "schemaVersion" in raw && raw.schemaVersion === 2
    ? normalizePhysicalGuide(raw)
    : normalizeLegacyGuide(raw as LegacyGuide);
}

export function getCatalogEditionGuides(): CatalogEditionGuideModel[] {
  if (!normalizedGuidesCache) {
    normalizedGuidesCache = extendDocumentedGuidesWithCatalog(
      rawGuideDocuments.flatMap((document) => document.guides).map(normalizeCatalogEditionGuide),
    );
  }
  return normalizedGuidesCache;
}

function documentedGuideByCatalogId(): Map<string, CatalogEditionGuideModel> {
  if (!documentedGuideByCatalogIdCache) {
    documentedGuideByCatalogIdCache = new Map(
      getCatalogEditionGuides().flatMap((guide) =>
        catalogIdsOwnedByGuide(guide).map((catalogId) => [catalogId, guide] as const)),
    );
  }
  return documentedGuideByCatalogIdCache;
}

function documentedCatalogIds(): Set<string> {
  documentedCatalogIdsCache ??= new Set(documentedGuideByCatalogId().keys());
  return documentedCatalogIdsCache;
}

function lazyDerivedGuide(game: CatalogGame): CatalogEditionGuideModel | undefined {
  const cached = lazyDerivedGuideByCatalogId.get(game.id);
  if (cached) return cached;

  const guide = buildCatalogDerivedGuideForGame(game, documentedCatalogIds());
  if (!guide) return undefined;
  for (const catalogId of guide.physicalEditions.flatMap((edition) => edition.catalogIds)) {
    lazyDerivedGuideByCatalogId.set(catalogId, guide);
  }
  return guide;
}

export function getGroupableCatalogEditionGuides(): CatalogEditionGuideModel[] {
  return [...getCatalogEditionGuides(), ...catalogDerivedGuides().guides];
}

function catalogDerivedGuides() {
  if (!derivedGuidesCache) {
    const claimedCatalogIds = new Set(
      getCatalogEditionGuides().flatMap(catalogIdsOwnedByGuide),
    );
    derivedGuidesCache = buildCatalogDerivedGuideIndex(claimedCatalogIds);
  }
  return derivedGuidesCache;
}

export function getCatalogEditionGuideModel(game: CatalogGame): CatalogEditionGuideModel | undefined {
  const catalogGame = getCatalogGame(game.id);
  if (!catalogGame) {
    if (!isPublicCatalogGame(game)) return undefined;
    return buildRuntimeCatalogEditionGuide(game, getCatalogEditionGuides());
  }
  if (
    catalogGame.platformSlug !== game.platformSlug ||
    catalogGame.slug !== game.slug ||
    catalogGame.region !== game.region ||
    catalogGame.edition !== game.edition
  ) {
    return undefined;
  }
  return documentedGuideByCatalogId().get(game.id) ?? lazyDerivedGuide(catalogGame);
}

export function getCatalogEditionGuide(game: CatalogGame): CatalogEditionGuideModel | undefined {
  const guide = getCatalogEditionGuideModel(game);
  if (!guide) return undefined;
  return withCurrentCatalogEdition(guide, game.id);
}

function withCurrentCatalogEdition(
  guide: CatalogEditionGuideModel,
  catalogId: string,
): CatalogEditionGuideModel {
  const currentEdition = guide.physicalEditions.find((edition) => edition.catalogIds.includes(catalogId));
  const currentBonusItem = guide.physicalBonusItems.find((item) => item.catalogIds.includes(catalogId));
  const currentEditionFamily = guide.editionFamilies.find((family) =>
    currentEdition ? family.physicalEditionIds.includes(currentEdition.id) : false,
  );
  return {
    ...guide,
    currentCatalogId: catalogId,
    currentEditionId: currentEdition?.id,
    currentEditionFamilyId: currentEditionFamily?.id,
    currentBonusItemId: currentBonusItem?.id,
    physicalEditions: guide.physicalEditions.map((edition) => ({
      ...edition,
      catalogLinks: edition.catalogLinks.map((link) => ({ ...link, current: link.catalogId === catalogId })),
    })),
    physicalBonusItems: guide.physicalBonusItems.map((item) => ({
      ...item,
      catalogLinks: item.catalogLinks.map((link) => ({ ...link, current: link.catalogId === catalogId })),
    })),
  };
}
