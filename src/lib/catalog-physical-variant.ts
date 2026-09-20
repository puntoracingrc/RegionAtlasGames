import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuideModel, getCatalogEditionGuides } from "./catalog-edition-guides";
import {
  catalogBroadRegionLabel,
  catalogMarketRegionToLegacyRegion,
  isStrongPhysicalEvidence,
  type CatalogEditionFamily,
  type CatalogEditionGuideModel,
  type CatalogPhysicalEdition,
  type CatalogPhysicalEditionGroupSummary,
} from "./catalog-edition-guide-types";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { collectionStorageIdentityKey } from "./collection-identity";
import type { CollectionItem, CollectionView } from "./types";
import { platformPriceMedia } from "./platform-price-condition-policy";

type CollectionPhysicalIdentity = {
  catalogId?: CollectionItem["catalogId"];
  physicalVariantId?: CollectionItem["physicalVariantId"];
};

export type ResolvedCatalogPhysicalVariant = {
  guideId: string;
  physicalVariantId: string;
  physicalVariantLabel: string;
  editionFamilyId?: string;
  editionFamilyLabel?: string;
  representativeCatalogId: string;
};

export type CatalogEditionMembership = {
  guide: CatalogEditionGuideModel;
  family: CatalogEditionFamily;
  edition: CatalogPhysicalEdition;
};

function resolveExplicitVariant(
  catalogId: string,
  physicalVariantId: string,
): ResolvedCatalogPhysicalVariant | undefined {
  for (const guide of getCatalogEditionGuides()) {
    const edition = guide.physicalEditions.find((candidate) => candidate.id === physicalVariantId);
    if (!edition || edition.collectionIdentity !== "physical-variant") continue;
    const family = guide.editionFamilies.find((candidate) =>
      candidate.physicalEditionIds.includes(edition.id),
    );
    const allowedCatalogIds = family
      ? [
          family.representativeCatalogId,
          ...guide.physicalEditions
            .filter((candidate) => family.physicalEditionIds.includes(candidate.id))
            .flatMap((candidate) => candidate.catalogIds),
        ]
      : edition.catalogIds;
    if (!allowedCatalogIds.includes(catalogId)) return undefined;
    return {
      guideId: guide.id,
      physicalVariantId: edition.id,
      physicalVariantLabel: edition.label,
      ...(family ? { editionFamilyId: family.id, editionFamilyLabel: family.label } : {}),
      representativeCatalogId: family?.representativeCatalogId ?? edition.catalogIds[0] ?? catalogId,
    };
  }
  return undefined;
}

/**
 * Resolves a collection identity without rewriting legacy records. An explicit
 * physicalVariantId always wins; catalogId is only the fallback for old items.
 */
export function resolveCatalogPhysicalVariant(
  catalogId: string | null | undefined,
  physicalVariantId?: string | null,
): ResolvedCatalogPhysicalVariant | undefined {
  if (!catalogId) return undefined;
  if (physicalVariantId) return resolveExplicitVariant(catalogId, physicalVariantId);

  for (const guide of getCatalogEditionGuides()) {
    const edition = guide.physicalEditions.find((candidate) =>
      candidate.collectionIdentity === "physical-variant" && candidate.catalogIds.includes(catalogId));
    if (!edition) continue;
    const family = guide.editionFamilies.find((candidate) =>
      candidate.physicalEditionIds.includes(edition.id),
    );
    return {
      guideId: guide.id,
      physicalVariantId: edition.id,
      physicalVariantLabel: edition.label,
      ...(family ? { editionFamilyId: family.id, editionFamilyLabel: family.label } : {}),
      representativeCatalogId: family?.representativeCatalogId ?? edition.catalogIds[0] ?? catalogId,
    };
  }
  return undefined;
}

/**
 * Resolves the V2 presentation family without changing the copy's persisted
 * catalog or physical-variant identity.
 */
export function resolveCatalogEditionMembership(
  catalogId: string | null | undefined,
  physicalVariantId?: string | null,
): CatalogEditionMembership | undefined {
  if (!catalogId) return undefined;
  const game = getCatalogGame(catalogId);
  if (!game) return undefined;
  const guide = getCatalogEditionGuideModel(game);
  if (!guide?.editionFamilies.length) return undefined;

  const edition = physicalVariantId
    ? guide.physicalEditions.find((candidate) => candidate.id === physicalVariantId)
    : guide.physicalEditions.find((candidate) => candidate.catalogIds.includes(catalogId));
  if (!edition) return undefined;

  const family = guide.editionFamilies.find((candidate) =>
    candidate.physicalEditionIds.includes(edition.id),
  );
  if (!family) return undefined;

  if (physicalVariantId) {
    const allowedCatalogIds = new Set([
      family.representativeCatalogId,
      ...guide.physicalEditions
        .filter((candidate) => family.physicalEditionIds.includes(candidate.id))
        .flatMap((candidate) => candidate.catalogIds),
    ]);
    if (!allowedCatalogIds.has(catalogId)) return undefined;
  }

  return { guide, family, edition };
}

