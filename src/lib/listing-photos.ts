import type { ListingPhoto, ListingPhotoSlot } from "./marketplace-types";
import { OPTIONAL_PHOTO_SLOTS, REQUIRED_PHOTO_SLOTS } from "./marketplace-types";

export const MIN_PHOTO_WIDTH = 800;
export const MIN_PHOTO_HEIGHT = 600;
export const MIN_PHOTO_BYTES = 40_000;

export function missingRequiredPhotos(photos: ListingPhoto[]): ListingPhotoSlot[] {
  const uploaded = new Set(photos.map((p) => p.slot));
  return REQUIRED_PHOTO_SLOTS.filter((slot) => !uploaded.has(slot));
}

export function photosReadyForPublish(photos: ListingPhoto[]): boolean {
  return missingRequiredPhotos(photos).length === 0;
}

export function allPhotoSlots() {
  return [...REQUIRED_PHOTO_SLOTS, ...OPTIONAL_PHOTO_SLOTS];
}
