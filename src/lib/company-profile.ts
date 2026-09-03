import companyProfilesData from "../../data/company-profiles.json";
import { readAdminCompanyProfilesOverlay } from "./admin-entity-catalog";
import { catalogGamePath } from "./catalog-url";
import { getPlatform, isPublicCatalogGame } from "./catalog";
import {
  formatCompanyAliases,
  getCompanyEntity,
  resolveCanonicalCompanySlug,
  resolveCanonicalEntity,
} from "./company-canonical";
import {
  gamesForIndex,
  getCompany,
  getGameDetails,
} from "./indexes";
import { resolveCompanyLogo } from "./company-logo";
import {
  applyPublicCompanyResearch,
  getPublicCompanyAchievements,
  getPublicCompanyResearchSources,
} from "./company-public-research";
import type {
  CompanyResearchAchievement,
  CompanyResearchPublicSource,
} from "./company-research-types";
import type { CatalogGame, CompanyProfile, IndexEntry } from "./types";

export type CompanyCollaborator = {
  slug: string;
  name: string;
  count: number;
  role: "developer" | "publisher";
};

export type CompanyPlatformGames = {
  platformSlug: string;
  platformName: string;
  count: number;
  games: CatalogGame[];
};

export type CompanyProfileView = {
  slug: string;
  name: string;
  gameCount: number;
  developerCount: number;
  publisherCount: number;
  alsoKnownAs: string[];
  wikidataId: string | null;
  foundedYear: number | null;
  closedYear: number | null;
  status: CompanyProfile["status"];
  isParentCompany: boolean;
  parentCompany: CompanyProfile["parentCompany"] | null;
  acquiredByCompany: CompanyProfile["acquiredByCompany"] | null;
  mergedWithCompany: CompanyProfile["mergedWithCompany"] | null;
  predecessorCompany: CompanyProfile["predecessorCompany"] | null;
  successorCompany: CompanyProfile["successorCompany"] | null;
  logoUrl: string | null;
  logoIsProvisional: boolean;
  history: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  researchSources: CompanyResearchPublicSource[];
  achievements: CompanyResearchAchievement[];
  platforms: CompanyPlatformGames[];
  collaborators: CompanyCollaborator[];
  games: CatalogGame[];
  profilePending: boolean;
};

const profiles = companyProfilesData as Record<string, CompanyProfile>;

export function getStoredCompanyProfile(slug: string): CompanyProfile | undefined {
  const canonical = resolveCanonicalCompanySlug(slug);
  return applyPublicCompanyResearch(profiles[canonical], canonical);
}

export async function getStoredCompanyProfileWithOverlay(slug: string): Promise<CompanyProfile | undefined> {
  const canonical = resolveCanonicalCompanySlug(slug);
  const overlayProfiles = await readAdminCompanyProfilesOverlay();
  return applyPublicCompanyResearch(overlayProfiles[canonical] ?? profiles[canonical], canonical);
}

function inferStatus(
  profile: CompanyProfile | undefined,
  closedYear: number | null,
): CompanyProfile["status"] {
  if (profile?.status && profile.status !== "unknown") return profile.status;
  if (closedYear != null) return "defunct";
  return "active";
}

function collectCollaborators(entry: IndexEntry, selfSlug: string): CompanyCollaborator[] {
  const counts = new Map<string, CompanyCollaborator>();
  const games = gamesForIndex(entry).filter(isPublicCatalogGame);

  for (const game of games) {
    const details = getGameDetails(game.id);
    if (!details) continue;

    const asDev = entry.asDeveloper?.includes(game.id);
    const asPub = entry.asPublisher?.includes(game.id);

    if (asPub && details.developer) {
      const dev = resolveCanonicalEntity(details.developer);
      if (dev.slug === selfSlug) continue;
      const key = `developer:${dev.slug}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { slug: dev.slug, name: dev.name, count: 1, role: "developer" });
    }

    if (asDev && details.publisher) {
      const pub = resolveCanonicalEntity(details.publisher);
      if (pub.slug === selfSlug) continue;
      const key = `publisher:${pub.slug}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { slug: pub.slug, name: pub.name, count: 1, role: "publisher" });
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"),
  );
}

