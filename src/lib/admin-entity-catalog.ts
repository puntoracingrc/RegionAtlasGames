import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { canWriteCatalogFiles } from "./admin-auth";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { listedCatalog } from "./catalog";
import { slugify } from "./slug";
import { isInvalidGenreEntity } from "./genre-normalize";
import type { CompanyProfile, CompanyProfileStatus, CompanyRelation, IndexEntry, Platform, PlatformStatus } from "./types";
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
const COMPANY_MERGE_LOG_FILE = path.join(DATA_DIR, "admin-company-merge-log.json");
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

type CompanyEntityRecord = CompanyEntitiesFile["entities"][string];

type CompanyRegistrySnapshot = {
  sourceEntity?: CompanyEntityRecord;
  targetEntity?: CompanyEntityRecord;
  slugToCanonical: Record<string, string | null>;
  wikidataToCanonical: Record<string, string | null>;
  museumPathToCanonical: Record<string, string | null>;
  normalizedToCanonical: Record<string, string | null>;
  statsEntities?: number;
  generatedAt?: string;
};

type CompanyOverlaySnapshot = {
  sourceCompany?: AdminIndexRow;
  targetCompany?: AdminIndexRow;
  sourceProfile?: CompanyProfile;
  targetProfile?: CompanyProfile;
  relatedProfiles?: Record<string, CompanyProfile>;
  sourceActive?: boolean;
  targetActive?: boolean;
};

type CompanyMergeLogEntry = {
  id: string;
  createdAt: string;
  sourceSlug: string;
  sourceName: string;
  targetSlug: string;
  targetName: string;
  snapshot: {
    sourceIndex: IndexEntry;
    targetIndex: IndexEntry;
    sourceProfile?: CompanyProfile;
    targetProfile?: CompanyProfile;
    registry: CompanyRegistrySnapshot;
    overlay: CompanyOverlaySnapshot;
    relatedProfiles?: Record<string, CompanyProfile>;
    details: Record<string, unknown>;
    metaIndexCompanies?: number;
  };
  result: {
    updatedGames: number;
    developerUpdates: number;
    publisherUpdates: number;
    mergedGameCount: number;
  };
  revertedAt?: string;
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
  companyProfiles: Record<string, CompanyProfile>;
  genres: Record<string, AdminIndexRow>;
  active: {
    platforms: Record<string, boolean>;
    companies: Record<string, boolean>;
    genres: Record<string, boolean>;
  };
  news: {
    platforms: Record<string, boolean>;
  };
};

function emptyOverlay(): AdminEntitiesOverlay {
  return {
    updatedAt: new Date().toISOString(),
    platforms: {},
    companies: {},
    companyProfiles: {},
    genres: {},
    active: {
      platforms: {},
      companies: {},
      genres: {},
    },
    news: {
      platforms: {},
    },
  };
}

function shouldUseAdminEntityOverlayStorage(): boolean {
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
      companyProfiles: parsed.companyProfiles ?? {},
      genres: parsed.genres ?? {},
      active: {
        platforms: parsed.active?.platforms ?? {},
        companies: parsed.active?.companies ?? {},
        genres: parsed.active?.genres ?? {},
      },
      news: {
        platforms: parsed.news?.platforms ?? {},
      },
    };
  } catch {
    return emptyOverlay();
  }
}

