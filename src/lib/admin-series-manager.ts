import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import seriesIndexData from "../../data/index/series.json";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { catalog as bundledCatalog } from "./catalog";
import { filterEffectiveSeriesCatalogIds } from "./franchise-curation";
import { findGameFacetEntityByNameOrAlias, getGameFacetsTaxonomy } from "./game-facets/taxonomy";
import { slugify } from "./slug";
import type { CatalogGame, DetailEntity, GameDetails, IndexEntry } from "./types";

const CATALOG_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "catalog.json",
);
const DETAILS_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "game-details.json",
);
const SERIES_INDEX_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "index",
  "series.json",
);
const ADMIN_SERIES_OVERLAY_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "admin",
  "series-overlay.json",
);
const ADMIN_SERIES_OVERLAY_PATH = "region-atlas/admin/series-overlay.json";
export const DEFAULT_SERIES_BACKGROUND_OPACITY = 68;
export const DEFAULT_SERIES_BACKGROUND_READABILITY = "normal";
export type SeriesBackgroundReadability = "soft" | "normal" | "strong";

type AdminSeriesOverlayEntry = {
  slug: string;
  name: string;
  description?: string;
  backgroundImageUrl?: string;
  backgroundImageOpacity?: number;
  backgroundReadability?: SeriesBackgroundReadability;
  gameIds?: string[];
  additions?: string[];
  removals?: string[];
};

export type AdminSeriesAssignment = {
  genres?: DetailEntity[];
  tags: DetailEntity[];
  facets: DetailEntity[];
  hiddenGenres?: DetailEntity[];
  hiddenTags?: DetailEntity[];
  hiddenFacets?: DetailEntity[];
  updatedAt: string;
};

type AdminSeriesOverlay = {
  updatedAt: string;
  series: Record<string, AdminSeriesOverlayEntry>;
  assignments: Record<string, AdminSeriesAssignment>;
};

export type AdminSeriesRow = {
  slug: string;
  name: string;
  gameCount: number;
  description?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number | null;
  backgroundReadability?: SeriesBackgroundReadability | null;
};

export type AdminSeriesGameRow = {
  id: string;
  slug: string;
  title: string;
  platformSlug: string;
  region: string;
  year: number | null;
  coverUrl: string | null;
  genres: DetailEntity[];
  subgenres: DetailEntity[];
  tags: DetailEntity[];
  facets: DetailEntity[];
};

export type AdminSeriesGenreOption = {
  slug: string;
  name: string;
  count: number;
};

export type AdminSeriesPlatformOption = {
  slug: string;
  name: string;
  count: number;
};

export type AdminBulkGameActionOptions = {
  platforms: AdminSeriesPlatformOption[];
  regions: { slug: string; name: string; count: number }[];
  genres: { slug: string; name: string; count: number }[];
  tags: { slug: string; name: string; count: number | null }[];
  subgenres: { slug: string; name: string; count: number | null; family?: string; parentGenreSlugs?: string[] }[];
  facets: { slug: string; name: string; count: number | null; family?: string }[];
};

export type AdminSeriesDetail = {
  series: AdminSeriesRow;
  games: AdminSeriesGameRow[];
  genreOptions: AdminSeriesGenreOption[];
};

export type AdminSeriesLabelOperation = "add" | "remove" | "replace";

export type PublicSeriesReference = {
  slug: string;
  name: string;
  gameCount: number;
  matchedGameCount: number;
  matchedGameIds: string[];
};

type PublicSeriesCache = {
  entries: IndexEntry[];
  bySlug: Map<string, IndexEntry>;
  byGameId: Map<string, PublicSeriesReference[]>;
};

let publicSeriesCachePromise: Promise<PublicSeriesCache> | null = null;

function emptyOverlay(): AdminSeriesOverlay {
  return { updatedAt: new Date().toISOString(), series: {}, assignments: {} };
}

function shouldUseBlobOverlay(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function parseOverlay(raw: string): AdminSeriesOverlay {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSeriesOverlay>;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      series: parsed.series ?? {},
      assignments: parsed.assignments ?? {},
    };
  } catch {
    return emptyOverlay();
  }
}

async function readAdminSeriesOverlay(): Promise<AdminSeriesOverlay> {
  if (shouldUseBlobOverlay()) {
    try {
      const auth = await blobAuthOptions("private");
      const result = await get(ADMIN_SERIES_OVERLAY_PATH, { ...auth, useCache: false });
      if (!result?.stream || result.statusCode !== 200) return emptyOverlay();
      return parseOverlay(await new Response(result.stream).text());
    } catch {
      return emptyOverlay();
    }
  }
  return parseOverlay(JSON.stringify(loadJson<AdminSeriesOverlay>(ADMIN_SERIES_OVERLAY_FILE, emptyOverlay())));
}


export async function readAdminSeriesAssignmentsForPublic(): Promise<Record<string, AdminSeriesAssignment>> {
  const overlay = await readAdminSeriesOverlay();
  return overlay.assignments;
}

export async function listPublicSeriesIndexEntries(): Promise<IndexEntry[]> {
  return [...(await getPublicSeriesCache()).entries];
}

export async function getPublicSeriesIndexEntry(slug: string): Promise<IndexEntry | null> {
  const normalizedSlug = normalizeSlug(slug);
  return (await getPublicSeriesCache()).bySlug.get(normalizedSlug) ?? null;
}

