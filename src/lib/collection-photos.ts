import type { CollectionPhoto, CollectionPhotoSlot } from "./types";

export const COLLECTION_PHOTO_SLOTS: CollectionPhotoSlot[] = [
  "cover-front",
  "cover-back",
  "detail-1",
  "detail-2",
  "detail-3",
  "detail-4",
];

export const COLLECTION_PHOTO_LABELS: Record<CollectionPhotoSlot, string> = {
  "cover-front": "Portada",
  "cover-back": "Contraportada",
  "detail-1": "Detalle 1",
  "detail-2": "Detalle 2",
  "detail-3": "Detalle 3",
  "detail-4": "Detalle 4",
};

export function isCollectionPhotoSlot(value: string): value is CollectionPhotoSlot {
  return COLLECTION_PHOTO_SLOTS.includes(value as CollectionPhotoSlot);
}

export function orderedCollectionPhotos(
  photos: CollectionPhoto[] | null | undefined,
): CollectionPhoto[] {
  const position = new Map(COLLECTION_PHOTO_SLOTS.map((slot, index) => [slot, index]));
  return [...(photos ?? [])]
    .filter((photo) => isCollectionPhotoSlot(photo.slot))
    .sort((left, right) => (position.get(left.slot) ?? 99) - (position.get(right.slot) ?? 99));
}

export function upsertCollectionPhoto(
  photos: CollectionPhoto[] | null | undefined,
  photo: CollectionPhoto,
): CollectionPhoto[] {
  return orderedCollectionPhotos([
    ...(photos ?? []).filter((stored) => stored.slot !== photo.slot),
    photo,
  ]);
}

export function removeCollectionPhoto(
  photos: CollectionPhoto[] | null | undefined,
  slot: CollectionPhotoSlot,
): CollectionPhoto[] {
  return orderedCollectionPhotos((photos ?? []).filter((photo) => photo.slot !== slot));
}
