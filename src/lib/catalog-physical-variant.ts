import { getCatalogGame } from "./catalog";
import { getCatalogEditionGuides } from "./catalog-edition-guides";
import { isStrongPhysicalEvidence } from "./catalog-edition-guide-types";
import { getOwnedScanSetById } from "./catalog-owned-scans";
import { collectionStorageIdentityKey } from "./collection-identity";
import type { CollectionItem, CollectionView } from "./types";

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

function resolveExplicitVariant(
  catalogId: string,
  physicalVariantId: string,
): ResolvedCatalogPhysicalVariant | undefined {
  for (const guide of getCatalogEditionGuides()) {
    const edition = guide.physicalEditions.find((candidate) => candidate.id === physicalVariantId);
    if (!edition) continue;
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
    const edition = guide.physicalEditions.find((candidate) => candidate.catalogIds.includes(catalogId));
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

export function collectionPhysicalIdentityKey(item: CollectionPhysicalIdentity): string {
  const resolved = resolveCatalogPhysicalVariant(item.catalogId, item.physicalVariantId);
  if (resolved) return `physical:${resolved.guideId}:${resolved.physicalVariantId}`;
  if (item.physicalVariantId) return `physical:unresolved:${collectionStorageIdentityKey(item)}`;
  return collectionStorageIdentityKey(item);
}

export function withResolvedCollectionPhysicalVariant(item: CollectionView): CollectionView {
  const resolved = resolveCatalogPhysicalVariant(item.catalogId, item.physicalVariantId);
  if (!resolved?.editionFamilyId) return item;
  const guide = getCatalogEditionGuides().find((candidate) => candidate.id === resolved.guideId);
  const edition = guide?.physicalEditions.find((candidate) => candidate.id === resolved.physicalVariantId);
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
    physicalVariantId: resolved.physicalVariantId,
    physicalVariantLabel: resolved.physicalVariantLabel,
    editionFamilyLabel: resolved.editionFamilyLabel,
    coverUrl: scanCover ?? evidenceCover ?? catalogCover ?? null,
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
