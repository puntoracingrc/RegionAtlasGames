import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { listedCatalog } from "./catalog";
import { slugify } from "./slug";
import { isInvalidGenreEntity } from "./genre-normalize";
import type { IndexEntry, Platform, PlatformStatus } from "./types";
import {
  registerPlatformInPriceRotation,
  renamePlatformInPriceRotation,
  unregisterPlatformFromPriceRotation,
} from "./admin-price-rotation";

const DATA_DIR = path.join(process.cwd(), "data");
const PLATFORMS_FILE = path.join(DATA_DIR, "platforms.json");
const PLATFORM_SOURCES_FILE = path.join(DATA_DIR, "platform-sources.json");
const COMPANIES_INDEX_FILE = path.join(DATA_DIR, "index", "companies.json");
const GENRES_INDEX_FILE = path.join(DATA_DIR, "index", "genres.json");
const COMPANY_ENTITIES_FILE = path.join(DATA_DIR, "index", "company-entities.json");
const GENRE_ENTITIES_FILE = path.join(DATA_DIR, "index", "genre-entities.json");
const COMPANY_PROFILES_FILE = path.join(DATA_DIR, "company-profiles.json");
const META_FILE = path.join(DATA_DIR, "meta.json");
const DETAILS_FILE = path.join(DATA_DIR, "game-details.json");
const ADMIN_ENTITIES_OVERLAY_PATH = "region-atlas/admin/entities-overlay.json";

type CompanyEntitiesFile = {
  version?: number;
  generatedAt?: string;
  stats?: Record<string, number>;
  entities: Record<
    string,
    {
      slug: string;
      name: string;
      mergeMethod: string;
      aliasSlugs: string[];
      aliasNames: string[];
      wikidataIds?: string[];
      museumPaths?: string[];
    }
  >;
  slugToCanonical?: Record<string, string>;
  wikidataToCanonical?: Record<string, string>;
  museumPathToCanonical?: Record<string, string>;
  normalizedToCanonical?: Record<string, string>;
};

type GenreEntitiesFile = {
  version?: number;
  generatedAt?: string;
  stats?: Record<string, number>;
  entities: Record<
    string,
    {
      slug: string;
      name: string;
      mergeMethod: string;
      aliasSlugs: string[];
      aliasNames: string[];
      museumPaths?: string[];
    }
  >;
  slugToCanonical?: Record<string, string>;
  museumPathToCanonical?: Record<string, string>;
  normalizedToCanonical?: Record<string, string>;
};

type AdminEntitiesOverlay = {
  updatedAt: string;
  platforms: Record<string, Platform>;
  companies: Record<string, AdminIndexRow>;
  genres: Record<string, AdminIndexRow>;
  active: {
    platforms: Record<string, boolean>;
    companies: Record<string, boolean>;
    genres: Record<string, boolean>;
  };
};

function emptyOverlay(): AdminEntitiesOverlay {
  return {
    updatedAt: new Date().toISOString(),
    platforms: {},
    companies: {},
    genres: {},
    active: {
      platforms: {},
      companies: {},
      genres: {},
    },
  };
}

function useAdminEntityOverlayStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function parseOverlay(raw: string): AdminEntitiesOverlay {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminEntitiesOverlay>;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      platforms: parsed.platforms ?? {},
      companies: parsed.companies ?? {},
      genres: parsed.genres ?? {},
      active: {
        platforms: parsed.active?.platforms ?? {},
        companies: parsed.active?.companies ?? {},
        genres: parsed.active?.genres ?? {},
      },
    };
  } catch {
    return emptyOverlay();
  }
}

async function readAdminEntitiesOverlay(): Promise<AdminEntitiesOverlay> {
  if (!useAdminEntityOverlayStorage()) return emptyOverlay();
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(ADMIN_ENTITIES_OVERLAY_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return emptyOverlay();
    const text = await new Response(result.stream).text();
    return parseOverlay(text);
  } catch {
    return emptyOverlay();
  }
}

