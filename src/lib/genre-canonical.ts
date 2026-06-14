import genreGroupsData from "../../data/genre-groups.json";
import genreEntitiesData from "../../data/index/genre-entities.json";
import { normalizeGenreKey, pickGenreDisplayName } from "./genre-normalize";
import type { DetailEntity, IndexEntry } from "./types";

export type GenreMergeMethod = "manual" | "museum" | "normalized" | "slug";

export type GenreEntityRecord = {
  slug: string;
  name: string;
  mergeMethod: GenreMergeMethod;
  aliasSlugs: string[];
  aliasNames: string[];
  museumPaths: string[];
};

type GenreGroup = {
  slug: string;
  name: string;
  exactSlugs?: string[];
  slugPrefixes?: string[];
};

type GenreEntitiesFile = {
  entities: Record<string, GenreEntityRecord>;
  slugToCanonical: Record<string, string>;
  museumPathToCanonical: Record<string, string>;
  normalizedToCanonical: Record<string, string>;
};

const groupsFile = genreGroupsData as { groups: GenreGroup[] };
const registryFile = genreEntitiesData as GenreEntitiesFile;

const manualSlugToCanonical = new Map<string, { slug: string; name: string }>();
const prefixRules: { prefix: string; canonical: { slug: string; name: string } }[] = [];

for (const group of groupsFile.groups) {
  const canonical = { slug: group.slug, name: group.name };
  manualSlugToCanonical.set(group.slug, canonical);
  for (const exact of group.exactSlugs ?? []) {
    manualSlugToCanonical.set(exact, canonical);
  }
  for (const prefix of group.slugPrefixes ?? []) {
    prefixRules.push({ prefix, canonical });
    manualSlugToCanonical.set(prefix, canonical);
  }
}

prefixRules.sort((a, b) => b.prefix.length - a.prefix.length);

const slugToCanonical = new Map(Object.entries(registryFile.slugToCanonical ?? {}));
const museumPathToCanonical = new Map(Object.entries(registryFile.museumPathToCanonical ?? {}));
const normalizedToCanonical = new Map(Object.entries(registryFile.normalizedToCanonical ?? {}));
const entityRecords = registryFile.entities ?? {};

function manualCanonicalSlug(slug: string): string | null {
  const direct = manualSlugToCanonical.get(slug);
  if (direct) return direct.slug;
  for (const { prefix, canonical } of prefixRules) {
    if (slug === prefix || slug.startsWith(`${prefix}-`)) {
      return canonical.slug;
    }
  }
  return null;
}

export function resolveCanonicalGenreSlug(
  slug: string,
  hints?: { name?: string; museumPath?: string | null },
): string {
  if (!slug) return slug;

  const manual = manualCanonicalSlug(slug);
  if (manual) return manual;

  const mapped = slugToCanonical.get(slug);
  if (mapped) return mapped;

  if (hints?.museumPath) {
    const mp = museumPathToCanonical.get(hints.museumPath);
    if (mp) return mp;
  }

  const name = hints?.name;
  if (name) {
    const key = normalizeGenreKey(name);
    if (key.length >= 3) {
      const normalized = normalizedToCanonical.get(key);
      if (normalized) return normalized;
    }
  }

  for (const { prefix, canonical } of prefixRules) {
    if (slug === prefix || slug.startsWith(`${prefix}-`)) {
      return canonical.slug;
    }
  }

  return slug;
}

export function resolveCanonicalGenre(
  slug: string,
  name?: string,
  hints?: { museumPath?: string | null },
): { slug: string; name: string } {
  const canonicalSlug = resolveCanonicalGenreSlug(slug, { name, ...hints });
  const manual = manualSlugToCanonical.get(canonicalSlug);
  const record = entityRecords[canonicalSlug];
  return {
    slug: canonicalSlug,
    name: manual?.name ?? record?.name ?? pickGenreDisplayName([name ?? "", slug]) ?? name ?? slug,
  };
}

export function resolveCanonicalGenreEntity(entity: DetailEntity): { slug: string; name: string } {
  return resolveCanonicalGenre(entity.slug, entity.name, { museumPath: entity.museumPath });
}

export function getGenreEntity(slug: string): GenreEntityRecord | undefined {
  return entityRecords[resolveCanonicalGenreSlug(slug)];
}

export function formatGenreAliases(entity?: GenreEntityRecord, limit = 6): string[] {
  if (!entity) return [];
  return [...new Set(entity.aliasNames)].slice(0, limit);
}

function mergeIndexEntries(
  entries: IndexEntry[],
  canonical: { slug: string; name: string },
  entity?: GenreEntityRecord,
): IndexEntry {
  const gameIds = new Set<string>();
  const byPlatform: Record<string, number> = {};
  let museumPath = "";

  for (const entry of entries) {
    for (const id of entry.gameIds) gameIds.add(id);
    for (const [platform, count] of Object.entries(entry.byPlatform)) {
      byPlatform[platform] = (byPlatform[platform] ?? 0) + count;
    }
    if (!museumPath && entry.museumPath) museumPath = entry.museumPath;
  }

  const sortedGameIds = [...gameIds];
  return {
    name: canonical.name,
    slug: canonical.slug,
    museumPath: entity?.museumPaths?.[0] ?? museumPath,
    gameIds: sortedGameIds,
    gameCount: sortedGameIds.length,
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b)),
    ),
    mergeMethod: entity?.mergeMethod,
    aliasSlugs: entity?.aliasSlugs?.length ? entity.aliasSlugs : undefined,
    aliasNames: entity?.aliasNames?.length ? entity.aliasNames : undefined,
  };
}

export function mergeGenreIndex(raw: Record<string, IndexEntry>): Record<string, IndexEntry> {
  const buckets = new Map<string, IndexEntry[]>();

  for (const entry of Object.values(raw)) {
    const canonical = resolveCanonicalGenre(entry.slug, entry.name, { museumPath: entry.museumPath });
    const list = buckets.get(canonical.slug) ?? [];
    list.push(entry);
    buckets.set(canonical.slug, list);
  }

  const merged: Record<string, IndexEntry> = {};
  for (const [canonicalSlug, entries] of buckets) {
    const entity = entityRecords[canonicalSlug];
    const canonical = resolveCanonicalGenre(canonicalSlug, entries[0]?.name, {
      museumPath: entity?.museumPaths?.[0] ?? entries[0]?.museumPath,
    });
    merged[canonicalSlug] = mergeIndexEntries(entries, canonical, entity);
  }

  return merged;
}