export async function listPublicSeriesForGame(gameId: string): Promise<PublicSeriesReference[]> {
  const normalizedGameId = gameId.trim();
  if (!normalizedGameId) return [];

  return [...((await getPublicSeriesCache()).byGameId.get(normalizedGameId) ?? [])];
}

export async function listPublicSeriesForGames(gameIds: string[]): Promise<PublicSeriesReference[]> {
  const selectedGameIds = new Set(gameIds.map((id) => id.trim()).filter(Boolean));
  if (selectedGameIds.size === 0) return [];

  const entries = (await getPublicSeriesCache()).entries;
  return entries
    .map((entry) => {
      const matchedGameIds = entry.gameIds.filter((id) => selectedGameIds.has(id));
      return {
        slug: entry.slug,
        name: entry.name,
        gameCount: entry.gameCount,
        matchedGameCount: matchedGameIds.length,
        matchedGameIds,
      };
    })
    .filter((entry) => entry.matchedGameCount > 0)
    .sort(
      (a, b) =>
        b.matchedGameCount - a.matchedGameCount ||
        a.name.localeCompare(b.name, "es", { numeric: true }),
    );
}

async function getPublicSeriesCache(): Promise<PublicSeriesCache> {
  publicSeriesCachePromise ??= buildPublicSeriesCache();
  return publicSeriesCachePromise;
}

async function buildPublicSeriesCache(): Promise<PublicSeriesCache> {
  const index = loadSeriesIndex();
  const catalog = loadCatalog();
  const map = catalogMap(catalog);
  const overlay = await readAdminSeriesOverlay();
  const slugs = uniqueStrings([...Object.keys(index), ...Object.keys(overlay.series)]);

  const entries = slugs
    .map((slug) => effectiveSeriesEntry(slug, index, overlay))
    .filter((entry): entry is IndexEntry => Boolean(entry))
    .map((entry) => recalculateEntryWithCatalogMap(entry, map))
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es", { numeric: true }));

  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const byGameId = new Map<string, PublicSeriesReference[]>();

  for (const entry of entries) {
    for (const gameId of entry.gameIds) {
      const references = byGameId.get(gameId) ?? [];
      references.push({
        slug: entry.slug,
        name: entry.name,
        gameCount: entry.gameCount,
        matchedGameCount: 1,
        matchedGameIds: [gameId],
      });
      byGameId.set(gameId, references);
    }
  }

  for (const references of byGameId.values()) {
    references.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  }

  return { entries, bySlug, byGameId };
}

function invalidatePublicSeriesCache() {
  publicSeriesCachePromise = null;
}

async function writeAdminSeriesOverlay(overlay: AdminSeriesOverlay): Promise<void> {
  const payload = { ...overlay, updatedAt: new Date().toISOString() };
  if (shouldUseBlobOverlay()) {
    const auth = await blobAuthOptions("private");
    await put(ADMIN_SERIES_OVERLAY_PATH, JSON.stringify(payload, null, 2), {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    invalidatePublicSeriesCache();
    return;
  }
  saveJson(ADMIN_SERIES_OVERLAY_FILE, payload);
  invalidatePublicSeriesCache();
}

function loadCatalog(): CatalogGame[] {
  return loadJson<CatalogGame[]>(CATALOG_FILE, bundledCatalog).filter(
    (game) => game.listingStatus !== "excluded",
  );
}

function loadDetails(): Record<string, GameDetails> {
  return loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});
}

function loadSeriesIndex(): Record<string, IndexEntry> {
  return loadJson<Record<string, IndexEntry>>(
    SERIES_INDEX_FILE,
    seriesIndexData as Record<string, IndexEntry>,
  );
}

function saveSeriesIndex(index: Record<string, IndexEntry>) {
  saveJson(SERIES_INDEX_FILE, index);
  invalidatePublicSeriesCache();
}

function normalizeSlug(raw: string): string {
  return slugify(raw.trim());
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function normalizeBackgroundOpacity(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(1, Math.round(value)));
}

function normalizeBackgroundReadability(value: unknown): SeriesBackgroundReadability | null {
  if (value === "soft" || value === "normal" || value === "strong") return value;
  return null;
}

function normalizeLooseSearch(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeDescriptionForComparison(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dedupeSeriesDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const paragraphs = trimmed.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const dedupedParagraphs: string[] = [];
  for (const paragraph of paragraphs) {
    if (normalizeDescriptionForComparison(paragraph) === normalizeDescriptionForComparison(dedupedParagraphs.at(-1) ?? "")) {
      continue;
    }
    dedupedParagraphs.push(paragraph);
  }

  if (dedupedParagraphs.length > 1 && dedupedParagraphs.length % 2 === 0) {
    const midpoint = dedupedParagraphs.length / 2;
    const firstHalf = dedupedParagraphs.slice(0, midpoint).join("\n\n");
    const secondHalf = dedupedParagraphs.slice(midpoint).join("\n\n");
    if (normalizeDescriptionForComparison(firstHalf) === normalizeDescriptionForComparison(secondHalf)) {
      return firstHalf;
    }
  }

  return dedupedParagraphs.join("\n\n");
}

function entityFromName(name: string): DetailEntity | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const canonical = findGameFacetEntityByNameOrAlias(trimmed);
  if (canonical) return { name: canonical.name, slug: canonical.slug, source: "merged" };
  return { name: trimmed, slug: normalizeSlug(trimmed), source: "merged" };
}

