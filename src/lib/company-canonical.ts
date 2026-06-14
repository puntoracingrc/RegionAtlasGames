import companyGroupsData from "../../data/company-groups.json";
import companyEntitiesData from "../../data/index/company-entities.json";
import {
  decodeEntityText,
  isJointCompanyName,
  normalizeCompanyKey,
  pickDisplayName,
} from "./entity-normalize";
import type { DetailEntity, IndexEntry } from "./types";

export type CompanyMergeMethod = "manual" | "wikidata" | "museum" | "normalized" | "slug";

export type CompanyEntityRecord = {
  slug: string;
  name: string;
  mergeMethod: CompanyMergeMethod;
  aliasSlugs: string[];
  aliasNames: string[];
  wikidataIds: string[];
  museumPaths: string[];
};

type CompanyGroup = {
  slug: string;
  name: string;
  exactSlugs?: string[];
  slugPrefixes?: string[];
};

type CompanyGroupsFile = {
  groups: CompanyGroup[];
};

type CompanyEntitiesFile = {
  entities: Record<string, CompanyEntityRecord>;
  slugToCanonical: Record<string, string>;
  wikidataToCanonical: Record<string, string>;
  museumPathToCanonical: Record<string, string>;
  normalizedToCanonical: Record<string, string>;
};

const groupsFile = companyGroupsData as CompanyGroupsFile;
const registryFile = companyEntitiesData as CompanyEntitiesFile;

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
const wikidataToCanonical = new Map(Object.entries(registryFile.wikidataToCanonical ?? {}));
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

export type ResolveCompanyHints = {
  name?: string;
  wikidataId?: string | null;
  museumPath?: string | null;
};

/** Resuelve el slug canónico de una compañía (publicadora o desarrolladora). */
export function resolveCanonicalCompanySlug(
  slug: string,
  hints?: ResolveCompanyHints,
): string {
  if (!slug) return slug;

  const manual = manualCanonicalSlug(slug);
  if (manual) return manual;

  const mapped = slugToCanonical.get(slug);
  if (mapped) return mapped;

  if (hints?.wikidataId) {
    const wd = wikidataToCanonical.get(hints.wikidataId);
    if (wd) return wd;
  }

  if (hints?.museumPath) {
    const mp = museumPathToCanonical.get(hints.museumPath);
    if (mp) return mp;
  }

  const name = hints?.name;
  if (name) {
    const key = normalizeCompanyKey(name);
    if (key.length >= 3 && !isJointCompanyName(name)) {
      const normalized = normalizedToCanonical.get(key);
      if (
        normalized &&
        (normalized === slug || slug.startsWith(`${normalized}-`) || normalized.startsWith(`${slug}-`))
      ) {
        return normalized;
      }
    }
  }

  for (const { prefix, canonical } of prefixRules) {
    if (slug === prefix || slug.startsWith(`${prefix}-`)) {
      return canonical.slug;
    }
  }

  return slug;
}

/** Resuelve slug y nombre canónicos para enlaces y filtros. */
export function resolveCanonicalCompany(
  slug: string,
  name?: string,
  hints?: Omit<ResolveCompanyHints, "name">,
): { slug: string; name: string } {
  const canonicalSlug = resolveCanonicalCompanySlug(slug, { name, ...hints });
  const manual = manualSlugToCanonical.get(canonicalSlug);
  const record = entityRecords[canonicalSlug];
  return {
    slug: canonicalSlug,
    name:
      manual?.name ??
      record?.name ??
      pickDisplayName([name ?? "", slug]) ??
      name ??
      slug,
  };
}

export function resolveCanonicalEntity(entity: DetailEntity): { slug: string; name: string } {
  return resolveCanonicalCompany(entity.slug, entity.name, {
    wikidataId: entity.wikidataId,
    museumPath: entity.museumPath,
  });
}

export function getCompanyEntity(slug: string): CompanyEntityRecord | undefined {
  const canonicalSlug = resolveCanonicalCompanySlug(slug);
  return entityRecords[canonicalSlug];
}

function mergeIndexEntries(
  entries: IndexEntry[],
  canonical: { slug: string; name: string },
  entity?: CompanyEntityRecord,
): IndexEntry {
  const gameIds = new Set<string>();
  const asDeveloper = new Set<string>();
  const asPublisher = new Set<string>();
  const byPlatform: Record<string, number> = {};
  let museumPath = "";

  for (const entry of entries) {
    for (const id of entry.gameIds) gameIds.add(id);
    for (const id of entry.asDeveloper ?? []) asDeveloper.add(id);
    for (const id of entry.asPublisher ?? []) asPublisher.add(id);
    for (const [platform, count] of Object.entries(entry.byPlatform)) {
      byPlatform[platform] = (byPlatform[platform] ?? 0) + count;
    }
    if (!museumPath && entry.museumPath) museumPath = entry.museumPath;
  }

  const sortedGameIds = [...gameIds];
  const merged: IndexEntry = {
    name: canonical.name,
    slug: canonical.slug,
    museumPath: entity?.museumPaths?.[0] ?? museumPath,
    gameIds: sortedGameIds,
    gameCount: sortedGameIds.length,
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b)),
    ),
    mergeMethod: entity?.mergeMethod,
    wikidataId: entity?.wikidataIds?.[0] ?? null,
    aliasSlugs: entity?.aliasSlugs?.length ? entity.aliasSlugs : undefined,
    aliasNames: entity?.aliasNames?.length ? entity.aliasNames : undefined,
  };

  if (asDeveloper.size > 0) {
    merged.asDeveloper = [...asDeveloper].filter((id) => gameIds.has(id));
  }
  if (asPublisher.size > 0) {
    merged.asPublisher = [...asPublisher].filter((id) => gameIds.has(id));
  }

  return merged;
}

/** Agrupa entradas duplicadas del índice de compañías bajo un slug canónico. */
export function mergeCompanyIndex(raw: Record<string, IndexEntry>): Record<string, IndexEntry> {
  const buckets = new Map<string, IndexEntry[]>();

  for (const entry of Object.values(raw)) {
    const canonical = resolveCanonicalCompany(entry.slug, entry.name, {
      museumPath: entry.museumPath,
    });
    const list = buckets.get(canonical.slug) ?? [];
    list.push(entry);
    buckets.set(canonical.slug, list);
  }

  const merged: Record<string, IndexEntry> = {};
  for (const [canonicalSlug, entries] of buckets) {
    const entity = entityRecords[canonicalSlug];
    const canonical = resolveCanonicalCompany(canonicalSlug, entries[0]?.name, {
      wikidataId: entity?.wikidataIds?.[0],
      museumPath: entity?.museumPaths?.[0] ?? entries[0]?.museumPath,
    });
    merged[canonicalSlug] = mergeIndexEntries(entries, canonical, entity);
  }

  return merged;
}

export function companyEntityWikidataUrl(wikidataId: string): string {
  return `https://www.wikidata.org/wiki/${encodeURIComponent(wikidataId)}`;
}

export function formatCompanyAliases(entity?: CompanyEntityRecord, limit = 6): string[] {
  if (!entity) return [];
  const names = entity.aliasNames.map(decodeEntityText).filter(Boolean);
  return [...new Set(names)].slice(0, limit);
}
