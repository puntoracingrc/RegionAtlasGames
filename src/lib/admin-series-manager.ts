import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
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

type AdminSeriesOverlayEntry = {
  slug: string;
  name: string;
  description?: string;
  gameIds?: string[];
  additions?: string[];
  removals?: string[];
};

type AdminSeriesAssignment = {
  tags: DetailEntity[];
  facets: DetailEntity[];
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
  tags: DetailEntity[];
  facets: DetailEntity[];
};

export type AdminSeriesGenreOption = {
  slug: string;
  name: string;
  count: number;
};

export type AdminSeriesDetail = {
  series: AdminSeriesRow;
  games: AdminSeriesGameRow[];
  genreOptions: AdminSeriesGenreOption[];
};

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
    return;
  }
  saveJson(ADMIN_SERIES_OVERLAY_FILE, payload);
}

function loadCatalog(): CatalogGame[] {
  return loadJson<CatalogGame[]>(CATALOG_FILE, []).filter((game) => game.listingStatus !== "excluded");
}

function loadDetails(): Record<string, GameDetails> {
  return loadJson<Record<string, GameDetails>>(DETAILS_FILE, {});
}

function loadSeriesIndex(): Record<string, IndexEntry> {
  return loadJson<Record<string, IndexEntry>>(SERIES_INDEX_FILE, {});
}

function saveSeriesIndex(index: Record<string, IndexEntry>) {
  saveJson(SERIES_INDEX_FILE, index);
}

function normalizeSlug(raw: string): string {
  return slugify(raw.trim());
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function entityFromName(name: string): DetailEntity | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return { name: trimmed, slug: normalizeSlug(trimmed), source: "merged" };
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

  const baseGameIds = overlayEntry?.gameIds ?? staticEntry?.gameIds ?? [];
  const removals = new Set(overlayEntry?.removals ?? []);
  const gameIds = uniqueStrings([...baseGameIds, ...(overlayEntry?.additions ?? [])]).filter(
    (id) => !removals.has(id),
  );

  return {
    name: overlayEntry?.name ?? staticEntry?.name ?? slug,
    slug,
    museumPath: staticEntry?.museumPath ?? `/saga/${slug}`,
    gameIds,
    byPlatform: staticEntry?.byPlatform ?? {},
    gameCount: gameIds.length,
    active: staticEntry?.active,
  };
}

function recalculateEntry(entry: IndexEntry, catalog: CatalogGame[]): IndexEntry {
  const map = catalogMap(catalog);
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
  return { slug: resolved.slug, name: resolved.name, gameCount: resolved.gameCount };
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
    genres: detail?.genres ?? [],
    tags: mergeEntities(detail?.tags ?? [], assignment?.tags?.map((tag) => tag.name) ?? []),
    facets: assignment?.facets ?? [],
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

export async function searchAdminSeriesGames(input: {
  q?: string;
  limit?: number;
  excludeSeriesSlug?: string;
}): Promise<AdminSeriesGameRow[]> {
  const q = input.q?.trim().toLowerCase() ?? "";
  if (q.length < 2) return [];
  const limit = Math.min(80, Math.max(5, input.limit ?? 30));
  const catalog = loadCatalog();
  const details = loadDetails();
  const overlay = await readAdminSeriesOverlay();
  const index = loadSeriesIndex();
  const excluded = input.excludeSeriesSlug
    ? new Set(effectiveSeriesEntry(normalizeSlug(input.excludeSeriesSlug), index, overlay)?.gameIds ?? [])
    : new Set<string>();

  return catalog
    .filter((game) => !excluded.has(game.id))
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

export async function createAdminSeries(input: {
  name: string;
  slug?: string;
}): Promise<{ ok: true; series: AdminSeriesRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la saga." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
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
    };
    index[slug] = entry;
    saveSeriesIndex(index);
    return { ok: true, series: toSeriesRow(entry, catalog) };
  }

  overlay.series[slug] = { slug, name, gameIds: [] };
  await writeAdminSeriesOverlay(overlay);
  return { ok: true, series: { slug, name, gameCount: 0 } };
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

export async function bulkAssignAdminSeriesFacets(input: {
  slug: string;
  genreSlug?: string | null;
  tags?: string[];
  facets?: string[];
}): Promise<{ ok: true; affectedCount: number; series: AdminSeriesDetail } | { error: string }> {
  const normalizedSlug = normalizeSlug(input.slug);
  const tags = uniqueStrings(input.tags ?? []);
  const facets = uniqueStrings(input.facets ?? []);
  if (tags.length === 0 && facets.length === 0) {
    return { error: "Añade al menos una etiqueta o faceta." };
  }

  const series = await getAdminSeries(normalizedSlug);
  if ("error" in series) return series;

  const genreSlug = input.genreSlug?.trim();
  const targetGames = series.games.filter(
    (game) => !genreSlug || game.genres.some((genre) => genre.slug === genreSlug),
  );
  if (targetGames.length === 0) return { error: "No hay juegos afectados con ese filtro." };

  const overlay = await readAdminSeriesOverlay();
  const now = new Date().toISOString();
  for (const game of targetGames) {
    const current = overlay.assignments[game.id] ?? { tags: [], facets: [], updatedAt: now };
    overlay.assignments[game.id] = {
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