function broadRegionFallback(edition: CatalogPhysicalEdition): string {
  switch (edition.broadRegion) {
    case "EUROPE":
      return "PAL Europa";
    case "NORTH_AMERICA":
      return "Norteamérica";
    case "ASIA":
      return "Asia";
    default:
      return "Internacional";
  }
}

function ownedEditionRegions(
  item: CollectionView,
  edition: CatalogPhysicalEdition,
): string[] {
  if (item.physicalVariantId && edition.marketRegions.length) {
    return edition.marketRegions.map(catalogMarketRegionToLegacyRegion);
  }
  if (item.region?.trim()) return [item.region];
  if (edition.marketRegions.length) {
    return edition.marketRegions.map(catalogMarketRegionToLegacyRegion);
  }
  return [broadRegionFallback(edition)];
}

function singlePriceRange(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? { min: value, max: value } : undefined;
}

function collectionEditionGroup(
  item: CollectionView,
  membership: CatalogEditionMembership,
): CatalogPhysicalEditionGroupSummary {
  const { guide, family, edition } = membership;
  const complete = singlePriceRange(item.estimatedPriceComplete);
  const loose = platformPriceMedia(item.platformSlug) === "cartridge"
    ? singlePriceRange(item.estimatedPriceLoose ?? item.estimatedPriceGameManual)
    : undefined;
  const sealed = singlePriceRange(item.estimatedPriceSealed ?? item.estimatedPriceNewRetail);
  return {
    guideId: guide.id,
    canonicalCatalogId: family.representativeCatalogId,
    editionFamilyId: family.id,
    editionFamilyLabel: family.label,
    catalogIds: item.catalogId ? [item.catalogId] : [],
    legacyRegions: ownedEditionRegions(item, edition),
    marketRegions: [...edition.marketRegions],
    overviewRegions: ownedEditionRegions(item, edition),
    physicalEditionCount: 1,
    collectibleVariantCount: edition.variants.length,
    broadRegions: [{
      value: edition.broadRegion,
      label: catalogBroadRegionLabel(edition.broadRegion),
      editionCount: 1,
    }],
    editionTypes: [edition.editionType],
    ratingSystems: [...edition.ratingSystems],
    packagingLanguages: [...edition.packagingLanguages],
    priceRanges: {
      ...(loose ? { loose } : {}),
      ...(complete ? { complete } : {}),
      ...(sealed ? { sealed } : {}),
    },
  };
}

export function collectionPhysicalIdentityKey(item: CollectionPhysicalIdentity): string {
  const resolved = resolveCatalogPhysicalVariant(item.catalogId, item.physicalVariantId);
  if (resolved) return `physical:${resolved.guideId}:${resolved.physicalVariantId}`;
  if (item.physicalVariantId) return `physical:unresolved:${collectionStorageIdentityKey(item)}`;
  return collectionStorageIdentityKey(item);
}

export function withResolvedCollectionPhysicalVariant(item: CollectionView): CollectionView {
  const membership = resolveCatalogEditionMembership(item.catalogId, item.physicalVariantId);
  const resolved = resolveCatalogPhysicalVariant(item.catalogId, item.physicalVariantId);
  if (!membership) return item;
  const { family, edition } = membership;
  const scanCover = edition?.scanSetIds.flatMap((id) => {
    const scans = getOwnedScanSetById(id);
    return scans ? [scans.primaryCoverUrl] : [];
  })[0];
  const evidenceCover = edition?.images.find((image) => isStrongPhysicalEvidence(image.evidenceType))?.thumbnailUrl;
  const catalogCover = edition?.catalogIds.flatMap((id) => {
    const game = getCatalogGame(id);
    return game?.coverUrl ? [game.coverUrl] : [];
  })[0];
  return {
    ...item,
    ...(resolved ? {
      physicalVariantId: resolved.physicalVariantId,
      physicalVariantLabel: resolved.physicalVariantLabel,
    } : {}),
    editionFamilyLabel: family.label,
    physicalEditionId: edition.id,
    physicalEditionGroup: collectionEditionGroup(item, membership),
    coverUrl: scanCover ?? evidenceCover ?? catalogCover ?? item.coverUrl,
  };
}

export function collectionItemMatchesPhysicalVariant(
  item: CollectionPhysicalIdentity,
  physicalVariantId: string,
): boolean {
  return resolveCatalogPhysicalVariant(item.catalogId, item.physicalVariantId)?.physicalVariantId === physicalVariantId;
}

export function countOwnedPhysicalVariant(
  items: Array<CollectionPhysicalIdentity & Pick<CollectionItem, "quantity">>,
  physicalVariantId: string,
): number {
  return items
    .filter((item) => collectionItemMatchesPhysicalVariant(item, physicalVariantId))
    .reduce((total, item) => total + Math.max(1, item.quantity || 1), 0);
}
