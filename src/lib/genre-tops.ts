import genreTopsData from "../../data/genre-tops.json";
import { catalogGamePath } from "./catalog-url";
import { getCatalogGame, getPlatform } from "./catalog";

type GenreTopRaw = { id: string; year?: number | null };
type GenreTopsFile = {
  version?: number;
  generatedAt?: string | null;
  syncedAt?: string | null;
  genres?: Record<string, { gameCount?: number; platforms?: Record<string, GenreTopRaw[]> }>;
};

const topsFile = genreTopsData as GenreTopsFile;

export type GenreReferenceGame = {
  id: string;
  title: string;
  region: string;
  year: number | null;
  href: string;
};

export type GenrePlatformReferenceTop = {
  platformSlug: string;
  platformName: string;
  games: GenreReferenceGame[];
};

export function getGenreReferenceTops(genreSlug: string): GenrePlatformReferenceTop[] {
  const genreTops = topsFile.genres?.[genreSlug]?.platforms;
  if (!genreTops) return [];

  const rows: GenrePlatformReferenceTop[] = [];
  for (const [platformSlug, entries] of Object.entries(genreTops)) {
    const games: GenreReferenceGame[] = [];
    for (const entry of entries) {
      const game = getCatalogGame(entry.id);
      if (!game) continue;
      games.push({
        id: game.id,
        title: game.title,
        region: game.region,
        year: entry.year ?? null,
        href: catalogGamePath(game),
      });
    }
    if (games.length === 0) continue;
    rows.push({
      platformSlug,
      platformName: getPlatform(platformSlug)?.shortName ?? platformSlug,
      games,
    });
  }

  return rows.sort(
    (a, b) =>
      b.games.length - a.games.length ||
      a.platformName.localeCompare(b.platformName, "es"),
  );
}

export function genreTopsGeneratedAt(): string | null | undefined {
  return topsFile.generatedAt;
}