async function writeAdminEntitiesOverlay(overlay: AdminEntitiesOverlay): Promise<void> {
  if (!useAdminEntityOverlayStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(
    ADMIN_ENTITIES_OVERLAY_PATH,
    JSON.stringify({ ...overlay, updatedAt: new Date().toISOString() }, null, 2),
    {
      ...auth,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    },
  );
}

function staticIndexRow(entry: IndexEntry): AdminIndexRow {
  return {
    slug: entry.slug,
    name: entry.name,
    gameCount: entry.gameCount ?? entry.gameIds?.length ?? 0,
    active: entry.active !== false,
  };
}

async function createOverlayCompany(
  input: { slug?: string; name: string },
  staticIndex: Record<string, IndexEntry>,
): Promise<{ ok: true; entry: AdminIndexRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la compañía." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  const overlay = await readAdminEntitiesOverlay();
  if (staticIndex[slug] || overlay.companies[slug]) {
    return { error: `Ya existe la compañía «${slug}».` };
  }
  const entry = { slug, name, gameCount: 0, active: true };
  overlay.companies[slug] = entry;
  await writeAdminEntitiesOverlay(overlay);
  return { ok: true, entry };
}

async function createOverlayGenre(
  input: { slug?: string; name: string },
  staticIndex: Record<string, IndexEntry>,
): Promise<{ ok: true; entry: AdminIndexRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre del género." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  const overlay = await readAdminEntitiesOverlay();
  if (staticIndex[slug] || overlay.genres[slug]) {
    return { error: `Ya existe el género «${slug}».` };
  }
  const entry = { slug, name, gameCount: 0, active: true };
  overlay.genres[slug] = entry;
  await writeAdminEntitiesOverlay(overlay);
  return { ok: true, entry };
}

async function createOverlayPlatform(
  input: {
    slug?: string;
    name: string;
    shortName?: string;
    manufacturer?: Platform["manufacturer"];
    status?: PlatformStatus;
    description?: string;
    sortOrder?: number;
  },
  staticPlatforms: Platform[],
): Promise<{ ok: true; platform: Platform } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la plataforma." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  const overlay = await readAdminEntitiesOverlay();
  if (staticPlatforms.some((p) => p.slug === slug) || overlay.platforms[slug]) {
    return { error: `Ya existe la plataforma «${slug}».` };
  }
  const manufacturer = input.manufacturer ?? "nintendo";
  if (!["nintendo", "sony", "sega", "snk"].includes(manufacturer)) {
    return { error: "Fabricante no válido." };
  }
  const status = input.status ?? "closed";
  if (!["closed", "semi-closed"].includes(status)) {
    return { error: "Estado no válido." };
  }
  const maxSortOrder = Math.max(
    0,
    ...staticPlatforms.map((p) => p.sortOrder ?? 0),
    ...Object.values(overlay.platforms).map((p) => p.sortOrder ?? 0),
  );
  const platform: Platform = {
    slug,
    name,
    shortName: input.shortName?.trim() || name,
    manufacturer,
    status,
    estimatedCatalogSize: 0,
    sortOrder: input.sortOrder ?? maxSortOrder + 1,
    description: input.description?.trim() || "Catálogo administrado manualmente.",
    active: true,
  };
  overlay.platforms[slug] = platform;
  await writeAdminEntitiesOverlay(overlay);
  return { ok: true, platform };
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

function assertWritable(): { ok: true } | { error: string } {
  if (!canWriteCatalogFiles()) {
    return {
      error:
        "Escritura en disco desactivada. En producción define ADMIN_ALLOW_CATALOG_WRITE=1 o usa entorno local.",
    };
  }
  return { ok: true };
}

function normalizeSlug(raw: string): string {
  return slugify(raw.trim());
}

function countCatalogGamesForPlatform(slug: string): number {
  return listedCatalog.filter((g) => g.platformSlug === slug).length;
}

function companyUsedInDetails(slug: string, details: Record<string, unknown>): boolean {
  for (const value of Object.values(details)) {
    if (!value || typeof value !== "object") continue;
    const detail = value as {
      developer?: { slug?: string } | null;
      publisher?: { slug?: string } | null;
    };
    if (detail.developer?.slug === slug || detail.publisher?.slug === slug) return true;
  }
  return false;
}

function genreUsedInDetails(slug: string, details: Record<string, unknown>): boolean {
  for (const value of Object.values(details)) {
    if (!value || typeof value !== "object") continue;
    const detail = value as { genres?: Array<{ slug?: string }> };
    if (detail.genres?.some((g) => g.slug === slug)) return true;
  }
  return false;
}

function bumpMetaCounter(key: "indexCompanies" | "indexGenres" | "platformCount", delta: number) {
  const meta = loadJson<Record<string, unknown>>(META_FILE, {});
  const current = typeof meta[key] === "number" ? (meta[key] as number) : 0;
  meta[key] = Math.max(0, current + delta);
  saveJson(META_FILE, meta);
}

export type AdminPlatformRow = Platform & { catalogGames: number };

export async function listAdminPlatforms(): Promise<AdminPlatformRow[]> {
  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  const overlay = await readAdminEntitiesOverlay();
  return [...platforms, ...Object.values(overlay.platforms)]
    .map((platform) => ({
      ...platform,
      active: overlay.active.platforms[platform.slug] ?? platform.active !== false,
      catalogGames: countCatalogGamesForPlatform(platform.slug),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}

export async function getAdminPlatform(slug: string): Promise<AdminPlatformRow | null> {
  const platforms = await listAdminPlatforms();
  return platforms.find((platform) => platform.slug === slug) ?? null;
}

export async function createAdminPlatform(input: {
  slug?: string;
  name: string;
  shortName?: string;
  manufacturer?: Platform["manufacturer"];
  status?: PlatformStatus;
  description?: string;
  sortOrder?: number;
}): Promise<{ ok: true; platform: Platform } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la plataforma." };

  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };

  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  if (!canWriteCatalogFiles()) {
    return createOverlayPlatform(input, platforms);
  }

  if (platforms.some((p) => p.slug === slug)) {
    return { error: `Ya existe la plataforma «${slug}».` };
  }

  const manufacturer = input.manufacturer ?? "nintendo";
  if (!["nintendo", "sony", "sega", "snk"].includes(manufacturer)) {
    return { error: "Fabricante no válido." };
  }

  const status = input.status ?? "closed";
  if (!["closed", "semi-closed"].includes(status)) {
    return { error: "Estado no válido." };
  }

  const sortOrder =
    input.sortOrder ??
    (platforms.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1);

  const platform: Platform = {
    slug,
    name,
    shortName: input.shortName?.trim() || name,
    manufacturer,
    status,
    estimatedCatalogSize: 0,
    sortOrder,
    description: input.description?.trim() || "Catálogo administrado manualmente.",
    active: true,
  };

  platforms.push(platform);
  platforms.sort((a, b) => a.sortOrder - b.sortOrder);
  saveJson(PLATFORMS_FILE, platforms);

  const meta = loadJson<{
    listedByPlatform?: Record<string, number>;
    excludedByPlatform?: Record<string, number>;
  }>(META_FILE, {});
  meta.listedByPlatform = meta.listedByPlatform ?? {};
  meta.listedByPlatform[slug] = meta.listedByPlatform[slug] ?? 0;
  meta.excludedByPlatform = meta.excludedByPlatform ?? {};
  meta.excludedByPlatform[slug] = meta.excludedByPlatform[slug] ?? 0;
  saveJson(META_FILE, meta);
  bumpMetaCounter("platformCount", 1);

  const sources = loadJson<{ schemaVersion?: number; notes?: string; platforms: Record<string, unknown> }>(
    PLATFORM_SOURCES_FILE,
    { platforms: {} },
  );
  if (!sources.platforms[slug]) {
    sources.platforms[slug] = { searchKeyword: slug };
    saveJson(PLATFORM_SOURCES_FILE, sources);
  }

  registerPlatformInPriceRotation(slug);

  return { ok: true, platform };
}

export async function deleteAdminPlatform(
  slug: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = slug.trim();
  const gameCount = countCatalogGamesForPlatform(trimmed);
  if (gameCount > 0) {
    return {
      error: `No se puede borrar: hay ${gameCount} juegos en catálogo con esta plataforma.`,
    };
  }

  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    if (!overlay.platforms[trimmed]) return { error: "Plataforma no encontrada." };
    delete overlay.platforms[trimmed];
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true };
  }

  const nextPlatforms = platforms.filter((p) => p.slug !== trimmed);
  if (nextPlatforms.length === platforms.length) {
    return { error: "Plataforma no encontrada." };
  }
  saveJson(PLATFORMS_FILE, nextPlatforms);

  const meta = loadJson<{
    listedByPlatform?: Record<string, number>;
    excludedByPlatform?: Record<string, number>;
  }>(META_FILE, {});
  if (meta.listedByPlatform) delete meta.listedByPlatform[trimmed];
  if (meta.excludedByPlatform) delete meta.excludedByPlatform[trimmed];
  saveJson(META_FILE, meta);
  bumpMetaCounter("platformCount", -1);

  const sources = loadJson<{ platforms: Record<string, unknown> }>(PLATFORM_SOURCES_FILE, {
    platforms: {},
  });
  if (sources.platforms[trimmed]) {
    delete sources.platforms[trimmed];
    saveJson(PLATFORM_SOURCES_FILE, sources);
  }

  unregisterPlatformFromPriceRotation(trimmed);

  return { ok: true };
}

