import { getRegionDisplay } from "./region-display";
import { slugify } from "./slug";
import type { CatalogGame } from "./types";

export type CatalogIdentityInput = Pick<
  CatalogGame,
  "platformSlug" | "region" | "edition" | "title"
> &
  Partial<Pick<CatalogGame, "physicalVariant" | "physicalReleaseGroup">>;

function identityPart(value: string | null | undefined, fallback: string): string {
  const clean = value?.trim();
  return slugify(clean || fallback);
}

export function catalogIdentityKey(input: CatalogIdentityInput): string {
  return [
    identityPart(input.platformSlug, "platform"),
    identityPart(getRegionDisplay(input.region).label, "region"),
    identityPart(input.edition, "standard"),
    identityPart(input.physicalVariant, "default"),
    identityPart(input.title, "game"),
  ].join("::");
}

export function findCatalogIdentityCollision(
  games: CatalogGame[],
  input: CatalogIdentityInput,
  options?: {
    excludeCatalogId?: string | null;
    allowDistinctPhysicalBarcode?: boolean;
  },
): CatalogGame | null {
  const wanted = catalogIdentityKey(input);
  const wantedBarcode = input.physicalReleaseGroup?.barcode?.trim() || null;
  return (
    games.find(
      (game) => {
        if (
          game.id === options?.excludeCatalogId ||
          game.listingStatus === "excluded" ||
          catalogIdentityKey(game) !== wanted
        ) {
          return false;
        }
        if (!options?.allowDistinctPhysicalBarcode || !wantedBarcode) return true;
        const existingBarcode = game.physicalReleaseGroup?.barcode?.trim() || null;
        return !existingBarcode || existingBarcode === wantedBarcode;
      },
    ) ?? null
  );
}
