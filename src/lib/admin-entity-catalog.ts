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

export async function readAdminCompanyProfilesOverlay(): Promise<Record<string, CompanyProfile>> {
  const overlay = await readAdminEntitiesOverlay();
  return overlay.companyProfiles;
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
  input: {
    slug?: string;
    name: string;
    history?: string | null;
    logoUrl?: string | null;
    websiteUrl?: string | null;
    foundedYear?: number | null;
    closedYear?: number | null;
    status?: CompanyProfileStatus;
    parentCompany?: CompanyRelation | null;
    acquiredByCompany?: CompanyRelation | null;
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
  const successorCompany = normalizeCompanyRelation(input.successorCompany);
  if (foundedYear === undefined) return { error: "Año de fundación no válido." };
  if (closedYear === undefined) return { error: "Año de cierre no válido." };
  if (input.status != null && !status) return { error: "Estado de compañía no válido." };
  if (parentCompany === undefined) return { error: "Empresa matriz no válida." };
  if (acquiredByCompany === undefined) return { error: "Compañía compradora no válida." };
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

export type AdminPlatformRow = Platform & { catalogGames: number };

export async function listAdminPlatforms(): Promise<AdminPlatformRow[]> {
  const platforms = loadJson<Platform[]>(PLATFORMS_FILE, []);
  const overlay = await readAdminEntitiesOverlay();
  return [...platforms, ...Object.values(overlay.platforms)]
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
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
  successorCompany?: CompanyRelation | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type AdminIndexRow = Pick<IndexEntry, "slug" | "name" | "gameCount" | "active">;

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
    parentCompany: profile?.parentCompany ?? null,
    acquiredByCompany: profile?.acquiredByCompany ?? null,
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
    parentCompany?: CompanyRelation | null;
    acquiredByCompany?: CompanyRelation | null;
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
    parentCompany:
      input.parentCompany !== undefined ? input.parentCompany : currentProfile?.parentCompany ?? null,
    acquiredByCompany:
      input.acquiredByCompany !== undefined ? input.acquiredByCompany : currentProfile?.acquiredByCompany ?? null,
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
  const limit = Math.min(500, Math.max(20, input?.limit ?? 150));
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

export async function createAdminCompany(input: {
  slug?: string;
  name: string;
  history?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  foundedYear?: number | null;
  closedYear?: number | null;
  status?: CompanyProfileStatus;
  parentCompany?: CompanyRelation | null;
  acquiredByCompany?: CompanyRelation | null;
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
  const successorCompany = normalizeCompanyRelation(input.successorCompany);
  if (foundedYear === undefined) return { error: "Año de fundación no válido." };
  if (closedYear === undefined) return { error: "Año de cierre no válido." };
  if (input.status != null && !status) return { error: "Estado de compañía no válido." };
  if (parentCompany === undefined) return { error: "Empresa matriz no válida." };
  if (acquiredByCompany === undefined) return { error: "Compañía compradora no válida." };
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
    }
  | { error: string }
> {
  const sourceKey = sourceSlug.trim();
  const targetKey = targetSlug.trim();
  if (!sourceKey || !targetKey) return { error: "Faltan compañías para fusionar." };
  if (sourceKey === targetKey) return { error: "El origen y el destino son la misma compañía." };
  const writable = assertWritable();
  if ("error" in writable) {
    return { error: "La fusión necesita escritura real del catálogo. Hazla en local o con escritura admin activada." };
  }

  const index = loadJson<Record<string, IndexEntry>>(COMPANIES_INDEX_FILE, {});
  const source = index[sourceKey];
  const target = index[targetKey];
  if (!source) return { error: "Compañía origen no encontrada." };
  if (!target) return { error: "Compañía destino no encontrada." };

  const mergedTarget = mergeCompanyIndexEntry(target, source);
  index[targetKey] = mergedTarget;
  delete index[sourceKey];
  saveJson(COMPANIES_INDEX_FILE, index);

  const registry = loadJson<CompanyEntitiesFile>(COMPANY_ENTITIES_FILE, { entities: {} });
  saveJson(COMPANY_ENTITIES_FILE, mergeCompanyEntityRegistry(registry, source, mergedTarget));

  const profiles = loadJson<Record<string, CompanyProfile>>(COMPANY_PROFILES_FILE, {});
  saveJson(COMPANY_PROFILES_FILE, mergeCompanyProfiles(profiles, source, mergedTarget));

  const details = loadJson<Record<string, unknown>>(DETAILS_FILE, {});
  const detailUpdates = mergeCompanySlugInDetails(details, sourceKey, targetKey, mergedTarget.name);
  saveJson(DETAILS_FILE, details);

  const overlay = await readAdminEntitiesOverlay();
  delete overlay.active.companies[sourceKey];
  delete overlay.companies[sourceKey];
  await writeAdminEntitiesOverlay(overlay);

  bumpMetaCounter("indexCompanies", -1);

  return {
    ok: true,
    sourceSlug: sourceKey,
    targetSlug: targetKey,
    targetName: mergedTarget.name,
    updatedGames: detailUpdates.updatedGames,
    developerUpdates: detailUpdates.developerUpdates,
    publisherUpdates: detailUpdates.publisherUpdates,
    mergedGameCount: mergedTarget.gameCount,
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
    parentCompany?: CompanyRelation | null;
    acquiredByCompany?: CompanyRelation | null;
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
  const successorCompany = normalizeCompanyRelation(input.successorCompany);
  if (foundedYear === undefined) return { error: "Año de fundación no válido." };
  if (closedYear === undefined) return { error: "Año de cierre no válido." };
  if (input.status != null && !status) return { error: "Estado de compañía no válido." };
  if (parentCompany === undefined) return { error: "Empresa matriz no válida." };
  if (acquiredByCompany === undefined) return { error: "Compañía compradora no válida." };
  if (successorCompany === undefined) return { error: "Compañía sucesora no válida." };
  const relationsInput = {
    ...input,
    ...(input.parentCompany !== undefined ? { parentCompany } : {}),
    ...(input.acquiredByCompany !== undefined ? { acquiredByCompany } : {}),
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
