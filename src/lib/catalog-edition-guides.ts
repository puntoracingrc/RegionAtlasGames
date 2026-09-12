import guideData from "../../data/catalog-edition-guides.json";
import { getCatalogGame, isPublicCatalogGame } from "./catalog";
import { catalogGamePath } from "./catalog-path";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import {
  catalogBroadRegionFromLegacyRegion,
  type CatalogEditionGuideModel,
  type CatalogEditionImage,
  type CatalogPhysicalEdition,
  type CatalogPhysicalEditionType,
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
  game: { title: string; platformSlug: string; canonicalCatalogId: string };
  physicalEditions: Array<{
    id: string;
    label: string;
    broadRegion: CatalogPhysicalEdition["broadRegion"];
    editionType: CatalogPhysicalEditionType;
    packagingLanguages?: string[];
    ratingSystems?: string[];
    barcode?: string;
    catalogNumber?: string;
    serial?: string;
    boxCode?: string;
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
};

export type RawCatalogEditionGuide = LegacyGuide | PhysicalGuide;
type RawGuideDocument = { schemaVersion: 1 | 2; guides: RawCatalogEditionGuide[] };

const rawGuideDocument = guideData as unknown as RawGuideDocument;
let normalizedGuidesCache: CatalogEditionGuideModel[] | null = null;

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
      packagingLanguages: [],
      ratingSystems: [],
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

  return {
    schemaVersion: 1,
    id: raw.id,
    title: raw.title,
    reviewedAt: raw.reviewedAt,
    note: raw.note,
    game: { title: canonical.title, platformSlug: canonical.platformSlug, canonicalCatalogId: canonical.id },
    physicalEditions,
    sharedDiscs: [],
    sources: raw.sources,
    evidenceNote: raw.evidenceNote,
  };
}

function normalizePhysicalGuide(raw: PhysicalGuide): CatalogEditionGuideModel {
  const evidenceById = new Map(raw.evidence.map((entry) => [entry.id, entry]));
  const imagesByKey = new Map((raw.images ?? []).map((entry) => [entry.key, entry]));
  const editionIds = raw.physicalEditions.map((entry) => entry.id);
  const sharedDiscIds = (raw.sharedDiscs ?? []).map((entry) => entry.id);
  const variantIds = raw.physicalEditions.flatMap((entry) => (entry.variants ?? []).map((variant) => variant.id));
  const priceIdentities = raw.physicalEditions.flatMap((entry) => (entry.variants ?? []).map((variant) => variant.priceIdentity));
  const catalogIds = raw.physicalEditions.flatMap((entry) => entry.catalogIds ?? []);
  ensureUnique(editionIds, `${raw.id} physical edition id`);
  ensureUnique(sharedDiscIds, `${raw.id} shared disc id`);
  ensureUnique(variantIds, `${raw.id} collectible variant id`);
  ensureUnique(priceIdentities, `${raw.id} collectible variant price identity`);
  ensureUnique(catalogIds, `${raw.id} catalogId ownership`);
  requiredCatalogGame(raw.game.canonicalCatalogId, raw.game.platformSlug);
  if (!catalogIds.includes(raw.game.canonicalCatalogId)) {
    throw new Error(`[catalog-edition-guides] ${raw.id} canonicalCatalogId is not linked to an edition`);
  }

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
      packagingLanguages: entry.packagingLanguages ?? [],
      ratingSystems: entry.ratingSystems ?? [],
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
  const sharedDiscs = (raw.sharedDiscs ?? []).map((disc) => ({
    ...disc,
    ratingSystems: disc.ratingSystems ?? [],
    evidence: requireEvidence(disc.evidenceIds),
  }));

  return {
    schemaVersion: 2,
    id: raw.id,
    title: raw.title,
    reviewedAt: raw.reviewedAt,
    note: raw.note,
    game: raw.game,
    physicalEditions,
    sharedDiscs,
    sources: raw.sources,
    evidenceNote: raw.evidenceNote,
  };
}

export function normalizeCatalogEditionGuide(raw: RawCatalogEditionGuide): CatalogEditionGuideModel {
  return "schemaVersion" in raw && raw.schemaVersion === 2
    ? normalizePhysicalGuide(raw)
    : normalizeLegacyGuide(raw as LegacyGuide);
}

export function getCatalogEditionGuides(): CatalogEditionGuideModel[] {
  if (!normalizedGuidesCache) {
    normalizedGuidesCache = rawGuideDocument.guides.map(normalizeCatalogEditionGuide);
  }
  return normalizedGuidesCache;
}

export function getGroupableCatalogEditionGuides(): CatalogEditionGuideModel[] {
  return getCatalogEditionGuides().filter((guide) => guide.schemaVersion === 2);
}

export function getCatalogEditionGuide(game: CatalogGame): CatalogEditionGuideModel | undefined {
  const catalogGame = getCatalogGame(game.id);
  if (
    !catalogGame ||
    catalogGame.platformSlug !== game.platformSlug ||
    catalogGame.slug !== game.slug ||
    catalogGame.region !== game.region ||
    catalogGame.edition !== game.edition
  ) {
    return undefined;
  }
  const guide = getCatalogEditionGuides().find((candidate) => candidate.physicalEditions.some(
    (edition) => edition.catalogIds.includes(game.id),
  ));
  if (!guide) return undefined;
  const currentEdition = guide.physicalEditions.find((edition) => edition.catalogIds.includes(game.id));
  return {
    ...guide,
    currentCatalogId: game.id,
    currentEditionId: currentEdition?.id,
    physicalEditions: guide.physicalEditions.map((edition) => ({
      ...edition,
      catalogLinks: edition.catalogLinks.map((link) => ({ ...link, current: link.catalogId === game.id })),
    })),
  };
}
