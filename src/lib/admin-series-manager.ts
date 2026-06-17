import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { getGameFacetsTaxonomy } from "./game-facets/taxonomy";
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

export type AdminSeriesPlatformOption = {
  slug: string;
  name: string;
  count: number;
};

export type AdminBulkGameActionOptions = {
  platforms: AdminSeriesPlatformOption[];
  regions: { slug: string; name: string; count: number }[];
  genres: { slug: string; name: string; count: number }[];
  subgenres: { slug: string; name: string; count: number | null }[];
  facets: { slug: string; name: string; count: number | null }[];
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

  return {
    platforms: listAdminSeriesGamePlatforms(),
    regions: regionOptionsForCatalog(catalog),
    genres: genreOptionsForCatalog(catalog, details),
    subgenres: taxonomy.subgenres
      .filter((entity) => entity.status === "approved")
      .map((entity) => ({ slug: entity.slug, name: entity.name, count: null }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    facets: taxonomy.facets
      .filter((entity) => entity.status === "approved")
      .map((entity) => ({ slug: entity.slug, name: entity.name, count: null }))
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
  const q = input.q?.trim().toLowerCase() ?? "";
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

  return catalog
    .filter((game) => !platformSlug || game.platformSlug === platformSlug)
    .filter((game) => !region || game.region === region)
    .filter((game) => {
      const detail = details[game.id];
      if (genreSlug && !(detail?.genres ?? []).some((genre) => genre.slug === genreSlug)) return false;

      const assignment = overlay.assignments[game.id];
      if (facetSlug) {
        const labels = [
          ...(detail?.tags ?? []),
          ...(detail?.genres ?? []),
          ...(assignment?.tags ?? []),
          ...(assignment?.facets ?? []),
        ];
        if (!labels.some((entity) => entity.slug === facetSlug)) return false;
      }

      if (q.length < 2) return true;
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
        ...(detail?.tags?.map((tag) => tag.name) ?? []),
        ...(assignment?.tags?.map((tag) => tag.name) ?? []),
        ...(assignment?.facets?.map((facet) => facet.name) ?? []),
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
  tags?: string[];
  facets?: string[];
}): Promise<{ ok: true; affectedCount: number } | { error: string }> {
  const gameIds = uniqueStrings(input.gameIds);
  const tags = uniqueStrings(input.tags ?? []);
  const facets = uniqueStrings(input.facets ?? []);
  if (gameIds.length === 0) return { error: "Selecciona al menos un juego." };
  if (tags.length === 0 && facets.length === 0) {
    return { error: "Añade al menos una etiqueta o faceta." };
  }

  const catalogIds = new Set(loadCatalog().map((game) => game.id));
  const targetGameIds = gameIds.filter((gameId) => catalogIds.has(gameId));
  if (targetGameIds.length === 0) return { error: "No hay juegos válidos para modificar." };

  const overlay = await readAdminSeriesOverlay();
  const now = new Date().toISOString();
  for (const gameId of targetGameIds) {
    const current = overlay.assignments[gameId] ?? { tags: [], facets: [], updatedAt: now };
    overlay.assignments[gameId] = {
      tags: mergeEntities(current.tags, tags),
      facets: mergeEntities(current.facets, facets),
      updatedAt: now,
    };
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