export async function updateAdminPlatform(
  slug: string,
  input: {
    name?: string;
    shortName?: string;
    manufacturer?: Platform["manufacturer"];
    status?: PlatformStatus;
    description?: string;
    sortOrder?: number;
    newSlug?: string;
  },
): Promise<{ ok: true; platform: Platform; slug: string } | { error: string }> {
  const currentSlug = slug.trim();
  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    const current = overlay.platforms[currentSlug];
    if (!current) return { error: "Plataforma no encontrada." };

    const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
    if (!nextSlug) return { error: "Slug no válido." };
    if (
      nextSlug !== currentSlug &&
      (platforms.some((p) => p.slug === nextSlug) || overlay.platforms[nextSlug])
    ) {
      return { error: `Ya existe la plataforma «${nextSlug}».` };
    }

    const platform: Platform = {
      ...current,
      slug: nextSlug,
      name: input.name?.trim() || current.name,
      shortName: input.shortName?.trim() || current.shortName,
      manufacturer: input.manufacturer ?? current.manufacturer,
      status: input.status ?? current.status,
      description: input.description?.trim() || current.description,
      sortOrder: input.sortOrder ?? current.sortOrder,
    };
    if (nextSlug !== currentSlug) delete overlay.platforms[currentSlug];
    overlay.platforms[nextSlug] = platform;
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true, platform, slug: nextSlug };
  }

  const index = platforms.findIndex((p) => p.slug === currentSlug);
  if (index < 0) return { error: "Plataforma no encontrada." };

  const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
  if (!nextSlug) return { error: "Slug no válido." };

  if (nextSlug !== currentSlug) {
    const gameCount = countCatalogGamesForPlatform(currentSlug);
    if (gameCount > 0) {
      return { error: `No se puede cambiar el slug: hay ${gameCount} juegos en catálogo.` };
    }
    if (platforms.some((p) => p.slug === nextSlug)) {
      return { error: `Ya existe la plataforma «${nextSlug}».` };
    }
  }

  const current = platforms[index];
  const platform: Platform = {
    ...current,
    slug: nextSlug,
    name: input.name?.trim() || current.name,
    shortName: input.shortName?.trim() || current.shortName,
    manufacturer: input.manufacturer ?? current.manufacturer,
    status: input.status ?? current.status,
    description: input.description?.trim() || current.description,
    sortOrder: input.sortOrder ?? current.sortOrder,
  };

  platforms[index] = platform;
  platforms.sort((a, b) => a.sortOrder - b.sortOrder);
  saveJson(PLATFORMS_FILE, platforms);

  if (nextSlug !== currentSlug) {
    const meta = loadJson<{
      listedByPlatform?: Record<string, number>;
      excludedByPlatform?: Record<string, number>;
    }>(META_FILE, {});
    if (meta.listedByPlatform?.[currentSlug] != null) {
      meta.listedByPlatform[nextSlug] = meta.listedByPlatform[currentSlug];
      delete meta.listedByPlatform[currentSlug];
    }
    if (meta.excludedByPlatform?.[currentSlug] != null) {
      meta.excludedByPlatform[nextSlug] = meta.excludedByPlatform[currentSlug];
      delete meta.excludedByPlatform[currentSlug];
    }
    saveJson(META_FILE, meta);

    const sources = loadJson<{ platforms: Record<string, unknown> }>(PLATFORM_SOURCES_FILE, {
      platforms: {},
    });
    if (sources.platforms[currentSlug]) {
      sources.platforms[nextSlug] = sources.platforms[currentSlug];
      delete sources.platforms[currentSlug];
      saveJson(PLATFORM_SOURCES_FILE, sources);
    }

    renamePlatformInPriceRotation(currentSlug, nextSlug);
  }

  return { ok: true, platform, slug: nextSlug };
}

