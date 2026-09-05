import type {
  CatalogGame,
  DetailEntity,
  GameDetails,
  GameDetailsFieldProvenance,
  GameDetailsFieldSource,
} from "./types";

const TODOCONSOLAS_SOURCE_FIELDS = [
  "tcnsRetailPrice",
  "tcnsProductUrl",
  "tcnsMatchedAt",
  "tcnsCondition",
  "tcnsInStock",
] as const satisfies readonly (keyof CatalogGame)[];

const ORIGINAL_CONTENT_FIELDS = [
  "manualExpected",
  "originalContents",
  "originalContentsSource",
  "originalContentsUpdatedAt",
] as const satisfies readonly (keyof CatalogGame)[];

const REGIONAL_PACKAGING_FIELDS = [
  "regionalPackaging",
  "regionalPackagingSource",
  "regionalPackagingUpdatedAt",
] as const satisfies readonly (keyof CatalogGame)[];

const VERIFIED_DETAILS_FIELDS = ["developer", "publisher"] as const;
type VerifiedDetailsField = (typeof VERIFIED_DETAILS_FIELDS)[number];
type VerifiedCompanyCreditDetails = {
  developer: DetailEntity | null;
  publisher: DetailEntity | null;
  fieldSources?: Partial<Record<VerifiedDetailsField, GameDetailsFieldSource>>;
  fieldProvenance?: Partial<
    Record<VerifiedDetailsField, GameDetailsFieldProvenance>
  >;
};

function sourceTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasCompleteFieldProvenance(
  provenance: GameDetailsFieldProvenance | undefined,
): provenance is GameDetailsFieldProvenance {
  return Boolean(
    provenance &&
      sourceTimestamp(provenance.reviewedAt) > Number.NEGATIVE_INFINITY &&
      provenance.reviewBatch.trim() &&
      provenance.evidenceSummary.trim() &&
      provenance.evidenceUrls.some((url) => url.trim()),
  );
}

export function mergeVerifiedCompanyCredits(
  staticDetails: VerifiedCompanyCreditDetails,
  currentDetails?: GameDetails,
): GameDetails {
  const merged: GameDetails = currentDetails
    ? { ...currentDetails }
    : {
        year: null,
        releaseDate: null,
        reference: null,
        players: null,
        support: null,
        developer: null,
        publisher: null,
        genres: [],
        series: null,
        fetchedAt:
          staticDetails.fieldProvenance?.developer?.reviewedAt ??
          staticDetails.fieldProvenance?.publisher?.reviewedAt ??
          "1970-01-01",
      };
  let fieldSources = currentDetails?.fieldSources;
  let fieldProvenance = currentDetails?.fieldProvenance;

  for (const field of VERIFIED_DETAILS_FIELDS) {
    const staticValue = staticDetails[field];
    const staticProvenance = staticDetails.fieldProvenance?.[field];
    if (!staticValue || !hasCompleteFieldProvenance(staticProvenance)) continue;

    const currentValue = currentDetails?.[field];
    const currentProvenance = currentDetails?.fieldProvenance?.[field];
    const staticReviewedAt = sourceTimestamp(staticProvenance.reviewedAt);
    if (
      currentValue &&
      hasCompleteFieldProvenance(currentProvenance) &&
      staticReviewedAt <= sourceTimestamp(currentProvenance.reviewedAt)
    ) {
      continue;
    }

    merged[field] = staticValue;
    fieldSources = {
      ...fieldSources,
      [field]: staticDetails.fieldSources?.[field] ?? staticProvenance.source,
    };
    fieldProvenance = {
      ...fieldProvenance,
      [field]: staticProvenance,
    };
  }

  if (fieldSources !== currentDetails?.fieldSources) merged.fieldSources = fieldSources;
  if (fieldProvenance !== currentDetails?.fieldProvenance) {
    merged.fieldProvenance = fieldProvenance;
  }

  return merged;
}

export function mergeCatalogGameWithOverlay(
  staticGame: CatalogGame,
  overlayGame: CatalogGame,
): CatalogGame {
  if (staticGame.id !== overlayGame.id) return overlayGame;

  const merged = { ...overlayGame };
  if (
    sourceTimestamp(staticGame.tcnsMatchedAt) >
    sourceTimestamp(overlayGame.tcnsMatchedAt)
  ) {
    for (const field of TODOCONSOLAS_SOURCE_FIELDS) {
      (merged as Record<keyof CatalogGame, unknown>)[field] = staticGame[field];
    }
  }
  if (
    sourceTimestamp(staticGame.originalContentsUpdatedAt) >
    sourceTimestamp(overlayGame.originalContentsUpdatedAt)
  ) {
    for (const field of ORIGINAL_CONTENT_FIELDS) {
      (merged as Record<keyof CatalogGame, unknown>)[field] = staticGame[field];
    }
  }
  if (
    sourceTimestamp(staticGame.regionalPackagingUpdatedAt) >
    sourceTimestamp(overlayGame.regionalPackagingUpdatedAt)
  ) {
    for (const field of REGIONAL_PACKAGING_FIELDS) {
      (merged as Record<keyof CatalogGame, unknown>)[field] = staticGame[field];
    }
  }

  return merged;
}

export function resolveCatalogOverlayCandidate(
  param: string,
  staticGame: CatalogGame | undefined,
  overlayIds: readonly string[],
  overlaySeoSlugs: Readonly<Record<string, string>>,
): string | null {
  const directOverlayId = overlaySeoSlugs[param] ?? (overlayIds.includes(param) ? param : null);
  if (directOverlayId) return directOverlayId;
  if (staticGame && overlayIds.includes(staticGame.id)) return staticGame.id;
  return null;
}

export function mergeCatalogPlatformGames(
  platformSlug: string,
  staticGames: readonly CatalogGame[],
  overlayGames: readonly CatalogGame[],
): CatalogGame[] {
  const byId = new Map(staticGames.map((game) => [game.id, game]));

  for (const overlay of overlayGames) {
    if (overlay.platformSlug === platformSlug) {
      const staticGame = byId.get(overlay.id);
      byId.set(
        overlay.id,
        staticGame ? mergeCatalogGameWithOverlay(staticGame, overlay) : overlay,
      );
    } else {
      byId.delete(overlay.id);
    }
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
}
