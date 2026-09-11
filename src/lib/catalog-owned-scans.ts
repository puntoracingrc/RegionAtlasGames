import scanData from "../../data/catalog-owned-scans.json";
import type { CatalogGame, GameDetails } from "./types";

export type OwnedScanSet = {
  identity: { platformSlug: string; slug: string; region: string; edition: string };
  capturedAt: string;
  sourceLabel: string;
  primaryCoverUrl: string;
  primaryCaption: string;
  packaging: { reference: string | null; ean: string; languages: string[]; marketEvidence: string; productNumber?: string; languageStatement?: string };
  softwareLanguagesPrinted?: { text: string[]; audio: string[] };
  notes: string[];
  images: Array<{
    role: string;
    label: string;
    url: string;
    thumbnailUrl: string;
    width: number;
    height: number;
    redactedCodes?: number;
  }>;
};

const scans = scanData as { games: Record<string, OwnedScanSet> };

// Match a reviewed catalog edition, never a title or a shared product code.
export function getOwnedScanSet(game: CatalogGame): OwnedScanSet | undefined {
  const set = scans.games[game.id];
  if (!set) return undefined;
  const expected = set.identity;
  return game.platformSlug === expected.platformSlug && game.slug === expected.slug &&
    game.region === expected.region && game.edition === expected.edition ? set : undefined;
}

export function withOwnedScanDetails(
  game: CatalogGame,
  details: GameDetails | undefined,
): GameDetails | undefined {
  const set = getOwnedScanSet(game);
  if (!set) return details;
  const base: GameDetails = details ?? {
    year: null, releaseDate: null, reference: null, players: null, support: null,
    developer: null, publisher: null, genres: [], series: null, fetchedAt: set.capturedAt,
  };
  return {
    ...base,
    ...(set.packaging.reference ? {
      reference: set.packaging.reference,
      fieldSources: { ...base.fieldSources, reference: "research" as const },
    } : {}),
    ean: set.packaging.ean,
    sources: {
      ...base.sources,
      ownedScan: {
        url: (set.images.find(image => image.role === "caratula-completa") ?? set.images.find(image => image.role === "contraportada"))!.url,
        label: set.sourceLabel,
        fetchedAt: set.capturedAt,
      },
    },
  };
}