export type AdminEntityKind = "platforms" | "companies" | "genres";

export type AdminIndexRow = Pick<IndexEntry, "slug" | "name" | "gameCount" | "active">;

export async function setAdminEntityActive(
  kind: AdminEntityKind,
  slug: string,
  active: boolean,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = slug.trim();
  if (!trimmed) return { error: "Slug no válido." };

  const overlay = await readAdminEntitiesOverlay();

  if (kind === "platforms") {
    const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
    const exists = platforms.some((platform) => platform.slug === trimmed) || Boolean(overlay.platforms[trimmed]);
    if (!exists) return { error: "Plataforma no encontrada." };
    overlay.active.platforms[trimmed] = active;
    if (overlay.platforms[trimmed]) overlay.platforms[trimmed].active = active;
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true };
  }

  if (kind === "companies") {
    const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
    const exists = Boolean(index[trimmed]) || Boolean(overlay.companies[trimmed]);
    if (!exists) return { error: "Compañía no encontrada." };
    overlay.active.companies[trimmed] = active;
    if (overlay.companies[trimmed]) overlay.companies[trimmed].active = active;
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true };
  }

  const index = loadJson<Record<string, IndexEntry>>(GENRES_INDEX_FILE, {});
  const exists = Boolean(index[trimmed]) || Boolean(overlay.genres[trimmed]);
  if (!exists) return { error: "Género no encontrado." };
  overlay.active.genres[trimmed] = active;
  if (overlay.genres[trimmed]) overlay.genres[trimmed].active = active;
  await writeAdminEntitiesOverlay(overlay);
  return { ok: true };
}