function groupGamesByPlatform(games: CatalogGame[]): CompanyPlatformGames[] {
  const buckets = new Map<string, CatalogGame[]>();
  for (const game of games) {
    const list = buckets.get(game.platformSlug) ?? [];
    list.push(game);
    buckets.set(game.platformSlug, list);
  }

  return [...buckets.entries()]
    .map(([platformSlug, platformGames]) => ({
      platformSlug,
      platformName: getPlatform(platformSlug)?.shortName ?? platformSlug,
      count: platformGames.length,
      games: [...platformGames].sort((a, b) => a.title.localeCompare(b.title, "es")),
    }))
    .sort((a, b) => b.count - a.count || a.platformName.localeCompare(b.platformName, "es"));
}

function buildCompanyProfileViewFromProfile(
  slug: string,
  stored: CompanyProfile | undefined,
): CompanyProfileView | undefined {
  const entry = getCompany(slug);
  if (!entry) return undefined;

  const entity = getCompanyEntity(entry.slug);
  const games = gamesForIndex(entry).filter(isPublicCatalogGame);
  const gameIds = new Set(games.map((game) => game.id));
  const foundedYear = stored?.foundedYear ?? null;
  const closedYear = stored?.closedYear ?? null;
  const logo = resolveCompanyLogo(entry.slug, stored?.logoUrl);
  const usesGeneratedCatalogCopy =
    stored?.method === "template" || stored?.method === "wikidata";

  return {
    slug: entry.slug,
    name: stored?.name ?? entry.name,
    gameCount: games.length,
    developerCount: entry.asDeveloper?.filter((id) => gameIds.has(id)).length ?? 0,
    publisherCount: entry.asPublisher?.filter((id) => gameIds.has(id)).length ?? 0,
    alsoKnownAs: formatCompanyAliases(entity),
    wikidataId: stored?.wikidataId ?? entry.wikidataId ?? entity?.wikidataIds?.[0] ?? null,
    foundedYear,
    closedYear,
    status: inferStatus(stored, closedYear),
    isParentCompany: stored?.isParentCompany === true,
    parentCompany: stored?.parentCompany ?? null,
    acquiredByCompany: stored?.acquiredByCompany ?? null,
    mergedWithCompany: stored?.mergedWithCompany ?? null,
    predecessorCompany: stored?.predecessorCompany ?? null,
    successorCompany: stored?.successorCompany ?? null,
    logoUrl: logo.url,
    logoIsProvisional: logo.provisional,
    // Generated summaries embed catalog counts, so render those figures from the live index.
    history: usesGeneratedCatalogCopy ? null : stored?.history?.trim() || null,
    seoTitle: usesGeneratedCatalogCopy ? null : stored?.seoMeta?.seoTitle ?? null,
    seoDescription: usesGeneratedCatalogCopy ? null : stored?.seoMeta?.seoDescription ?? null,
    researchSources: getPublicCompanyResearchSources(entry.slug),
    achievements: getPublicCompanyAchievements(entry.slug),
    platforms: groupGamesByPlatform(games),
    collaborators: collectCollaborators(entry, entry.slug).slice(0, 24),
    games,
    profilePending: !stored?.history,
  };
}

export function buildCompanyProfileView(slug: string): CompanyProfileView | undefined {
  const entry = getCompany(slug);
  if (!entry) return undefined;
  return buildCompanyProfileViewFromProfile(slug, getStoredCompanyProfile(entry.slug));
}

export async function buildCompanyProfileViewWithOverlay(slug: string): Promise<CompanyProfileView | undefined> {
  const entry = getCompany(slug);
  if (!entry) return undefined;
  return buildCompanyProfileViewFromProfile(slug, await getStoredCompanyProfileWithOverlay(entry.slug));
}

export function companyGameHref(game: CatalogGame): string {
  return catalogGamePath(game);
}

export function companyStatusLabel(status: CompanyProfile["status"]): string {
  switch (status) {
    case "defunct":
      return "Empresa cerrada";
    case "subsidiary":
      return "Filial / subsidiaria";
    case "active":
      return "Activa";
    default:
      return "Estado desconocido";
  }
}

export function companyLifespanLabel(
  foundedYear: number | null,
  closedYear: number | null,
): string | null {
  if (foundedYear != null && closedYear != null) {
    return `${foundedYear} – ${closedYear}`;
  }
  if (foundedYear != null) return `Fundada en ${foundedYear}`;
  if (closedYear != null) return `Cierre ${closedYear}`;
  return null;
}
