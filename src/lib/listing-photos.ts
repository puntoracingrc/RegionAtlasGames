import type { ListingPhoto, ListingPhotoSlot } from "./marketplace-types";
import { OPTIONAL_PHOTO_SLOTS, REQUIRED_PHOTO_SLOTS } from "./marketplace-types";

export const MIN_PHOTO_WIDTH = 800;
export const MIN_PHOTO_HEIGHT = 600;
export const MIN_PHOTO_BYTES = 40_000;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_PHOTO_INPUT_PIXELS = 40_000_000;
export const MAX_DUPLICATE_PHOTO_DISTANCE = 4;

export type DuplicateListingPhoto = {
  slot: ListingPhotoSlot;
  kind: "same_url" | "same_file" | "same_image";
};

function perceptualHashDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) {
    return Number.POSITIVE_INFINITY;
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export function findDuplicateListingPhoto(
  photos: ListingPhoto[],
  candidate: ListingPhoto,
): DuplicateListingPhoto | null {
  for (const photo of photos) {
    if (photo.slot === candidate.slot) continue;
    if (photo.url === candidate.url) return { slot: photo.slot, kind: "same_url" };
    if (photo.contentHash && candidate.contentHash && photo.contentHash === candidate.contentHash) {
      return { slot: photo.slot, kind: "same_file" };
    }
    if (
      photo.perceptualHash
      && candidate.perceptualHash
      && perceptualHashDistance(photo.perceptualHash, candidate.perceptualHash)
        <= MAX_DUPLICATE_PHOTO_DISTANCE
    ) {
      return { slot: photo.slot, kind: "same_image" };
    }
  }
  return null;
}

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