export async function listAdminCompanies(input?: {
  q?: string;
  limit?: number;
}): Promise<AdminIndexRow[]> {
  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  const overlay = await readAdminEntitiesOverlay();
  const q = input?.q?.trim().toLowerCase() ?? "";
  const limit = Math.min(500, Math.max(20, input?.limit ?? 150));

  return [...Object.values(index).map(staticIndexRow), ...Object.values(overlay.companies)]
    .map((entry) => ({
      ...entry,
      active: overlay.active.companies[entry.slug] ?? entry.active !== false,
    }))
    .filter((entry) => !q || entry.name.toLowerCase().includes(q) || entry.slug.includes(q))
    .sort((a, b) => a.gameCount - b.gameCount || a.name.localeCompare(b.name, "es"))
    .slice(0, limit)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      gameCount: entry.gameCount,
      active: entry.active,
    }));
}

export async function createAdminCompany(input: {
  slug?: string;
  name: string;
}): Promise<{ ok: true; entry: AdminIndexRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la compañía." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };

  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  if (!canWriteCatalogFiles()) {
    return createOverlayCompany(input, index);
  }

  if (index[slug]) return { error: `Ya existe la compañía «${slug}».` };

  const entry: IndexEntry = {
    name,
    slug,
    museumPath: `/compania/${slug}`,
    gameIds: [],
    byPlatform: {},
    gameCount: 0,
    asDeveloper: [],
    asPublisher: [],
  };
  index[slug] = entry;
  saveJson(COMPANIES_INDEX_FILE, index);

  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  registry.entities = registry.entities ?? {};
  registry.slugToCanonical = registry.slugToCanonical ?? {};
  registry.entities[slug] = {
    slug,
    name,
    mergeMethod: "manual",
    aliasSlugs: [],
    aliasNames: [],
    wikidataIds: [],
    museumPaths: [],
  };
  registry.slugToCanonical[slug] = slug;
  if (registry.stats) registry.stats.entities = (registry.stats.entities ?? 0) + 1;
  registry.generatedAt = new Date().toISOString();
  saveJson(COMPANY_ENTITIES_FILE, registry);
  bumpMetaCounter("indexCompanies", 1);

  return { ok: true, entry: { slug, name, gameCount: 0, active: true } };
}