async function readAdminEntitiesOverlay(): Promise<AdminEntitiesOverlay> {
  if (!shouldUseAdminEntityOverlayStorage()) return emptyOverlay();
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

export async function readAdminCompanyProfilesOverlay(): Promise<Record<string, CompanyProfile>> {
  const overlay = await readAdminEntitiesOverlay();
  return overlay.companyProfiles;
}

async function writeAdminEntitiesOverlay(overlay: AdminEntitiesOverlay): Promise<void> {
  if (!shouldUseAdminEntityOverlayStorage()) return;
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
  input: {
    slug?: string;
    name: string;
    history?: string | null;
    logoUrl?: string | null;
    websiteUrl?: string | null;
    foundedYear?: number | null;
    closedYear?: number | null;
    status?: CompanyProfileStatus;
    isParentCompany?: boolean;
    parentCompany?: CompanyRelation | null;
    acquiredByCompany?: CompanyRelation | null;
    mergedWithCompany?: CompanyRelation | null;
    predecessorCompany?: CompanyRelation | null;
    successorCompany?: CompanyRelation | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  },
  staticIndex: Record<string, IndexEntry>,
): Promise<{ ok: true; entry: AdminIndexRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la compañía." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  const foundedYear = parseNullableYear(input.foundedYear);
  const closedYear = parseNullableYear(input.closedYear);
  const status = normalizeCompanyStatus(input.status);
  const parentCompany = normalizeCompanyRelation(input.parentCompany);
  const acquiredByCompany = normalizeCompanyRelation(input.acquiredByCompany);
  const mergedWithCompany = normalizeCompanyRelation(input.mergedWithCompany);
  const predecessorCompany = normalizeCompanyRelation(input.predecessorCompany);
  const successorCompany = normalizeCompanyRelation(input.successorCompany);
  if (foundedYear === undefined) return { error: "Año de fundación no válido." };
  if (closedYear === undefined) return { error: "Año de cierre no válido." };
  if (input.status != null && !status) return { error: "Estado de compañía no válido." };
  if (parentCompany === undefined) return { error: "Empresa matriz no válida." };
  if (acquiredByCompany === undefined) return { error: "Compañía compradora no válida." };
  if (mergedWithCompany === undefined) return { error: "Compañía fusionada no válida." };
  if (predecessorCompany === undefined) return { error: "Compañía predecesora no válida." };
  if (successorCompany === undefined) return { error: "Compañía sucesora no válida." };
  const overlay = await readAdminEntitiesOverlay();
  if (staticIndex[slug] || overlay.companies[slug]) {
    return { error: `Ya existe la compañía «${slug}».` };
  }
  const entry = { slug, name, gameCount: 0, active: true };
  overlay.companies[slug] = entry;
  overlay.companyProfiles[slug] = companyProfileFromInput(
    slug,
    name,
    undefined,
    {
      ...input,
      parentCompany,
      acquiredByCompany,
      mergedWithCompany,
      predecessorCompany,
      successorCompany,
    },
    { foundedYear: foundedYear ?? null, closedYear: closedYear ?? null, status },
  );
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
    newsEnabled?: boolean;
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
  if (!["nintendo", "sony", "sega", "snk", "microsoft"].includes(manufacturer)) {
    return { error: "Fabricante no válido." };
  }
  const status = input.status ?? "closed";
  if (!["closed", "semi-closed", "open"].includes(status)) {
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
    newsEnabled: input.newsEnabled ?? false,
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

function restoreMetaCounter(key: "indexCompanies" | "indexGenres" | "platformCount", value: number | undefined) {
  if (typeof value !== "number") return;
  const meta = loadJson<Record<string, unknown>>(META_FILE, {});
  meta[key] = Math.max(0, value);
  saveJson(META_FILE, meta);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type AdminPlatformRow = Platform & { catalogGames: number };

function platformDuplicateKey(platform: Platform): string {
  const shortNameKey = normalizeSlug(platform.shortName || platform.name);
  return `${platform.manufacturer}:${shortNameKey}`;
}

function mergePlatformLists(staticPlatforms: Platform[], overlayPlatforms: Record<string, Platform>): Platform[] {
  const bySlug = new Map<string, Platform>();
  for (const platform of staticPlatforms) {
    bySlug.set(platform.slug, platform);
  }
  for (const platform of Object.values(overlayPlatforms)) {
    const current = bySlug.get(platform.slug);
    bySlug.set(platform.slug, current ? { ...current, ...platform } : platform);
  }

  const byDisplay = new Map<string, Platform>();
  for (const platform of bySlug.values()) {
    const key = platformDuplicateKey(platform);
    const current = byDisplay.get(key);
    if (!current) {
      byDisplay.set(key, platform);
      continue;
    }
    const currentGames = countCatalogGamesForPlatform(current.slug);
    const nextGames = countCatalogGamesForPlatform(platform.slug);
    if (nextGames > currentGames) byDisplay.set(key, platform);
  }

  return [...byDisplay.values()];
}

export async function listAdminPlatforms(): Promise<AdminPlatformRow[]> {
  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  const overlay = await readAdminEntitiesOverlay();
  return mergePlatformLists(platforms, overlay.platforms)
    .map((platform) => ({
      ...platform,
      active: overlay.active.platforms[platform.slug] ?? platform.active !== false,
      newsEnabled: overlay.news.platforms[platform.slug] ?? platform.newsEnabled === true,
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
  newsEnabled?: boolean;
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
  if (!["nintendo", "sony", "sega", "snk", "microsoft"].includes(manufacturer)) {
    return { error: "Fabricante no válido." };
  }

  const status = input.status ?? "closed";
  if (!["closed", "semi-closed", "open"].includes(status)) {
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
    newsEnabled: input.newsEnabled ?? false,
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
    newsEnabled?: boolean;
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
      newsEnabled: input.newsEnabled ?? current.newsEnabled ?? false,
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
    newsEnabled: input.newsEnabled ?? current.newsEnabled ?? false,
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

export type AdminCompanyRow = Pick<IndexEntry, "slug" | "name" | "gameCount" | "active"> & {
  history?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: CompanyProfileStatus;
  isParentCompany?: boolean;
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  mergedWithCompany?: CompanyRelation | null;
  predecessorCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type AdminIndexRow = Pick<IndexEntry, "slug" | "name" | "gameCount" | "active">;

export type AdminCompanyDuplicateCandidate = {
  slug: string;
  name: string;
  gameCount: number;
  active?: boolean;
  isParentCompany?: boolean;
  score: number;
  confidence: "alta" | "media" | "baja";
  reasons: string[];
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function simplifyCompanyName(value: string): string {
  const removable = new Set([
    "co",
    "company",
    "corp",
    "corporation",
    "inc",
    "incorporated",
    "interactive",
    "entertainment",
    "game",
    "games",
    "software",
    "studio",
    "studios",
    "ltd",
    "limited",
    "llc",
    "plc",
    "sa",
    "sarl",
    "gmbh",
    "kk",
    "europe",
    "europa",
    "usa",
    "us",
    "america",
    "japan",
    "jp",
    "the",
  ]);
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !removable.has(token))
    .join(" ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

function tokenOverlapScore(a: string, b: string): number {
  const left = new Set(a.split(/\s+/).filter(Boolean));
  const right = new Set(b.split(/\s+/).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function companySearchScore(
  entry: AdminIndexRow,
  query: string,
  aliases: string[],
): number {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return 1;

  const fields = [entry.name, entry.slug, ...aliases];
  const normalizedFields = fields.map(normalizeSearchText);
  const compactFields = fields.map(compactSearchText);
  const compactQuery = compactSearchText(query);

  let score = 0;
  for (const token of queryTokens) {
    let tokenScore = 0;
    for (const field of normalizedFields) {
      const words = field.split(/\s+/).filter(Boolean);
      if (field === normalizeSearchText(query)) tokenScore = Math.max(tokenScore, 120);
      if (words.includes(token)) tokenScore = Math.max(tokenScore, 100);
      if (words.some((word) => word.startsWith(token))) tokenScore = Math.max(tokenScore, token.length >= 3 ? 80 : 40);
      if (token.length >= 4 && field.includes(token)) tokenScore = Math.max(tokenScore, 45);
    }
    for (const field of compactFields) {
      if (field === compactQuery) tokenScore = Math.max(tokenScore, 110);
      if (compactQuery.length >= 4 && field.startsWith(compactQuery)) tokenScore = Math.max(tokenScore, 85);
      if (compactQuery.length >= 5 && field.includes(compactQuery)) tokenScore = Math.max(tokenScore, 50);
    }
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  return score + Math.min(entry.gameCount ?? 0, 500) / 1000;
}

function parseNullableYear(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < 1800 || parsed > 2100) return undefined;
  return parsed;
}

function normalizeCompanyStatus(value: unknown): CompanyProfileStatus | undefined {
  if (value === "active" || value === "defunct" || value === "subsidiary" || value === "unknown") return value;
  return undefined;
}

function normalizeCompanyRelation(value: unknown): CompanyRelation | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "object") return undefined;
  const relation = value as { slug?: unknown; name?: unknown };
  const slug = typeof relation.slug === "string" ? normalizeSlug(relation.slug) : "";
  const name = typeof relation.name === "string" ? relation.name.trim() : "";
  if (!slug && !name) return null;
  if (!slug || !name) return undefined;
  return { slug, name };
}

function profileForAdminCompany(
  entry: AdminIndexRow,
  profiles: Record<string, CompanyProfile>,
): AdminCompanyRow {
  const profile = profiles[entry.slug];
  return {
    ...entry,
    history: profile?.history ?? null,
    logoUrl: profile?.logoUrl ?? null,
    websiteUrl: profile?.websiteUrl ?? null,
    foundedYear: profile?.foundedYear ?? null,
    closedYear: profile?.closedYear ?? null,
    status: profile?.status ?? "unknown",
    isParentCompany: profile?.isParentCompany === true,
    parentCompany: profile?.parentCompany ?? null,
    acquiredByCompany: profile?.acquiredByCompany ?? null,
    mergedWithCompany: profile?.mergedWithCompany ?? null,
    predecessorCompany: profile?.predecessorCompany ?? null,
    successorCompany: profile?.successorCompany ?? null,
    seoTitle: profile?.seoMeta?.seoTitle ?? null,
    seoDescription: profile?.seoMeta?.seoDescription ?? null,
  };
}

function companyProfileFromInput(
  slug: string,
  name: string,
  currentProfile: CompanyProfile | undefined,
  input: {
    history?: string | null;
    logoUrl?: string | null;
    websiteUrl?: string | null;
    foundedYear?: number | null;
    closedYear?: number | null;
    status?: CompanyProfileStatus;
    isParentCompany?: boolean;
    parentCompany?: CompanyRelation | null;
    acquiredByCompany?: CompanyRelation | null;
    mergedWithCompany?: CompanyRelation | null;
    predecessorCompany?: CompanyRelation | null;
    successorCompany?: CompanyRelation | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  },
  parsed: {
    foundedYear: number | null;
    closedYear: number | null;
    status?: CompanyProfileStatus;
  },
): CompanyProfile {
  const nextProfile: CompanyProfile = {
    ...(currentProfile ?? {}),
    slug,
    name,
    history: input.history != null ? input.history.trim() || null : currentProfile?.history ?? null,
    logoUrl: input.logoUrl != null ? input.logoUrl.trim() || null : currentProfile?.logoUrl ?? null,
    websiteUrl: input.websiteUrl != null ? input.websiteUrl.trim() || null : currentProfile?.websiteUrl ?? null,
    foundedYear: parsed.foundedYear ?? currentProfile?.foundedYear ?? null,
    closedYear: parsed.closedYear ?? currentProfile?.closedYear ?? null,
    status: parsed.status ?? currentProfile?.status ?? "unknown",
    isParentCompany:
      typeof input.isParentCompany === "boolean" ? input.isParentCompany : currentProfile?.isParentCompany === true,
    parentCompany:
      input.parentCompany !== undefined ? input.parentCompany : currentProfile?.parentCompany ?? null,
    acquiredByCompany:
      input.acquiredByCompany !== undefined ? input.acquiredByCompany : currentProfile?.acquiredByCompany ?? null,
    mergedWithCompany:
      input.mergedWithCompany !== undefined ? input.mergedWithCompany : currentProfile?.mergedWithCompany ?? null,
    predecessorCompany:
      input.predecessorCompany !== undefined ? input.predecessorCompany : currentProfile?.predecessorCompany ?? null,
    successorCompany:
      input.successorCompany !== undefined ? input.successorCompany : currentProfile?.successorCompany ?? null,
    seoMeta: {
      ...(currentProfile?.seoMeta ?? {}),
      seoTitle: input.seoTitle != null ? input.seoTitle.trim() || undefined : currentProfile?.seoMeta?.seoTitle,
      seoDescription:
        input.seoDescription != null
          ? input.seoDescription.trim() || undefined
          : currentProfile?.seoMeta?.seoDescription,
    },
    generatedAt: new Date().toISOString(),
    method: "template",
  };
  if (!nextProfile.seoMeta?.seoTitle && !nextProfile.seoMeta?.seoDescription) {
    nextProfile.seoMeta = null;
  }
  return nextProfile;
}

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

export async function setAdminPlatformNewsEnabled(
  slug: string,
  newsEnabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = slug.trim();
  if (!trimmed) return { error: "Slug no válido." };

  const overlay = await readAdminEntitiesOverlay();
  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  const index = platforms.findIndex((platform) => platform.slug === trimmed);
  const exists = index >= 0 || Boolean(overlay.platforms[trimmed]);
  if (!exists) return { error: "Plataforma no encontrada." };

  if (canWriteCatalogFiles() && index >= 0) {
    platforms[index] = { ...platforms[index], newsEnabled };
    saveJson(PLATFORMS_FILE, platforms);
  }

  overlay.news.platforms[trimmed] = newsEnabled;
  if (overlay.platforms[trimmed]) overlay.platforms[trimmed].newsEnabled = newsEnabled;
  await writeAdminEntitiesOverlay(overlay);
  return { ok: true };
}

export async function listAdminCompanies(input?: {
  q?: string;
  limit?: number;
}): Promise<AdminCompanyRow[]> {
  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  const overlay = await readAdminEntitiesOverlay();
  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  const profiles = {
    ...loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {}),
    ...overlay.companyProfiles,
  };
  const q = input?.q?.trim() ?? "";
  const limit = Math.min(5000, Math.max(20, input?.limit ?? 150));
  const mergedEntries = new Map<string, AdminIndexRow>();
  for (const entry of Object.values(index).map(staticIndexRow)) {
    mergedEntries.set(entry.slug, entry);
  }
  for (const entry of Object.values(overlay.companies)) {
    mergedEntries.set(entry.slug, entry);
  }

  return [...mergedEntries.values()]
    .map((entry) => ({
      ...entry,
      active: overlay.active.companies[entry.slug] ?? entry.active !== false,
    }))
    .map((entry) => ({
      entry,
      score: q
        ? companySearchScore(entry, q, [
            ...(registry.entities?.[entry.slug]?.aliasNames ?? []),
            ...(registry.entities?.[entry.slug]?.aliasSlugs ?? []),
          ])
        : 1,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) =>
      q
        ? b.score - a.score || b.entry.gameCount - a.entry.gameCount || a.entry.name.localeCompare(b.entry.name, "es")
        : b.entry.gameCount - a.entry.gameCount || a.entry.name.localeCompare(b.entry.name, "es"),
    )
    .slice(0, limit)
    .map(({ entry }) =>
      profileForAdminCompany(
        {
          slug: entry.slug,
          name: entry.name,
          gameCount: entry.gameCount,
          active: entry.active,
        },
        profiles,
      ),
    );
}

export async function findAdminCompanyDuplicateCandidates(
  slug: string,
  input?: { limit?: number },
): Promise<
  | {
      ok: true;
      source: AdminCompanyRow;
      candidates: AdminCompanyDuplicateCandidate[];
    }
  | { error: string }
> {
  const sourceSlug = slug.trim();
  if (!sourceSlug) return { error: "Compañía no válida." };

  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  const overlay = await readAdminEntitiesOverlay();
  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  const profiles = {
    ...loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {}),
    ...overlay.companyProfiles,
  };
  const mergedEntries = new Map<string, AdminIndexRow>();
  for (const entry of Object.values(index).map(staticIndexRow)) {
    mergedEntries.set(entry.slug, {
      ...entry,
      active: overlay.active.companies[entry.slug] ?? entry.active !== false,
    });
  }
  for (const entry of Object.values(overlay.companies)) {
    mergedEntries.set(entry.slug, {
      ...entry,
      active: overlay.active.companies[entry.slug] ?? entry.active !== false,
    });
  }

  const source = mergedEntries.get(sourceSlug);
  if (!source) return { error: "Compañía no encontrada." };

  const sourceProfile = profiles[sourceSlug];
  const sourceEntity = registry.entities?.[sourceSlug];
  const limit = Math.min(30, Math.max(5, input?.limit ?? 12));
  const candidates: AdminCompanyDuplicateCandidate[] = [];

  for (const candidate of mergedEntries.values()) {
    if (candidate.slug === sourceSlug) continue;
    const candidateProfile = profiles[candidate.slug];
    const candidateEntity = registry.entities?.[candidate.slug];
    if (
      companyPairAlreadyControlled({
        leftSlug: sourceSlug,
        rightSlug: candidate.slug,
        leftProfile: sourceProfile,
        rightProfile: candidateProfile,
        leftEntity: sourceEntity,
        rightEntity: candidateEntity,
      })
    ) {
      continue;
    }

    const { score, reasons } = scoreCompanyDuplicateCandidate({
      source,
      candidate,
      sourceEntity,
      candidateEntity,
    });
    if (score < 70) continue;
    candidates.push({
      slug: candidate.slug,
      name: candidate.name,
      gameCount: candidate.gameCount,
      active: candidate.active,
      isParentCompany: candidateProfile?.isParentCompany === true,
      score,
      confidence: score >= 92 ? "alta" : score >= 82 ? "media" : "baja",
      reasons,
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.isParentCompany === true) - Number(a.isParentCompany === true) ||
      b.gameCount - a.gameCount ||
      a.name.localeCompare(b.name, "es"),
  );

  return {
    ok: true,
    source: profileForAdminCompany(source, profiles),
    candidates: candidates.slice(0, limit),
  };
}

export async function createAdminCompany(input: {
  slug?: string;
  name: string;
  history?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: CompanyProfileStatus;
  isParentCompany?: boolean;
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  mergedWithCompany?: CompanyRelation | null;
  predecessorCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}): Promise<{ ok: true; entry: AdminIndexRow } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre de la compañía." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  const foundedYear = parseNullableYear(input.foundedYear);
  const closedYear = parseNullableYear(input.closedYear);
  const status = normalizeCompanyStatus(input.status);
  const parentCompany = normalizeCompanyRelation(input.parentCompany);
  const acquiredByCompany = normalizeCompanyRelation(input.acquiredByCompany);
  const mergedWithCompany = normalizeCompanyRelation(input.mergedWithCompany);
  const predecessorCompany = normalizeCompanyRelation(input.predecessorCompany);
  const successorCompany = normalizeCompanyRelation(input.successorCompany);
  if (foundedYear === undefined) return { error: "Año de fundación no válido." };
  if (closedYear === undefined) return { error: "Año de cierre no válido." };
  if (input.status != null && !status) return { error: "Estado de compañía no válido." };
  if (parentCompany === undefined) return { error: "Empresa matriz no válida." };
  if (acquiredByCompany === undefined) return { error: "Compañía compradora no válida." };
  if (mergedWithCompany === undefined) return { error: "Compañía fusionada no válida." };
  if (predecessorCompany === undefined) return { error: "Compañía predecesora no válida." };
  if (successorCompany === undefined) return { error: "Compañía sucesora no válida." };

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

  const profiles = loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {});
  profiles[slug] = companyProfileFromInput(
    slug,
    name,
    undefined,
    {
      ...input,
      parentCompany,
      acquiredByCompany,
      mergedWithCompany,
      predecessorCompany,
      successorCompany,
    },
    { foundedYear: foundedYear ?? null, closedYear: closedYear ?? null, status },
  );
  saveJson(COMPANY_PROFILES_FILE, profiles);

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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function mergeGameIds(...groups: Array<string[] | undefined>): string[] {
  return uniqueStrings(groups.flatMap((group) => group ?? []));
}

function mapSnapshot(
  map: Record<string, string> | undefined,
  sourceSlug: string,
  targetSlug: string,
): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {
    [sourceSlug]: map?.[sourceSlug] ?? null,
    [targetSlug]: map?.[targetSlug] ?? null,
  };
  if (!map) return snapshot;
  for (const [key, value] of Object.entries(map)) {
    if (key === sourceSlug || key === targetSlug || value === sourceSlug || value === targetSlug) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function applyMapSnapshot(map: Record<string, string> | undefined, snapshot: Record<string, string | null>) {
  if (!map) return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) {
      delete map[key];
    } else {
      map[key] = value;
    }
  }
}

function snapshotCompanyRegistry(
  registry: CompanyEntitiesFile,
  sourceSlug: string,
  targetSlug: string,
): CompanyRegistrySnapshot {
  return {
    sourceEntity: registry.entities?.[sourceSlug] ? cloneJson(registry.entities[sourceSlug]) : undefined,
    targetEntity: registry.entities?.[targetSlug] ? cloneJson(registry.entities[targetSlug]) : undefined,
    slugToCanonical: mapSnapshot(registry.slugToCanonical, sourceSlug, targetSlug),
    wikidataToCanonical: mapSnapshot(registry.wikidataToCanonical, sourceSlug, targetSlug),
    museumPathToCanonical: mapSnapshot(registry.museumPathToCanonical, sourceSlug, targetSlug),
    normalizedToCanonical: mapSnapshot(registry.normalizedToCanonical, sourceSlug, targetSlug),
    statsEntities: registry.stats?.entities,
    generatedAt: registry.generatedAt,
  };
}

function restoreCompanyRegistrySnapshot(
  registry: CompanyEntitiesFile,
  sourceSlug: string,
  targetSlug: string,
  snapshot: CompanyRegistrySnapshot,
): CompanyEntitiesFile {
  registry.entities = registry.entities ?? {};
  if (snapshot.sourceEntity) registry.entities[sourceSlug] = cloneJson(snapshot.sourceEntity);
  else delete registry.entities[sourceSlug];
  if (snapshot.targetEntity) registry.entities[targetSlug] = cloneJson(snapshot.targetEntity);
  else delete registry.entities[targetSlug];

  registry.slugToCanonical = registry.slugToCanonical ?? {};
  registry.wikidataToCanonical = registry.wikidataToCanonical ?? {};
  registry.museumPathToCanonical = registry.museumPathToCanonical ?? {};
  registry.normalizedToCanonical = registry.normalizedToCanonical ?? {};
  applyMapSnapshot(registry.slugToCanonical, snapshot.slugToCanonical);
  applyMapSnapshot(registry.wikidataToCanonical, snapshot.wikidataToCanonical);
  applyMapSnapshot(registry.museumPathToCanonical, snapshot.museumPathToCanonical);
  applyMapSnapshot(registry.normalizedToCanonical, snapshot.normalizedToCanonical);

  registry.stats = registry.stats ?? {};
  if (typeof snapshot.statsEntities === "number") registry.stats.entities = snapshot.statsEntities;
  registry.generatedAt = snapshot.generatedAt ?? new Date().toISOString();
  return registry;
}

function snapshotCompanyOverlay(
  overlay: AdminEntitiesOverlay,
  sourceSlug: string,
  targetSlug: string,
): CompanyOverlaySnapshot {
  return {
    sourceCompany: overlay.companies[sourceSlug] ? cloneJson(overlay.companies[sourceSlug]) : undefined,
    targetCompany: overlay.companies[targetSlug] ? cloneJson(overlay.companies[targetSlug]) : undefined,
    sourceProfile: overlay.companyProfiles[sourceSlug] ? cloneJson(overlay.companyProfiles[sourceSlug]) : undefined,
    targetProfile: overlay.companyProfiles[targetSlug] ? cloneJson(overlay.companyProfiles[targetSlug]) : undefined,
    relatedProfiles: snapshotCompanyRelationProfiles(overlay.companyProfiles, sourceSlug, targetSlug),
    sourceActive: overlay.active.companies[sourceSlug],
    targetActive: overlay.active.companies[targetSlug],
  };
}

function restoreOverlayValue<T>(record: Record<string, T>, slug: string, value: T | undefined) {
  if (value === undefined) delete record[slug];
  else record[slug] = cloneJson(value);
}

function restoreCompanyOverlaySnapshot(
  overlay: AdminEntitiesOverlay,
  sourceSlug: string,
  targetSlug: string,
  snapshot: CompanyOverlaySnapshot,
): AdminEntitiesOverlay {
  restoreOverlayValue(overlay.companies, sourceSlug, snapshot.sourceCompany);
  restoreOverlayValue(overlay.companies, targetSlug, snapshot.targetCompany);
  restoreOverlayValue(overlay.companyProfiles, sourceSlug, snapshot.sourceProfile);
  restoreOverlayValue(overlay.companyProfiles, targetSlug, snapshot.targetProfile);
  for (const [slug, profile] of Object.entries(snapshot.relatedProfiles ?? {})) {
    restoreOverlayValue(overlay.companyProfiles, slug, profile);
  }
  restoreOverlayValue(overlay.active.companies, sourceSlug, snapshot.sourceActive);
  restoreOverlayValue(overlay.active.companies, targetSlug, snapshot.targetActive);
  return overlay;
}

const COMPANY_RELATION_FIELDS = [
  "parentCompany",
  "acquiredByCompany",
  "mergedWithCompany",
  "predecessorCompany",
  "successorCompany",
] as const satisfies readonly (keyof CompanyProfile)[];

function companyRelationReferencesSlug(relation: CompanyProfile[keyof CompanyProfile], slug: string): boolean {
  return Boolean(
    relation &&
      typeof relation === "object" &&
      "slug" in relation &&
      (relation as CompanyRelation).slug === slug,
  );
}

function companyProfileReferencesSlug(profile: CompanyProfile | undefined, slug: string): boolean {
  if (!profile) return false;
  return COMPANY_RELATION_FIELDS.some((field) => companyRelationReferencesSlug(profile[field], slug));
}

function companyPairAlreadyControlled(input: {
  leftSlug: string;
  rightSlug: string;
  leftProfile?: CompanyProfile;
  rightProfile?: CompanyProfile;
  leftEntity?: CompanyEntityRecord;
  rightEntity?: CompanyEntityRecord;
}): boolean {
  const { leftSlug, rightSlug, leftProfile, rightProfile, leftEntity, rightEntity } = input;
  if (companyProfileReferencesSlug(leftProfile, rightSlug)) return true;
  if (companyProfileReferencesSlug(rightProfile, leftSlug)) return true;
  if (leftEntity?.aliasSlugs?.includes(rightSlug) || rightEntity?.aliasSlugs?.includes(leftSlug)) return true;
  const leftAliases = new Set((leftEntity?.aliasNames ?? []).map(simplifyCompanyName).filter(Boolean));
  const rightAliases = new Set((rightEntity?.aliasNames ?? []).map(simplifyCompanyName).filter(Boolean));
  if (leftAliases.has(simplifyCompanyName(rightProfile?.name ?? ""))) return true;
  if (rightAliases.has(simplifyCompanyName(leftProfile?.name ?? ""))) return true;
  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) return true;
  }
  return false;
}

function scoreCompanyDuplicateCandidate(input: {
  source: AdminIndexRow;
  candidate: AdminIndexRow;
  sourceEntity?: CompanyEntityRecord;
  candidateEntity?: CompanyEntityRecord;
}): { score: number; reasons: string[] } {
  const { source, candidate, sourceEntity, candidateEntity } = input;
  const sourceNames = [source.name, source.slug, ...(sourceEntity?.aliasNames ?? []), ...(sourceEntity?.aliasSlugs ?? [])];
  const candidateNames = [
    candidate.name,
    candidate.slug,
    ...(candidateEntity?.aliasNames ?? []),
    ...(candidateEntity?.aliasSlugs ?? []),
  ];
  let score = 0;
  const reasons = new Set<string>();

  for (const leftRaw of sourceNames) {
    for (const rightRaw of candidateNames) {
      const left = simplifyCompanyName(leftRaw);
      const right = simplifyCompanyName(rightRaw);
      if (!left || !right) continue;
      const compactLeft = left.replace(/\s+/g, "");
      const compactRight = right.replace(/\s+/g, "");
      if (left === right || compactLeft === compactRight) {
        score = Math.max(score, 98);
        reasons.add("nombre normalizado casi idéntico");
      }
      if (
        compactLeft.length >= 4 &&
        compactRight.length >= 4 &&
        (compactLeft.startsWith(compactRight) || compactRight.startsWith(compactLeft))
      ) {
        score = Math.max(score, 88);
        reasons.add("un nombre parece variante corta/larga");
      }
      const ratio = similarityRatio(compactLeft, compactRight);
      if (ratio >= 0.86) {
        score = Math.max(score, Math.round(ratio * 90));
        reasons.add("texto muy parecido");
      }
      const overlap = tokenOverlapScore(left, right);
      if (overlap >= 0.66) {
        score = Math.max(score, Math.round(72 + overlap * 18));
        reasons.add("comparten palabras clave");
      }
    }
  }

  if (sourceEntity?.wikidataIds?.length && candidateEntity?.wikidataIds?.length) {
    const sourceWikidata = new Set(sourceEntity.wikidataIds);
    if (candidateEntity.wikidataIds.some((id) => sourceWikidata.has(id))) {
      score = Math.max(score, 99);
      reasons.add("mismo Wikidata");
    }
  }

  if (source.gameCount > 0 && candidate.gameCount > 0 && score >= 70) {
    reasons.add("ambas tienen juegos asociados");
  }

  return { score, reasons: [...reasons] };
}

function snapshotCompanyRelationProfiles(
  profiles: Record<string, CompanyProfile>,
  sourceSlug: string,
  targetSlug: string,
): Record<string, CompanyProfile> {
  const snapshot: Record<string, CompanyProfile> = {};
  for (const [slug, profile] of Object.entries(profiles)) {
    if (slug === sourceSlug || slug === targetSlug) continue;
    if (companyProfileReferencesSlug(profile, sourceSlug)) {
      snapshot[slug] = cloneJson(profile);
    }
  }
  return snapshot;
}

function remapCompanyRelation(
  relation: CompanyRelation | null | undefined,
  sourceSlug: string,
  targetSlug: string,
  targetName: string,
  ownerSlug: string,
): CompanyRelation | null | undefined {
  if (relation === undefined) return undefined;
  if (relation === null) return null;
  const next = relation.slug === sourceSlug ? { slug: targetSlug, name: targetName } : relation;
  return next.slug === ownerSlug ? null : next;
}

function firstUsefulCompanyRelation(
  targetRelation: CompanyRelation | null | undefined,
  sourceRelation: CompanyRelation | null | undefined,
  sourceSlug: string,
  targetSlug: string,
  targetName: string,
): CompanyRelation | null {
  const remappedTarget = remapCompanyRelation(targetRelation, sourceSlug, targetSlug, targetName, targetSlug);
  if (remappedTarget) return remappedTarget;
  const remappedSource = remapCompanyRelation(sourceRelation, sourceSlug, targetSlug, targetName, targetSlug);
  return remappedSource ?? null;
}

function remapCompanyProfileRelations(
  profile: CompanyProfile,
  sourceSlug: string,
  targetSlug: string,
  targetName: string,
): CompanyProfile {
  let next = profile;
  for (const field of COMPANY_RELATION_FIELDS) {
    const relation = remapCompanyRelation(
      next[field] as CompanyRelation | null | undefined,
      sourceSlug,
      targetSlug,
      targetName,
      next.slug,
    );
    if (relation !== next[field]) {
      next = { ...next, [field]: relation ?? null };
    }
  }
  return next;
}

function detailReferencesCompany(value: unknown, slug: string): boolean {
  if (!value || typeof value !== "object") return false;
  const detail = value as {
    developer?: { slug?: string } | null;
    publisher?: { slug?: string } | null;
    developerSlug?: string;
    publisherSlug?: string;
  };
  return (
    detail.developer?.slug === slug ||
    detail.publisher?.slug === slug ||
    detail.developerSlug === slug ||
    detail.publisherSlug === slug
  );
}

function snapshotCompanyDetails(
  details: Record<string, unknown>,
  source: IndexEntry,
  target: IndexEntry,
): Record<string, unknown> {
  const ids = new Set([
    ...(source.gameIds ?? []),
    ...(source.asDeveloper ?? []),
    ...(source.asPublisher ?? []),
    ...(target.gameIds ?? []),
    ...(target.asDeveloper ?? []),
    ...(target.asPublisher ?? []),
  ]);
  for (const [gameId, detail] of Object.entries(details)) {
    if (detailReferencesCompany(detail, source.slug)) ids.add(gameId);
  }
  const snapshot: Record<string, unknown> = {};
  for (const gameId of ids) {
    if (gameId in details) snapshot[gameId] = cloneJson(details[gameId]);
  }
  return snapshot;
}

function restoreCompanyDetailsSnapshot(details: Record<string, unknown>, snapshot: Record<string, unknown>) {
  for (const [gameId, detail] of Object.entries(snapshot)) {
    details[gameId] = cloneJson(detail);
  }
}

function appendCompanyMergeLog(entry: CompanyMergeLogEntry) {
  const log = loadJson<CompanyMergeLogEntry[]>(COMPANY_MERGE_LOG_FILE, []);
  log.push(entry);
  saveJson(COMPANY_MERGE_LOG_FILE, log);
}

function markCompanyMergeLogReverted(entryId: string) {
  const log = loadJson<CompanyMergeLogEntry[]>(COMPANY_MERGE_LOG_FILE, []);
  const index = log.findIndex((entry) => entry.id === entryId);
  if (index < 0) return;
  log[index] = { ...log[index], revertedAt: new Date().toISOString() };
  saveJson(COMPANY_MERGE_LOG_FILE, log);
}

function rebuildByPlatform(gameIds: string[], fallback: Record<string, number> = {}): Record<string, number> {
  const catalogById = new Map(listedCatalog.map((game) => [game.id, game]));
  const byPlatform: Record<string, number> = {};
  for (const gameId of gameIds) {
    const platformSlug = catalogById.get(gameId)?.platformSlug;
    if (!platformSlug) continue;
    byPlatform[platformSlug] = (byPlatform[platformSlug] ?? 0) + 1;
  }
  return Object.keys(byPlatform).length > 0 ? byPlatform : fallback;
}

function mergeCompanyIndexEntry(target: IndexEntry, source: IndexEntry): IndexEntry {
  const gameIds = mergeGameIds(target.gameIds, source.gameIds, target.asDeveloper, source.asDeveloper, target.asPublisher, source.asPublisher);
  const asDeveloper = mergeGameIds(target.asDeveloper, source.asDeveloper);
  const asPublisher = mergeGameIds(target.asPublisher, source.asPublisher);
  return {
    ...target,
    gameIds,
    byPlatform: rebuildByPlatform(gameIds, { ...source.byPlatform, ...target.byPlatform }),
    gameCount: gameIds.length,
    asDeveloper,
    asPublisher,
    aliasSlugs: uniqueStrings([...(target.aliasSlugs ?? []), source.slug, ...(source.aliasSlugs ?? [])]),
    aliasNames: uniqueStrings([...(target.aliasNames ?? []), source.name, ...(source.aliasNames ?? [])]),
  };
}

function mergeCompanyEntityRegistry(
  registry: CompanyEntitiesFile,
  source: IndexEntry,
  target: IndexEntry,
): CompanyEntitiesFile {
  registry.entities = registry.entities ?? {};
  registry.slugToCanonical = registry.slugToCanonical ?? {};

  const sourceEntity = registry.entities[source.slug] ?? {
    slug: source.slug,
    name: source.name,
    mergeMethod: "manual",
    aliasSlugs: [],
    aliasNames: [],
    wikidataIds: [],
    museumPaths: [],
  };
  const targetEntity = registry.entities[target.slug] ?? {
    slug: target.slug,
    name: target.name,
    mergeMethod: "manual",
    aliasSlugs: [],
    aliasNames: [],
    wikidataIds: [],
    museumPaths: [],
  };

  registry.entities[target.slug] = {
    ...targetEntity,
    slug: target.slug,
    name: target.name,
    mergeMethod: targetEntity.mergeMethod || "manual",
    aliasSlugs: uniqueStrings([
      ...(targetEntity.aliasSlugs ?? []),
      source.slug,
      ...(source.aliasSlugs ?? []),
      ...(sourceEntity.aliasSlugs ?? []),
    ]),
    aliasNames: uniqueStrings([
      ...(targetEntity.aliasNames ?? []),
      source.name,
      ...(source.aliasNames ?? []),
      ...(sourceEntity.aliasNames ?? []),
    ]),
    wikidataIds: uniqueStrings([
      ...(targetEntity.wikidataIds ?? []),
      source.wikidataId ?? undefined,
      ...(sourceEntity.wikidataIds ?? []),
    ]),
    museumPaths: uniqueStrings([
      ...(targetEntity.museumPaths ?? []),
      target.museumPath,
      source.museumPath,
      ...(sourceEntity.museumPaths ?? []),
    ]),
  };
  delete registry.entities[source.slug];

  for (const [key, value] of Object.entries(registry.slugToCanonical)) {
    if (value === source.slug) registry.slugToCanonical[key] = target.slug;
  }
  registry.slugToCanonical[source.slug] = target.slug;
  registry.slugToCanonical[target.slug] = target.slug;

  for (const map of [
    registry.wikidataToCanonical,
    registry.museumPathToCanonical,
    registry.normalizedToCanonical,
  ]) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      if (value === source.slug) map[key] = target.slug;
    }
  }

  if (registry.stats) registry.stats.entities = Math.max(0, (registry.stats.entities ?? 1) - 1);
  registry.generatedAt = new Date().toISOString();
  return registry;
}

function mergeCompanyProfiles(
  profiles: Record<string, CompanyProfile>,
  source: IndexEntry,
  target: IndexEntry,
): Record<string, CompanyProfile> {
  const sourceProfile = profiles[source.slug];
  const targetProfile = profiles[target.slug];
  const now = new Date().toISOString();
  const merged: CompanyProfile = {
    ...(sourceProfile ?? {}),
    ...(targetProfile ?? {}),
    slug: target.slug,
    name: target.name,
    wikidataId: targetProfile?.wikidataId ?? sourceProfile?.wikidataId ?? target.wikidataId ?? source.wikidataId ?? null,
    logoUrl: targetProfile?.logoUrl ?? sourceProfile?.logoUrl ?? null,
    websiteUrl: targetProfile?.websiteUrl ?? sourceProfile?.websiteUrl ?? null,
    foundedYear: targetProfile?.foundedYear ?? sourceProfile?.foundedYear ?? null,
    closedYear: targetProfile?.closedYear ?? sourceProfile?.closedYear ?? null,
    status: targetProfile?.status ?? sourceProfile?.status ?? "unknown",
    isParentCompany: targetProfile?.isParentCompany === true || sourceProfile?.isParentCompany === true,
    parentCompany: firstUsefulCompanyRelation(
      targetProfile?.parentCompany,
      sourceProfile?.parentCompany,
      source.slug,
      target.slug,
      target.name,
    ),
    acquiredByCompany: firstUsefulCompanyRelation(
      targetProfile?.acquiredByCompany,
      sourceProfile?.acquiredByCompany,
      source.slug,
      target.slug,
      target.name,
    ),
    mergedWithCompany: firstUsefulCompanyRelation(
      targetProfile?.mergedWithCompany,
      sourceProfile?.mergedWithCompany,
      source.slug,
      target.slug,
      target.name,
    ),
    predecessorCompany: firstUsefulCompanyRelation(
      targetProfile?.predecessorCompany,
      sourceProfile?.predecessorCompany,
      source.slug,
      target.slug,
      target.name,
    ),
    successorCompany: firstUsefulCompanyRelation(
      targetProfile?.successorCompany,
      sourceProfile?.successorCompany,
      source.slug,
      target.slug,
      target.name,
    ),
    history: targetProfile?.history ?? sourceProfile?.history ?? null,
    seoMeta: targetProfile?.seoMeta ?? sourceProfile?.seoMeta ?? null,
    sources: {
      ...(sourceProfile?.sources ?? {}),
      ...(targetProfile?.sources ?? {}),
    },
    generatedAt: now,
    method: targetProfile?.method ?? sourceProfile?.method ?? "template",
  };
  if (Object.keys(merged.sources ?? {}).length === 0) delete merged.sources;
  profiles[target.slug] = merged;
  delete profiles[source.slug];
  for (const [slug, profile] of Object.entries(profiles)) {
    if (slug === target.slug) continue;
    profiles[slug] = remapCompanyProfileRelations(profile, source.slug, target.slug, target.name);
  }
  return profiles;
}

function mergeCompanySlugInDetails(
  details: Record<string, unknown>,
  oldSlug: string,
  newSlug: string,
  newName: string,
): { updatedGames: number; developerUpdates: number; publisherUpdates: number } {
  const updatedGameIds = new Set<string>();
  let developerUpdates = 0;
  let publisherUpdates = 0;

  for (const [gameId, value] of Object.entries(details)) {
    if (!value || typeof value !== "object") continue;
    const detail = value as {
      developer?: { slug?: string; name?: string } | null;
      publisher?: { slug?: string; name?: string } | null;
      developerSlug?: string;
      developerName?: string;
      publisherSlug?: string;
      publisherName?: string;
    };
    if (detail.developer?.slug === oldSlug) {
      detail.developer.slug = newSlug;
      detail.developer.name = newName;
      developerUpdates += 1;
      updatedGameIds.add(gameId);
    }
    if (detail.developerSlug === oldSlug) {
      detail.developerSlug = newSlug;
      detail.developerName = newName;
      developerUpdates += 1;
      updatedGameIds.add(gameId);
    }
    if (detail.publisher?.slug === oldSlug) {
      detail.publisher.slug = newSlug;
      detail.publisher.name = newName;
      publisherUpdates += 1;
      updatedGameIds.add(gameId);
    }
    if (detail.publisherSlug === oldSlug) {
      detail.publisherSlug = newSlug;
      detail.publisherName = newName;
      publisherUpdates += 1;
      updatedGameIds.add(gameId);
    }
  }

  return { updatedGames: updatedGameIds.size, developerUpdates, publisherUpdates };
}

export async function mergeAdminCompany(
  sourceSlug: string,
  targetSlug: string,
): Promise<
  | {
      ok: true;
      sourceSlug: string;
      targetSlug: string;
      targetName: string;
      updatedGames: number;
      developerUpdates: number;
      publisherUpdates: number;
      mergedGameCount: number;
      protectedParentCompany?: boolean;
    }
  | { error: string }
> {
  let sourceKey = sourceSlug.trim();
  let targetKey = targetSlug.trim();
  if (!sourceKey || !targetKey) return { error: "Faltan compañías para fusionar." };
  if (sourceKey === targetKey) return { error: "El origen y el destino son la misma compañía." };
  const writable = assertWritable();
  if ("error" in writable) {
    return { error: "La fusión necesita escritura real del catálogo. Hazla en local o con escritura admin activada." };
  }

  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  const profiles = loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {});
  const sourceIsParentCompany = profiles[sourceKey]?.isParentCompany === true;
  const targetIsParentCompany = profiles[targetKey]?.isParentCompany === true;
  if (sourceIsParentCompany && targetIsParentCompany) {
    return { error: "No se pueden fusionar dos compañías marcadas como empresa madre." };
  }
  const protectedParentCompany = sourceIsParentCompany && !targetIsParentCompany;
  if (protectedParentCompany) {
    [sourceKey, targetKey] = [targetKey, sourceKey];
  }

  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  const source = index[sourceKey];
  const target = index[targetKey];
  if (!source) return { error: "Compañía origen no encontrada." };
  if (!target) return { error: "Compañía destino no encontrada." };

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  const overlay = await readAdminEntitiesOverlay();
  const meta = loadJson<Record<string, unknown>>(META_FILE, {});
  const metaIndexCompanies = typeof meta.indexCompanies === "number" ? meta.indexCompanies : undefined;
  const snapshot = {
    sourceIndex: cloneJson(source),
    targetIndex: cloneJson(target),
    sourceProfile: profiles[sourceKey] ? cloneJson(profiles[sourceKey]) : undefined,
    targetProfile: profiles[targetKey] ? cloneJson(profiles[targetKey]) : undefined,
    registry: snapshotCompanyRegistry(registry, sourceKey, targetKey),
    overlay: snapshotCompanyOverlay(overlay, sourceKey, targetKey),
    relatedProfiles: snapshotCompanyRelationProfiles(profiles, sourceKey, targetKey),
    details: snapshotCompanyDetails(details, source, target),
    metaIndexCompanies,
  };

  const mergedTarget = mergeCompanyIndexEntry(target, source);
  index[targetKey] = mergedTarget;
  delete index[sourceKey];
  saveJson(COMPANIES_INDEX_FILE, index);

  saveJson(COMPANY_ENTITIES_FILE, mergeCompanyEntityRegistry(registry, source, mergedTarget));

  const mergedProfiles = mergeCompanyProfiles(profiles, source, mergedTarget);
  saveJson(COMPANY_PROFILES_FILE, mergedProfiles);

  const detailUpdates = mergeCompanySlugInDetails(details, sourceKey, targetKey, mergedTarget.name);
  saveJson(DETAILS_FILE, details);

  delete overlay.active.companies[sourceKey];
  delete overlay.companies[sourceKey];
  delete overlay.companyProfiles[sourceKey];
  overlay.companies[targetKey] = {
    slug: mergedTarget.slug,
    name: mergedTarget.name,
    gameCount: mergedTarget.gameCount,
    active: mergedTarget.active,
  };
  if (mergedProfiles[targetKey]) overlay.companyProfiles[targetKey] = cloneJson(mergedProfiles[targetKey]);
  for (const slug of Object.keys(snapshot.overlay.relatedProfiles ?? {})) {
    if (mergedProfiles[slug]) overlay.companyProfiles[slug] = cloneJson(mergedProfiles[slug]);
  }
  await writeAdminEntitiesOverlay(overlay);

  bumpMetaCounter("indexCompanies", -1);

  appendCompanyMergeLog({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sourceSlug: sourceKey,
    sourceName: source.name,
    targetSlug: targetKey,
    targetName: mergedTarget.name,
    snapshot,
    result: {
      updatedGames: detailUpdates.updatedGames,
      developerUpdates: detailUpdates.developerUpdates,
      publisherUpdates: detailUpdates.publisherUpdates,
      mergedGameCount: mergedTarget.gameCount,
    },
  });

  return {
    ok: true,
    sourceSlug: sourceKey,
    targetSlug: targetKey,
    targetName: mergedTarget.name,
    updatedGames: detailUpdates.updatedGames,
    developerUpdates: detailUpdates.developerUpdates,
    publisherUpdates: detailUpdates.publisherUpdates,
    mergedGameCount: mergedTarget.gameCount,
    protectedParentCompany,
  };
}

export async function revertLastAdminCompanyMerge(
  targetSlug: string,
): Promise<
  | {
      ok: true;
      sourceSlug: string;
      sourceName: string;
      targetSlug: string;
      targetName: string;
      restoredGames: number;
    }
  | { error: string }
> {
  const targetKey = targetSlug.trim();
  if (!targetKey) return { error: "Falta la compañía destino." };
  const writable = assertWritable();
  if ("error" in writable) {
    return { error: "Deshacer una fusión necesita escritura real del catálogo." };
  }

  const log = loadJson<CompanyMergeLogEntry[]>(COMPANY_MERGE_LOG_FILE, []);
  const entry = [...log]
    .reverse()
    .find((candidate) => candidate.targetSlug === targetKey && !candidate.revertedAt);
  if (!entry) return { error: "No hay ninguna fusión reciente sin deshacer para esta compañía." };

  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  index[entry.sourceSlug] = cloneJson(entry.snapshot.sourceIndex);
  index[entry.targetSlug] = cloneJson(entry.snapshot.targetIndex);
  saveJson(COMPANIES_INDEX_FILE, index);

  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  saveJson(
    COMPANY_ENTITIES_FILE,
    restoreCompanyRegistrySnapshot(registry, entry.sourceSlug, entry.targetSlug, entry.snapshot.registry),
  );

  const profiles = loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {});
  if (entry.snapshot.sourceProfile) profiles[entry.sourceSlug] = cloneJson(entry.snapshot.sourceProfile);
  else delete profiles[entry.sourceSlug];
  if (entry.snapshot.targetProfile) profiles[entry.targetSlug] = cloneJson(entry.snapshot.targetProfile);
  else delete profiles[entry.targetSlug];
  for (const [slug, profile] of Object.entries(entry.snapshot.relatedProfiles ?? {})) {
    profiles[slug] = cloneJson(profile);
  }
  saveJson(COMPANY_PROFILES_FILE, profiles);

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  restoreCompanyDetailsSnapshot(details, entry.snapshot.details);
  saveJson(DETAILS_FILE, details);

  const overlay = await readAdminEntitiesOverlay();
  await writeAdminEntitiesOverlay(
    restoreCompanyOverlaySnapshot(overlay, entry.sourceSlug, entry.targetSlug, entry.snapshot.overlay),
  );

  restoreMetaCounter("indexCompanies", entry.snapshot.metaIndexCompanies);
  markCompanyMergeLogReverted(entry.id);

  return {
    ok: true,
    sourceSlug: entry.sourceSlug,
    sourceName: entry.sourceName,
    targetSlug: entry.targetSlug,
    targetName: entry.targetName,
    restoredGames: Object.keys(entry.snapshot.details).length,
  };
}

export async function updateAdminCompany(
  slug: string,
  input: {
    name?: string;
    newSlug?: string;
    history?: string | null;
    logoUrl?: string | null;
    websiteUrl?: string | null;
    foundedYear?: number | null;
    closedYear?: number | null;
    status?: CompanyProfileStatus;
    isParentCompany?: boolean;
    parentCompany?: CompanyRelation | null;
    acquiredByCompany?: CompanyRelation | null;
    mergedWithCompany?: CompanyRelation | null;
    predecessorCompany?: CompanyRelation | null;
    successorCompany?: CompanyRelation | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  },
): Promise<{ ok: true; entry: AdminIndexRow; slug: string } | { error: string }> {
  const currentSlug = slug.trim();
  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  const foundedYear = parseNullableYear(input.foundedYear);
  const closedYear = parseNullableYear(input.closedYear);
  const status = normalizeCompanyStatus(input.status);
  const parentCompany = normalizeCompanyRelation(input.parentCompany);
  const acquiredByCompany = normalizeCompanyRelation(input.acquiredByCompany);
  const mergedWithCompany = normalizeCompanyRelation(input.mergedWithCompany);
  const predecessorCompany = normalizeCompanyRelation(input.predecessorCompany);
  const successorCompany = normalizeCompanyRelation(input.successorCompany);
  if (foundedYear === undefined) return { error: "Año de fundación no válido." };
  if (closedYear === undefined) return { error: "Año de cierre no válido." };
  if (input.status != null && !status) return { error: "Estado de compañía no válido." };
  if (parentCompany === undefined) return { error: "Empresa matriz no válida." };
  if (acquiredByCompany === undefined) return { error: "Compañía compradora no válida." };
  if (mergedWithCompany === undefined) return { error: "Compañía fusionada no válida." };
  if (predecessorCompany === undefined) return { error: "Compañía predecesora no válida." };
  if (successorCompany === undefined) return { error: "Compañía sucesora no válida." };
  const relationsInput = {
    ...input,
    ...(input.parentCompany !== undefined ? { parentCompany } : {}),
    ...(input.acquiredByCompany !== undefined ? { acquiredByCompany } : {}),
    ...(input.mergedWithCompany !== undefined ? { mergedWithCompany } : {}),
    ...(input.predecessorCompany !== undefined ? { predecessorCompany } : {}),
    ...(input.successorCompany !== undefined ? { successorCompany } : {}),
  };
  if (!canWriteCatalogFiles()) {
    const overlay = await readAdminEntitiesOverlay();
    const staticEntry = index[currentSlug] ? staticIndexRow(index[currentSlug]) : null;
    const entry = overlay.companies[currentSlug] ?? staticEntry;
    if (!entry) return { error: "Compañía no encontrada." };

    const name = input.name?.trim() || entry.name;
    const nextSlug = input.newSlug ? normalizeSlug(input.newSlug) : currentSlug;
    if (!nextSlug) return { error: "Slug no válido." };
    if (nextSlug !== currentSlug && staticEntry && !overlay.companies[currentSlug]) {
      return {
        error:
          "No se puede cambiar el slug de una compañía base desde producción. Cambia solo textos/perfil o haz el rename en local.",
      };
    }
    if (nextSlug !== currentSlug && (index[nextSlug] || overlay.companies[nextSlug])) {
      return { error: `Ya existe la compañía «${nextSlug}».` };
    }

    const updated = {
      slug: nextSlug,
      name,
      gameCount: entry.gameCount,
      active: overlay.active.companies[currentSlug] ?? entry.active !== false,
    };
    if (nextSlug !== currentSlug) delete overlay.companies[currentSlug];
    overlay.companies[nextSlug] = updated;
    const currentProfile = overlay.companyProfiles[currentSlug];
    if (nextSlug !== currentSlug) delete overlay.companyProfiles[currentSlug];
    overlay.companyProfiles[nextSlug] = companyProfileFromInput(
      nextSlug,
      name,
      currentProfile,
      relationsInput,
      { foundedYear: foundedYear ?? null, closedYear: closedYear ?? null, status },
    );
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

  const profiles = loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {});
  const currentProfile = profiles[currentSlug];
  const nextProfile = companyProfileFromInput(
    nextSlug,
    name,
    currentProfile,
    relationsInput,
    { foundedYear: foundedYear ?? null, closedYear: closedYear ?? null, status },
  );
  if (nextSlug !== currentSlug) delete profiles[currentSlug];
  profiles[nextSlug] = nextProfile;
  saveJson(COMPANY_PROFILES_FILE, profiles);

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
