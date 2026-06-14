import companyGroupsData from "../../data/company-groups.json";
import type { IndexEntry } from "./types";

type CompanyGroup = {
  slug: string;
  name: string;
  exactSlugs?: string[];
  slugPrefixes?: string[];
};

type CompanyGroupsFile = {
  groups: CompanyGroup[];
};

const groupsFile = companyGroupsData as CompanyGroupsFile;

const slugToCanonical = new Map<string, { slug: string; name: string }>();
const prefixRules: { prefix: string; canonical: { slug: string; name: string } }[] = [];

for (const group of groupsFile.groups) {
  const canonical = { slug: group.slug, name: group.name };
  slugToCanonical.set(group.slug, canonical);
  for (const exact of group.exactSlugs ?? []) {
    slugToCanonical.set(exact, canonical);
  }
  for (const prefix of group.slugPrefixes ?? []) {
    prefixRules.push({ prefix, canonical });
    slugToCanonical.set(prefix, canonical);
  }
}

prefixRules.sort((a, b) => b.prefix.length - a.prefix.length);

/** Resuelve el slug canónico de una compañía (publicadora o desarrolladora). */
export function resolveCanonicalCompanySlug(slug: string): string {
  if (!slug) return slug;
  const direct = slugToCanonical.get(slug);
  if (direct) return direct.slug;

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
): { slug: string; name: string } {
  const canonicalSlug = resolveCanonicalCompanySlug(slug);
  const canonical = slugToCanonical.get(canonicalSlug);
  return {
    slug: canonicalSlug,
    name: canonical?.name ?? name ?? slug,
  };
}

function mergeIndexEntries(entries: IndexEntry[], canonical: { slug: string; name: string }): IndexEntry {
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
    museumPath,
    gameIds: sortedGameIds,
    gameCount: sortedGameIds.length,
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).sort(([a], [b]) => a.localeCompare(b)),
    ),
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
    const canonical = resolveCanonicalCompany(entry.slug, entry.name);
    const list = buckets.get(canonical.slug) ?? [];
    list.push(entry);
    buckets.set(canonical.slug, list);
  }

  const merged: Record<string, IndexEntry> = {};
  for (const [canonicalSlug, entries] of buckets) {
    const canonical = resolveCanonicalCompany(canonicalSlug, entries[0]?.name);
    merged[canonicalSlug] = mergeIndexEntries(entries, canonical);
  }

  return merged;
}