export async function deleteAdminCompany(
  slug: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = slug.trim();
  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    if (!overlay.companies[trimmed]) return { error: "Compañía no encontrada." };
    delete overlay.companies[trimmed];
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true };
  }

  const entry = index[trimmed];
  if (!entry) return { error: "Compañía no encontrada." };

  const gameCount = entry.gameCount ?? entry.gameIds?.length ?? 0;
  if (gameCount > 0) {
    return {
      error: `No se puede borrar: la compañía tiene ${gameCount} juegos en el índice.`,
    };
  }

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  if (companyUsedInDetails(trimmed, details)) {
    return { error: "No se puede borrar: hay fichas que referencian esta compañía." };
  }

  delete index[trimmed];
  saveJson(COMPANIES_INDEX_FILE, index);

  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  delete registry.entities?.[trimmed];
  for (const map of [
    registry.slugToCanonical,
    registry.wikidataToCanonical,
    registry.museumPathToCanonical,
    registry.normalizedToCanonical,
  ]) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      if (key === trimmed || value === trimmed) delete map[key];
    }
  }
  if (registry.stats) registry.stats.entities = Math.max(0, (registry.stats.entities ?? 1) - 1);
  registry.generatedAt = new Date().toISOString();
  saveJson(COMPANY_ENTITIES_FILE, registry);

  const profiles = loadJson<Record<string, unknown>>(COMPANY_PROFILES_FILE, {});
  if (trimmed in profiles) {
    delete profiles[trimmed];
    saveJson(COMPANY_PROFILES_FILE, profiles);
  }

  bumpMetaCounter("indexCompanies", -1);
  return { ok: true };
}

function renameCompanySlugInDetails(
  details: Record<string, unknown>,
  oldSlug: string,
  newSlug: string,
  newName: string,
) {
  for (const value of Object.values(details)) {
    if (!value || typeof value !== "object") continue;
    const detail = value as {
      developer?: { slug?: string; name?: string } | null;
      publisher?: { slug?: string; name?: string } | null;
    };
    if (detail.developer?.slug === oldSlug) {
      detail.developer.slug = newSlug;
      detail.developer.name = newName;
    }
    if (detail.publisher?.slug === oldSlug) {
      detail.publisher.slug = newSlug;
      detail.publisher.name = newName;
    }
  }
}

export async function updateAdminCompany(
  slug: string,
  input: { name?: string; newSlug?: string },
): Promise<{ ok: true; entry: AdminIndexRow; slug: string } | { error: string }> {
  const currentSlug = slug.trim();
  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    const entry = overlay.companies[currentSlug];
    if (!entry) return { error: "Compañía no encontrada." };

    const name = input.name?.trim() || entry.name;
    const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
    if (!nextSlug) return { error: "Slug no válido." };
    if (nextSlug !== currentSlug && (index[nextSlug] || overlay.companies[nextSlug])) {
      return { error: `Ya existe la compañía «${nextSlug}».` };
    }

    const updated = { slug: nextSlug, name, gameCount: entry.gameCount };
    if (nextSlug !== currentSlug) delete overlay.companies[currentSlug];
    overlay.companies[nextSlug] = updated;
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true, slug: nextSlug, entry: updated };
  }

  const entry = index[currentSlug];
  if (!entry) return { error: "Compañía no encontrada." };

  const name = input.name?.trim() || entry.name;
  const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
  if (!nextSlug) return { error: "Slug no válido." };
  if (nextSlug !== currentSlug && index[nextSlug]) {
    return { error: `Ya existe la compañía «${nextSlug}».` };
  }

  const updated: IndexEntry = {
    ...entry,
    name,
    slug: nextSlug,
    museumPath: `/compania/${nextSlug}`,
  };

  if (nextSlug !== currentSlug) {
    delete index[currentSlug];
  }
  index[nextSlug] = updated;
  saveJson(COMPANIES_INDEX_FILE, index);

  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  const entity = registry.entities?.[currentSlug];
  if (entity) {
    delete registry.entities?.[currentSlug];
    registry.entities = registry.entities ?? {};
    registry.entities[nextSlug] = { ...entity, slug: nextSlug, name };
  }
  if (registry.slugToCanonical) {
    for (const [key, value] of Object.entries(registry.slugToCanonical)) {
      if (value === currentSlug) registry.slugToCanonical[key] = nextSlug;
      if (key === currentSlug) {
        registry.slugToCanonical[nextSlug] = nextSlug;
        delete registry.slugToCanonical[currentSlug];
      }
    }
    registry.slugToCanonical[nextSlug] = nextSlug;
  }
  registry.generatedAt = new Date().toISOString();
  saveJson(COMPANY_ENTITIES_FILE, registry);

  const profiles = loadJson<Record<string, Record<string, unknown>>>(COMPANY_PROFILES_FILE, {});
  if (profiles[currentSlug]) {
    profiles[nextSlug] = { ...profiles[currentSlug], slug: nextSlug, name };
    delete profiles[currentSlug];
    saveJson(COMPANY_PROFILES_FILE, profiles);
  }

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  renameCompanySlugInDetails(details, currentSlug, nextSlug, name);
  saveJson(DETAILS_FILE, details);

  return {
    ok: true,
    slug: nextSlug,
    entry: {
      slug: nextSlug,
      name,
      gameCount: entry.gameCount ?? entry.gameIds?.length ?? 0,
    },
  };
}