function canonicalizeEntities(entities: DetailEntity[]): DetailEntity[] {
  return mergeEntities([], entities.map((entity) => entity.name || entity.slug));
}

function mergeEntities(existing: DetailEntity[], incomingNames: string[]): DetailEntity[] {
  const bySlug = new Map(existing.map((entity) => [entity.slug, entity]));
  for (const name of incomingNames) {
    const entity = entityFromName(name);
    if (!entity) continue;
    bySlug.set(entity.slug, bySlug.get(entity.slug) ?? entity);
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

function removeHiddenEntities(existing: DetailEntity[], hidden: DetailEntity[] | undefined): DetailEntity[] {
  const hiddenSlugs = new Set((hidden ?? []).map((entity) => entity.slug));
  if (hiddenSlugs.size === 0) return existing;
  return existing.filter((entity) => !hiddenSlugs.has(entity.slug));
}

function hiddenFromBase(base: DetailEntity[], selectedNames: string[]): DetailEntity[] {
  const selectedSlugs = new Set(selectedNames.map((name) => normalizeSlug(name)));
  return base.filter((entity) => !selectedSlugs.has(entity.slug));
}

function effectiveGenres(detail: GameDetails | undefined, assignment: AdminSeriesAssignment | undefined): DetailEntity[] {
  return mergeEntities(
    removeHiddenEntities(canonicalizeEntities(detail?.genres ?? []), assignment?.hiddenGenres),
    assignment?.genres?.map((genre) => genre.name) ?? [],
  );
}

function effectiveTags(detail: GameDetails | undefined, assignment: AdminSeriesAssignment | undefined): DetailEntity[] {
  return mergeEntities(
    removeHiddenEntities(detail?.tags ?? [], assignment?.hiddenTags),
    assignment?.tags?.map((tag) => tag.name) ?? [],
  );
}

function baseFacetEntities(detail: GameDetails | undefined): DetailEntity[] {
  return canonicalizeEntities([...(detail?.subgenres ?? []), ...(detail?.facets ?? [])]);
}

function effectiveFacets(detail: GameDetails | undefined, assignment: AdminSeriesAssignment | undefined): DetailEntity[] {
  return mergeEntities(
    removeHiddenEntities(baseFacetEntities(detail), assignment?.hiddenFacets),
    assignment?.facets?.map((facet) => facet.name) ?? [],
  );
}

function countDetailEntities(games: CatalogGame[], details: Record<string, GameDetails>, field: "tags"): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, { slug: string; name: string; count: number }>();
  for (const game of games) {
    const seen = new Set<string>();
    for (const entity of details[game.id]?.[field] ?? []) {
      if (!entity.slug || seen.has(entity.slug)) continue;
      seen.add(entity.slug);
      const current = counts.get(entity.slug) ?? { slug: entity.slug, name: entity.name, count: 0 };
      current.count += 1;
      counts.set(entity.slug, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es", { numeric: true }));
}

function catalogMap(catalog: CatalogGame[]): Map<string, CatalogGame> {
  return new Map(catalog.map((game) => [game.id, game]));
}

function effectiveSeriesEntry(
  slug: string,
  index: Record<string, IndexEntry>,
  overlay: AdminSeriesOverlay,
): IndexEntry | null {
  const staticEntry = index[slug];
  const overlayEntry = overlay.series[slug];
  if (!staticEntry && !overlayEntry) return null;

  // An overlay can outlive a deployment where the bundled index was missing.
  // Preserve the canonical index membership and layer admin changes on top.
  const baseGameIds = staticEntry?.gameIds ?? overlayEntry?.gameIds ?? [];
  const removals = new Set(overlayEntry?.removals ?? []);
  const gameIds = filterEffectiveSeriesCatalogIds(
    slug,
    uniqueStrings([...baseGameIds, ...(overlayEntry?.additions ?? [])]).filter(
      (id) => !removals.has(id),
    ),
  );

  return {
    name: overlayEntry?.name ?? staticEntry?.name ?? slug,
    slug,
    museumPath: staticEntry?.museumPath ?? `/saga/${slug}`,
    gameIds,
    byPlatform: staticEntry?.byPlatform ?? {},
    gameCount: gameIds.length,
    description: dedupeSeriesDescription(overlayEntry?.description ?? staticEntry?.description),
    backgroundImageUrl: normalizeOptionalUrl(overlayEntry?.backgroundImageUrl ?? staticEntry?.backgroundImageUrl),
    backgroundImageOpacity: normalizeBackgroundOpacity(
      overlayEntry?.backgroundImageOpacity ?? staticEntry?.backgroundImageOpacity,
    ),
    backgroundReadability: normalizeBackgroundReadability(
      overlayEntry?.backgroundReadability ?? staticEntry?.backgroundReadability,
    ),
    active: staticEntry?.active,
  };
}

function recalculateEntry(entry: IndexEntry, catalog: CatalogGame[]): IndexEntry {
  return recalculateEntryWithCatalogMap(entry, catalogMap(catalog));
}

function recalculateEntryWithCatalogMap(entry: IndexEntry, map: Map<string, CatalogGame>): IndexEntry {
  const gameIds = entry.gameIds.filter((id) => map.has(id));
  const byPlatform: Record<string, number> = {};
  for (const id of gameIds) {
    const game = map.get(id);
    if (!game) continue;
    byPlatform[game.platformSlug] = (byPlatform[game.platformSlug] ?? 0) + 1;
  }
  return {
    ...entry,
    gameIds,
    byPlatform: Object.fromEntries(Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b))),
    gameCount: gameIds.length,
  };
}

function toSeriesRow(entry: IndexEntry, catalog: CatalogGame[]): AdminSeriesRow {
  const resolved = recalculateEntry(entry, catalog);
  return {
    slug: resolved.slug,
    name: resolved.name,
    gameCount: resolved.gameCount,
    description: resolved.description ?? null,
    backgroundImageUrl: resolved.backgroundImageUrl ?? null,
    backgroundImageOpacity: resolved.backgroundImageOpacity ?? null,
    backgroundReadability: resolved.backgroundReadability ?? null,
  };
}

function toGameRow(
  game: CatalogGame,
  details: Record<string, GameDetails>,
  assignments: Record<string, AdminSeriesAssignment>,
): AdminSeriesGameRow {
  const detail = details[game.id];
  const assignment = assignments[game.id];
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    year: detail?.year ?? null,
    coverUrl: game.coverUrl,
    genres: effectiveGenres(detail, assignment),
    subgenres: canonicalizeEntities(detail?.subgenres ?? []),
    tags: effectiveTags(detail, assignment),
    facets: effectiveFacets(detail, assignment),
  };
}

function genreOptionsForGames(games: AdminSeriesGameRow[]): AdminSeriesGenreOption[] {
  const map = new Map<string, AdminSeriesGenreOption>();
  for (const game of games) {
    for (const genre of game.genres) {
      const current = map.get(genre.slug);
      map.set(genre.slug, {
        slug: genre.slug,
        name: genre.name,
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

function genreOptionsForCatalog(
  catalog: CatalogGame[],
  details: Record<string, GameDetails>,
): AdminSeriesGenreOption[] {
  return genreOptionsForGames(catalog.map((game) => toGameRow(game, details, {})));
}

function regionOptionsForCatalog(catalog: CatalogGame[]): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const game of catalog) counts.set(game.region, (counts.get(game.region) ?? 0) + 1);
  return [...counts.entries()]
    .map(([region, count]) => ({ slug: region, name: region, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

function platformDisplayName(slug: string): string {
  const names: Record<string, string> = {
    "3ds": "Nintendo 3DS",
    ds: "Nintendo DS",
    gameboy: "Game Boy",
    gamecube: "GameCube",
    gamegear: "Game Gear",
    gba: "Game Boy Advance",
    n64: "Nintendo 64",
    neogeo: "Neo Geo AES",
    neogeocd: "Neo Geo CD",
    nes: "NES",
    ps1: "PlayStation",
    ps2: "PlayStation 2",
    ps3: "PlayStation 3",
    ps4: "PlayStation 4",
    ps5: "PlayStation 5",
    snes: "Super Nintendo",
    switch: "Nintendo Switch",
    switch2: "Nintendo Switch 2",
    wiiu: "Wii U",
    xbox: "Xbox",
    xbox360: "Xbox 360",
    xboxone: "Xbox One",
    xboxseries: "Xbox Series",
  };
  return names[slug] ?? slug.toUpperCase();
}

export async function listAdminSeries(input?: { q?: string; limit?: number }): Promise<AdminSeriesRow[]> {
  const index = loadSeriesIndex();
  const catalog = loadCatalog();
  const overlay = await readAdminSeriesOverlay();
  const q = input?.q?.trim().toLowerCase() ?? "";
  const limit = Math.min(500, Math.max(20, input?.limit ?? 150));
  const slugs = uniqueStrings([...Object.keys(index), ...Object.keys(overlay.series)]);

  return slugs
    .map((slug) => effectiveSeriesEntry(slug, index, overlay))
    .filter((entry): entry is IndexEntry => Boolean(entry))
    .map((entry) => toSeriesRow(entry, catalog))
    .filter((entry) => !q || entry.name.toLowerCase().includes(q) || entry.slug.includes(q))
    .sort((a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es", { numeric: true }))
    .slice(0, limit);
}

export function listAdminSeriesGamePlatforms(): AdminSeriesPlatformOption[] {
  const counts = new Map<string, number>();
  for (const game of loadCatalog()) {
    counts.set(game.platformSlug, (counts.get(game.platformSlug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, name: platformDisplayName(slug), count }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

export function getAdminBulkGameActionOptions(): AdminBulkGameActionOptions {
  const catalog = loadCatalog();
  const details = loadDetails();
  const taxonomy = getGameFacetsTaxonomy();
  const taxonomyGenreSlugById = new Map(taxonomy.genres.map((entity) => [entity.id, entity.slug]));
  const catalogGenreCounts = new Map(genreOptionsForCatalog(catalog, details).map((genre) => [genre.slug, genre.count]));

  return {
    platforms: listAdminSeriesGamePlatforms(),
    regions: regionOptionsForCatalog(catalog),
    genres: taxonomy.genres
      .filter((entity) => entity.status === "approved")
      .map((entity) => ({
        slug: entity.slug,
        name: entity.name,
        count: catalogGenreCounts.get(entity.slug) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    tags: countDetailEntities(catalog, details, "tags").slice(0, 250),
    subgenres: taxonomy.subgenres
      .filter((entity) => entity.status === "approved")
      .map((entity) => ({
        slug: entity.slug,
        name: entity.name,
        count: null,
        family: "subgenre",
        parentGenreSlugs: entity.parentGenreIds
          .map((id) => taxonomyGenreSlugById.get(id))
          .filter((slug): slug is string => Boolean(slug)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    facets: taxonomy.facets
      .filter((entity) => entity.status === "approved")
      .map((entity) => ({ slug: entity.slug, name: entity.name, count: null, family: entity.family }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
  };
}

export async function getAdminSeries(slug: string): Promise<AdminSeriesDetail | { error: string }> {
  const normalizedSlug = normalizeSlug(slug);
  const index = loadSeriesIndex();
  const catalog = loadCatalog();
  const details = loadDetails();
  const overlay = await readAdminSeriesOverlay();
  const entry = effectiveSeriesEntry(normalizedSlug, index, overlay);
  if (!entry) return { error: "Saga no encontrada." };

  const map = catalogMap(catalog);
  const games = recalculateEntry(entry, catalog)
    .gameIds.map((id) => map.get(id))
    .filter((game): game is CatalogGame => Boolean(game))
    .map((game) => toGameRow(game, details, overlay.assignments))
    .sort((a, b) => a.title.localeCompare(b.title, "es", { numeric: true }));

  return {
    series: toSeriesRow(entry, catalog),
    games,
    genreOptions: genreOptionsForGames(games),
  };
}

export async function updateAdminSeriesDescription(
  slug: string,
  description: string | null,
): Promise<{ series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(slug);
  const index = loadSeriesIndex();
  const overlay = await readAdminSeriesOverlay();
  const current = effectiveSeriesEntry(normalizedSlug, index, overlay);
  if (!current) return { error: "Saga no encontrada." };

  const existing = overlay.series[normalizedSlug] ?? {
    slug: normalizedSlug,
    name: current.name,
    gameIds: current.gameIds,
  };
  overlay.series[normalizedSlug] = {
    ...existing,
    slug: normalizedSlug,
    name: existing.name || current.name,
    description: dedupeSeriesDescription(description) ?? undefined,
  };
  await writeAdminSeriesOverlay(overlay);
  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;
  return { series };
}

export async function updateAdminSeriesBackground(
  slug: string,
  backgroundImageUrl: string | null,
  backgroundImageOpacity?: number | null,
  backgroundReadability?: SeriesBackgroundReadability | null,
): Promise<{ series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(slug);
  const index = loadSeriesIndex();
  const overlay = await readAdminSeriesOverlay();
  const current = effectiveSeriesEntry(normalizedSlug, index, overlay);
  if (!current) return { error: "Saga no encontrada." };

  const normalizedUrl = normalizeOptionalUrl(backgroundImageUrl);
  if (backgroundImageUrl?.trim() && !normalizedUrl) {
    return { error: "URL de fondo inválida." };
  }
  const normalizedOpacity = normalizeBackgroundOpacity(backgroundImageOpacity);
  if (backgroundImageOpacity !== undefined && backgroundImageOpacity !== null && !normalizedOpacity) {
    return { error: "Porcentaje de fondo inválido." };
  }
  const normalizedReadability = normalizeBackgroundReadability(backgroundReadability);
  if (backgroundReadability !== undefined && backgroundReadability !== null && !normalizedReadability) {
    return { error: "Modo de legibilidad inválido." };
  }

  const existing = overlay.series[normalizedSlug] ?? {
    slug: normalizedSlug,
    name: current.name,
    gameIds: current.gameIds,
  };
  const nextOpacity =
    normalizedOpacity ??
    existing.backgroundImageOpacity ??
    current.backgroundImageOpacity ??
    DEFAULT_SERIES_BACKGROUND_OPACITY;
  const nextReadability =
    normalizedReadability ??
    existing.backgroundReadability ??
    current.backgroundReadability ??
    DEFAULT_SERIES_BACKGROUND_READABILITY;

  overlay.series[normalizedSlug] = {
    ...existing,
    slug: normalizedSlug,
    name: existing.name || current.name,
    backgroundImageUrl: normalizedUrl ?? undefined,
    backgroundImageOpacity: nextOpacity,
    backgroundReadability: nextReadability,
  };
  await writeAdminSeriesOverlay(overlay);
  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;
  return { series };
}

export async function searchAdminSeriesGames(input: {
  q?: string;
  limit?: number;
  excludeSeriesSlug?: string;
  platformSlug?: string;
}): Promise<AdminSeriesGameRow[]> {
  const q = input.q?.trim().toLowerCase() ?? "";
  if (q.length < 2) return [];
  const limit = Math.min(80, Math.max(5, input.limit ?? 30));
  const platformSlug = input.platformSlug?.trim().toLowerCase() ?? "";
  const catalog = loadCatalog();
  const details = loadDetails();
  const overlay = await readAdminSeriesOverlay();
  const index = loadSeriesIndex();
  const excluded = input.excludeSeriesSlug
    ? new Set(effectiveSeriesEntry(normalizeSlug(input.excludeSeriesSlug), index, overlay)?.gameIds ?? [])
    : new Set<string>();

  return catalog
    .filter((game) => !excluded.has(game.id))
    .filter((game) => !platformSlug || game.platformSlug === platformSlug)
    .filter((game) => {
      const detail = details[game.id];
      const haystack = [
        game.title,
        game.slug,
        game.id,
        game.platformSlug,
        game.region,
        detail?.reference,
        detail?.developer?.name,
        detail?.publisher?.name,
        ...(detail?.genres?.map((genre) => genre.name) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, limit)
    .map((game) => toGameRow(game, details, overlay.assignments));
}

export async function searchAdminBulkActionGames(input: {
  q?: string;
  limit?: number;
  platformSlug?: string;
  region?: string;
  genreSlug?: string;
  facetSlug?: string;
}): Promise<AdminSeriesGameRow[]> {
  const q = normalizeLooseSearch(input.q ?? "");
  const platformSlug = input.platformSlug?.trim().toLowerCase() ?? "";
  const region = input.region?.trim() ?? "";
  const genreSlug = input.genreSlug?.trim() ?? "";
  const facetSlug = input.facetSlug?.trim() ?? "";
  const hasSearchCriteria = q.length >= 2 || platformSlug || region || genreSlug || facetSlug;
  if (!hasSearchCriteria) return [];

  const limit = Math.min(200, Math.max(10, input.limit ?? 80));
  const catalog = loadCatalog();
  const details = loadDetails();
  const overlay = await readAdminSeriesOverlay();
  const rows: AdminSeriesGameRow[] = [];

  for (const game of catalog) {
    if (rows.length >= limit) break;
    if (platformSlug && game.platformSlug !== platformSlug) continue;
    if (region && game.region !== region) continue;

    const detail = details[game.id];
    const assignment = overlay.assignments[game.id];
    let genres: DetailEntity[] | null = null;
    let tags: DetailEntity[] | null = null;
    let facets: DetailEntity[] | null = null;

    if (genreSlug) {
      genres = effectiveGenres(detail, assignment);
      if (!genres.some((genre) => genre.slug === genreSlug)) continue;
    }

    if (facetSlug) {
      genres = genres ?? effectiveGenres(detail, assignment);
      tags = effectiveTags(detail, assignment);
      facets = effectiveFacets(detail, assignment);
      const labels = [...genres, ...tags, ...facets];
      if (!labels.some((entity) => entity.slug === facetSlug)) continue;
    }

    if (q.length >= 2) {
      const textHaystack = normalizeLooseSearch(
        [
          game.title,
          game.titlePc,
          game.slug,
          game.id,
          detail?.reference,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!textHaystack.includes(q)) continue;
    }

    rows.push(toGameRow(game, details, overlay.assignments));
  }

  return rows;
}

export async function createAdminSeries(input: {
  name: string;
  slug?: string;
  description?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number | null;
  backgroundReadability?: SeriesBackgroundReadability | null;
}): Promise<{ ok: true; series: AdminSeriesRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la saga." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  const normalizedUrl = normalizeOptionalUrl(input.backgroundImageUrl);
  if (input.backgroundImageUrl?.trim() && !normalizedUrl) {
    return { error: "URL de fondo inválida." };
  }
  const normalizedOpacity = normalizeBackgroundOpacity(input.backgroundImageOpacity);
  if (input.backgroundImageOpacity !== undefined && input.backgroundImageOpacity !== null && !normalizedOpacity) {
    return { error: "Porcentaje de fondo inválido." };
  }
  const normalizedReadability = normalizeBackgroundReadability(input.backgroundReadability);
  if (input.backgroundReadability !== undefined && input.backgroundReadability !== null && !normalizedReadability) {
    return { error: "Modo de legibilidad inválido." };
  }
  const description = dedupeSeriesDescription(input.description) ?? undefined;
  const backgroundImageOpacity = normalizedOpacity ?? DEFAULT_SERIES_BACKGROUND_OPACITY;
  const backgroundReadability = normalizedReadability ?? DEFAULT_SERIES_BACKGROUND_READABILITY;
  const index = loadSeriesIndex();
  const catalog = loadCatalog();
  const overlay = await readAdminSeriesOverlay();
  if (index[slug] || overlay.series[slug]) return { error: `Ya existe la saga «${slug}».` };

  if (canWriteCatalogFiles()) {
    const entry: IndexEntry = {
      name,
      slug,
      museumPath: `/saga/${slug}`,
      gameIds: [],
      byPlatform: {},
      gameCount: 0,
      description,
      backgroundImageUrl: normalizedUrl ?? undefined,
      backgroundImageOpacity,
      backgroundReadability,
    };
    index[slug] = entry;
    saveSeriesIndex(index);
    return { ok: true, series: toSeriesRow(entry, catalog) };
  }

  overlay.series[slug] = {
    slug,
    name,
    description,
    backgroundImageUrl: normalizedUrl ?? undefined,
    backgroundImageOpacity,
    backgroundReadability,
    gameIds: [],
  };
  await writeAdminSeriesOverlay(overlay);
  return {
    ok: true,
    series: {
      slug,
      name,
      gameCount: 0,
      description: description ?? null,
      backgroundImageUrl: normalizedUrl ?? null,
      backgroundImageOpacity,
      backgroundReadability,
    },
  };
}

export async function addGamesToAdminSeries(
  slug: string,
  gameIds: string[],
): Promise<{ ok: true; addedCount: number; series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(slug);
  const requestedGameIds = uniqueStrings(gameIds);
  if (requestedGameIds.length === 0) return { error: "No hay juegos para añadir." };

  const catalog = loadCatalog();
  const map = catalogMap(catalog);
  const validGameIds = requestedGameIds.filter((id) => map.has(id));
  if (validGameIds.length === 0) return { error: "No se encontró ningún juego válido en catálogo." };

  const index = loadSeriesIndex();
  const overlay = await readAdminSeriesOverlay();
  const entry = effectiveSeriesEntry(normalizedSlug, index, overlay);
  if (!entry) return { error: "Saga no encontrada." };

  const existing = new Set(entry.gameIds ?? []);
  const idsToAdd = validGameIds.filter((id) => !existing.has(id));

  if (idsToAdd.length > 0) {
    if (canWriteCatalogFiles() && index[normalizedSlug]) {
      const current = index[normalizedSlug];
      current.gameIds = uniqueStrings([...(current.gameIds ?? []), ...idsToAdd]);
      index[normalizedSlug] = recalculateEntry(current, catalog);
      saveSeriesIndex(index);
    } else {
      const overlayEntry = overlay.series[normalizedSlug] ?? {
        slug: normalizedSlug,
        name: entry.name,
        additions: [],
        removals: [],
      };
      overlayEntry.additions = uniqueStrings([...(overlayEntry.additions ?? []), ...idsToAdd]);
      const added = new Set(idsToAdd);
      overlayEntry.removals = (overlayEntry.removals ?? []).filter((id) => !added.has(id));
      overlay.series[normalizedSlug] = overlayEntry;
      await writeAdminSeriesOverlay(overlay);
    }
  }

  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;
  return { ok: true, addedCount: idsToAdd.length, series };
}

export async function addGameToAdminSeries(
  slug: string,
  gameId: string,
): Promise<{ ok: true; series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(slug);
  const trimmedGameId = gameId.trim();
  const catalog = loadCatalog();
  if (!catalogMap(catalog).has(trimmedGameId)) return { error: "Juego no encontrado en catálogo." };
  const index = loadSeriesIndex();
  const overlay = await readAdminSeriesOverlay();
  const entry = effectiveSeriesEntry(normalizedSlug, index, overlay);
  if (!entry) return { error: "Saga no encontrada." };

  if (canWriteCatalogFiles() && index[normalizedSlug]) {
    const current = index[normalizedSlug];
    current.gameIds = uniqueStrings([...(current.gameIds ?? []), trimmedGameId]);
    index[normalizedSlug] = recalculateEntry(current, catalog);
    saveSeriesIndex(index);
  } else {
    const overlayEntry = overlay.series[normalizedSlug] ?? {
      slug: normalizedSlug,
      name: entry.name,
      additions: [],
      removals: [],
    };
    overlayEntry.additions = uniqueStrings([...(overlayEntry.additions ?? []), trimmedGameId]);
    overlayEntry.removals = (overlayEntry.removals ?? []).filter((id) => id !== trimmedGameId);
    overlay.series[normalizedSlug] = overlayEntry;
    await writeAdminSeriesOverlay(overlay);
  }

  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;
  return { ok: true, series };
}

export async function bulkAssignAdminGames(input: {
  gameIds: string[];
  genres?: string[];
  tags?: string[];
  facets?: string[];
  replaceLabels?: boolean;
}): Promise<{ ok: true; affectedCount: number } | { error: string }> {
  const gameIds = uniqueStrings(input.gameIds);
  const genres = uniqueStrings(input.genres ?? []);
  const tags = uniqueStrings(input.tags ?? []);
  const facets = uniqueStrings(input.facets ?? []);
  if (gameIds.length === 0) return { error: "Selecciona al menos un juego." };
  if (!input.replaceLabels && genres.length === 0 && tags.length === 0 && facets.length === 0) {
    return { error: "Añade al menos un género, subgénero o faceta." };
  }

  const catalogIds = new Set(loadCatalog().map((game) => game.id));
  const details = loadDetails();
  const targetGameIds = gameIds.filter((gameId) => catalogIds.has(gameId));
  if (targetGameIds.length === 0) return { error: "No hay juegos válidos para modificar." };

  const overlay = await readAdminSeriesOverlay();
  const now = new Date().toISOString();
  for (const gameId of targetGameIds) {
    const current = overlay.assignments[gameId] ?? { tags: [], facets: [], updatedAt: now };
    if (input.replaceLabels) {
      const detail = details[gameId];
      overlay.assignments[gameId] = {
        genres: mergeEntities([], genres),
        tags: mergeEntities([], tags),
        facets: mergeEntities([], facets),
        hiddenGenres: hiddenFromBase(canonicalizeEntities(detail?.genres ?? []), genres),
        hiddenTags: hiddenFromBase(detail?.tags ?? [], tags),
        hiddenFacets: hiddenFromBase(baseFacetEntities(detail), facets),
        updatedAt: now,
      };
    } else {
      overlay.assignments[gameId] = {
        ...current,
        genres: mergeEntities(current.genres ?? [], genres),
        tags: mergeEntities(current.tags, tags),
        facets: mergeEntities(current.facets, facets),
        updatedAt: now,
      };
    }
  }
  await writeAdminSeriesOverlay(overlay);

  return { ok: true, affectedCount: targetGameIds.length };
}

export async function removeGameFromAdminSeries(
  slug: string,
  gameId: string,
): Promise<{ ok: true; series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(slug);
  const trimmedGameId = gameId.trim();
  const catalog = loadCatalog();
  const index = loadSeriesIndex();
  const overlay = await readAdminSeriesOverlay();
  const entry = effectiveSeriesEntry(normalizedSlug, index, overlay);
  if (!entry) return { error: "Saga no encontrada." };

  if (canWriteCatalogFiles() && index[normalizedSlug]) {
    const current = index[normalizedSlug];
    current.gameIds = (current.gameIds ?? []).filter((id) => id !== trimmedGameId);
    index[normalizedSlug] = recalculateEntry(current, catalog);
    saveSeriesIndex(index);
  } else {
    const overlayEntry = overlay.series[normalizedSlug] ?? {
      slug: normalizedSlug,
      name: entry.name,
      additions: [],
      removals: [],
    };
    overlayEntry.additions = (overlayEntry.additions ?? []).filter((id) => id !== trimmedGameId);
    overlayEntry.removals = uniqueStrings([...(overlayEntry.removals ?? []), trimmedGameId]);
    overlay.series[normalizedSlug] = overlayEntry;
    await writeAdminSeriesOverlay(overlay);
  }

  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;
  return { ok: true, series };
}

function removeEntitiesByName(existing: DetailEntity[] | undefined, names: string[]): DetailEntity[] {
  const removeSlugs = new Set(names.map((name) => normalizeSlug(name)));
  return (existing ?? []).filter((entity) => !removeSlugs.has(entity.slug));
}

function entitiesFromNames(names: string[]): DetailEntity[] {
  return mergeEntities([], names);
}

function mergeHiddenEntities(existing: DetailEntity[] | undefined, names: string[]): DetailEntity[] {
  return canonicalizeEntities([...(existing ?? []), ...entitiesFromNames(names)]);
}

export async function bulkAssignAdminSeriesFacets(input: {
  slug: string;
  genreSlug?: string | null;
  withoutGenre?: boolean;
  subgenreSlug?: string | null;
  facetSlug?: string | null;
  gameIds?: string[];
  operation?: AdminSeriesLabelOperation;
  genres?: string[];
  tags?: string[];
  facets?: string[];
}): Promise<{ ok: true; affectedCount: number; series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(input.slug);
  const operation = input.operation ?? "add";
  const genres = uniqueStrings(input.genres ?? []);
  const tags = uniqueStrings(input.tags ?? []);
  const facets = uniqueStrings(input.facets ?? []);
  if (genres.length === 0 && tags.length === 0 && facets.length === 0) {
    return { error: "Añade al menos un género, etiqueta o faceta." };
  }

  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;

  const genreSlug = input.genreSlug?.trim();
  const subgenreSlug = input.subgenreSlug?.trim();
  const facetSlug = input.facetSlug?.trim();
  const selectedGameIds = new Set(uniqueStrings(input.gameIds ?? []));
  const targetGames = series.games.filter(
    (game) => {
      if (selectedGameIds.size > 0 && !selectedGameIds.has(game.id)) return false;
      if (input.withoutGenre && game.genres.length > 0) return false;
      if (genreSlug && !game.genres.some((genre) => genre.slug === genreSlug)) return false;
      if (subgenreSlug && !game.facets.some((facet) => facet.slug === subgenreSlug)) return false;
      if (facetSlug && !game.facets.some((facet) => facet.slug === facetSlug)) return false;
      return true;
    },
  );
  if (targetGames.length === 0) return { error: "No hay juegos afectados con ese filtro." };

  const overlay = await readAdminSeriesOverlay();
  const details = loadDetails();
  const now = new Date().toISOString();
  for (const game of targetGames) {
    const current = overlay.assignments[game.id] ?? { tags: [], facets: [], updatedAt: now };
    const detail = details[game.id];
    if (operation === "replace") {
      overlay.assignments[game.id] = {
        genres: mergeEntities([], genres),
        tags: mergeEntities([], tags),
        facets: mergeEntities([], facets),
        hiddenGenres: hiddenFromBase(canonicalizeEntities(detail?.genres ?? []), genres),
        hiddenTags: hiddenFromBase(detail?.tags ?? [], tags),
        hiddenFacets: hiddenFromBase(baseFacetEntities(detail), facets),
        updatedAt: now,
      };
      continue;
    }
    if (operation === "remove") {
      overlay.assignments[game.id] = {
        ...current,
        genres: removeEntitiesByName(current.genres, genres),
        tags: removeEntitiesByName(current.tags, tags),
        facets: removeEntitiesByName(current.facets, facets),
        hiddenGenres: mergeHiddenEntities(current.hiddenGenres, genres),
        hiddenTags: mergeHiddenEntities(current.hiddenTags, tags),
        hiddenFacets: mergeHiddenEntities(current.hiddenFacets, facets),
        updatedAt: now,
      };
      continue;
    }
    overlay.assignments[game.id] = {
      ...current,
      genres: mergeEntities(current.genres ?? [], genres),
      tags: mergeEntities(current.tags, tags),
      facets: mergeEntities(current.facets, facets),
      updatedAt: now,
    };
  }
  await writeAdminSeriesOverlay(overlay);

  const updated = await getAdminSeries(normalizedSlug);
  if ("error" in updated) return updated;
  return { ok: true, affectedCount: targetGames.length, series: updated };
}