export async function listAdminGenres(input?: {
  q?: string;
  limit?: number;
}): Promise<AdminIndexRow[]> {
  const index = loadJson<Record<string, IndexEntry>>(GENRES_INDEX_FILE, {});
  const overlay = await readAdminEntitiesOverlay();
  const q = input?.q?.trim().toLowerCase() ?? "";
  const limit = Math.min(500, Math.max(20, input?.limit ?? 150));

  return [...Object.values(index).map(staticIndexRow), ...Object.values(overlay.genres)]
    .filter((entry) => !isInvalidGenreEntity(entry))
    .map((entry) => ({
      ...entry,
      active: overlay.active.genres[entry.slug] ?? entry.active !== false,
    }))
    .filter((entry) => !q || entry.name.toLowerCase().includes(q) || entry.slug.includes(q))
    .sort((a, b) => a.gameCount - b.gameCount || a.name.localeCompare(b.name, "es"))
    .slice(0, limit)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      gameCount: entry.gameCount,
      active: entry.active,
    }));
}

export async function createAdminGenre(input: {
  slug?: string;
  name: string;
}): Promise<{ ok: true; entry: AdminIndexRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre del género." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };

  const index = loadJson<Record<string, IndexEntry>>(GENRES_INDEX_FILE, {});
  if (!canWriteCatalogFiles()) {
    return createOverlayGenre(input, index);
  }

  if (index[slug]) return { error: `Ya existe el género «${slug}».` };

  const entry: IndexEntry = {
    name,
    slug,
    museumPath: `/genero/${slug}`,
    gameIds: [],
    byPlatform: {},
    gameCount: 0,
  };
  index[slug] = entry;
  saveJson(GENRES_INDEX_FILE, index);

  const registry = loadJson<GenreEntitiesFile>(GENRE_ENTITIES_FILE, { entities: {} });
  registry.entities = registry.entities ?? {};
  registry.slugToCanonical = registry.slugToCanonical ?? {};
  registry.entities[slug] = {
    slug,
    name,
    mergeMethod: "manual",
    aliasSlugs: [],
    aliasNames: [],
    museumPaths: [],
  };
  registry.slugToCanonical[slug] = slug;
  if (registry.stats) registry.stats.entities = (registry.stats.entities ?? 0) + 1;
  registry.generatedAt = new Date().toISOString();
  saveJson(GENRE_ENTITIES_FILE, registry);
  bumpMetaCounter("indexGenres", 1);

  return { ok: true, entry: { slug, name, gameCount: 0, active: true } };
}

export async function deleteAdminGenre(
  slug: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = slug.trim();
  const index = loadJson<Record<string, IndexEntry>>(GENRES_INDEX_FILE, {});
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    if (!overlay.genres[trimmed]) return { error: "Género no encontrado." };
    delete overlay.genres[trimmed];
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true };
  }

  const entry = index[trimmed];
  if (!entry) return { error: "Género no encontrado." };

  const gameCount = entry.gameCount ?? entry.gameIds?.length ?? 0;
  if (gameCount > 0) {
    return { error: `No se puede borrar: el género tiene ${gameCount} juegos en el índice.` };
  }

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  if (genreUsedInDetails(trimmed, details)) {
    return { error: "No se puede borrar: hay fichas que referencian este género." };
  }

  delete index[trimmed];
  saveJson(GENRES_INDEX_FILE, index);

  const registry = loadJson<GenreEntitiesFile>(GENRE_ENTITIES_FILE, { entities: {} });
  delete registry.entities?.[trimmed];
  for (const map of [
    registry.slugToCanonical,
    registry.museumPathToCanonical,
    registry.normalizedToCanonical,
  ]) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      if (key === trimmed || value === trimmed) delete map[key];
    }
  }
  if (registry.stats) registry.stats.entities = Math.max(0, (registry.stats.entities ?? 1) - 1);
  registry.generatedAt = new Date().toISOString();
  saveJson(GENRE_ENTITIES_FILE, registry);
  bumpMetaCounter("indexGenres", -1);

  return { ok: true };
}

function renameGenreSlugInDetails(
  details: Record<string, unknown>,
  oldSlug: string,
  newSlug: string,
  newName: string,
) {
  for (const value of Object.values(details)) {
    if (!value || typeof value !== "object") continue;
    const detail = value as { genres?: Array<{ slug?: string; name?: string }> };
    if (!detail.genres) continue;
    detail.genres = detail.genres.map((genre) =>
      genre.slug === oldSlug ? { ...genre, slug: newSlug, name: newName } : genre,
    );
  }
}

export async function updateAdminGenre(
  slug: string,
  input: { name?: string; newSlug?: string },
): Promise<{ ok: true; entry: AdminIndexRow; slug: string } | { error: string }> {
  const currentSlug = slug.trim();
  const index = loadJson<Record<string, IndexEntry>>(GENRES_INDEX_FILE, {});
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    const entry = overlay.genres[currentSlug];
    if (!entry) return { error: "Género no encontrado." };

    const name = input.name?.trim() || entry.name;
    const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
    if (!nextSlug) return { error: "Slug no válido." };
    if (nextSlug !== currentSlug && (index[nextSlug] || overlay.genres[nextSlug])) {
      return { error: `Ya existe el género «${nextSlug}».` };
    }

    const updated = { slug: nextSlug, name, gameCount: entry.gameCount };
    if (nextSlug !== currentSlug) delete overlay.genres[currentSlug];
    overlay.genres[nextSlug] = updated;
    await writeAdminEntitiesOverlay(overlay);
    return { ok: true, slug: nextSlug, entry: updated };
  }

  const entry = index[currentSlug];
  if (!entry) return { error: "Género no encontrado." };

  const name = input.name?.trim() || entry.name;
  const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
  if (!nextSlug) return { error: "Slug no válido." };
  if (nextSlug !== currentSlug && index[nextSlug]) {
    return { error: `Ya existe el género «${nextSlug}».` };
  }

  const updated: IndexEntry = {
    ...entry,
    name,
    slug: nextSlug,
    museumPath: `/genero/${nextSlug}`,
  };

  if (nextSlug !== currentSlug) {
    delete index[currentSlug];
  }
  index[nextSlug] = updated;
  saveJson(GENRES_INDEX_FILE, index);

  const registry = loadJson<GenreEntitiesFile>(GENRE_ENTITIES_FILE, { entities: {} });
  const entity = registry.entities?.[currentSlug];
  if (entity) {
    delete registry.entities?.[currentSlug];
    registry.entities = registry.entities ?? {};
    registry.entities[nextSlug] = { ...entity, slug: nextSlug, name };
  }
  if (registry.slugToCanonical) {
    for (const [key, value] of Object.entries(registry.slugToCanonical)) {
      if (value === currentSlug) registry.slugToCanonical[key] = nextSlug;
      if (key === currentSlug) {
        registry.slugToCanonical[nextSlug] = nextSlug;
        delete registry.slugToCanonical[currentSlug];
      }
    }
    registry.slugToCanonical[nextSlug] = nextSlug;
  }
  registry.generatedAt = new Date().toISOString();
  saveJson(GENRE_ENTITIES_FILE, registry);

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  renameGenreSlugInDetails(details, currentSlug, nextSlug, name);
  saveJson(DETAILS_FILE, details);

  return {
    ok: true,
    slug: nextSlug,
    entry: {
      slug: nextSlug,
      name,
      gameCount: entry.gameCount ?? entry.gameIds?.length ?? 0,
    },
  };
}
