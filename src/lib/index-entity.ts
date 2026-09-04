import type { CatalogGame, IndexEntry } from "./types";
import { formatCatalogEntryCount } from "./catalog-entry-count";
import { formatCompanyAliases, getCompanyEntity } from "./company-canonical";
import { getFranchiseIndexEntry, getFranchiseIndexList } from "./franchise-system";
import {
  gamesForIndex,
  getCompanies,
  getCompany,
  getGenre,
  getGenres,
  getSeries,
  getSeriesList,
  getTag,
  getTags,
  indexStats,
  platformBreakdown,
  resolveIndexEntry,
} from "./indexes";

export type IndexKind = "company" | "franchise" | "genre" | "series" | "tag";

export type IndexEntitySummary = {
  kind: IndexKind;
  entry: IndexEntry;
  name: string;
  slug: string;
  catalogEntryCount: number;
  games: CatalogGame[];
  platforms: Array<{ slug: string; name: string; catalogEntryCount: number }>;
  developerCatalogEntryCount: number;
  publisherCatalogEntryCount: number;
  alsoKnownAs?: string[];
  wikidataId?: string | null;
  mergeMethod?: IndexEntry["mergeMethod"];
};

export type PublicIndexEntityListItem = {
  name: string;
  slug: string;
  catalogEntryCount: number;
  catalogEntriesByPlatform: Record<string, number>;
  developerCatalogEntryCount: number;
  publisherCatalogEntryCount: number;
};

export const INDEX_KIND_META: Record<
  IndexKind,
  {
    listTitle: string;
    backLabel: string;
    searchLabel: string;
    basePath: "/compania" | "/franquicia" | "/genero" | "/saga" | "/etiqueta";
    entityLabel: string;
    entityLabelPlural: string;
  }
> = {
  company: {
    listTitle: "Compañías",
    backLabel: "Compañías",
    searchLabel: "compañía",
    basePath: "/compania",
    entityLabel: "compañía",
    entityLabelPlural: "compañías",
  },
  franchise: {
    listTitle: "Franquicias",
    backLabel: "Franquicias",
    searchLabel: "franquicia",
    basePath: "/franquicia",
    entityLabel: "franquicia",
    entityLabelPlural: "franquicias",
  },
  genre: {
    listTitle: "Géneros",
    backLabel: "Géneros",
    searchLabel: "género",
    basePath: "/genero",
    entityLabel: "género",
    entityLabelPlural: "géneros",
  },
  series: {
    listTitle: "Sagas",
    backLabel: "Sagas",
    searchLabel: "saga",
    basePath: "/saga",
    entityLabel: "saga",
    entityLabelPlural: "sagas",
  },
  tag: {
    listTitle: "Etiquetas",
    backLabel: "Etiquetas",
    searchLabel: "etiqueta",
    basePath: "/etiqueta",
    entityLabel: "etiqueta",
    entityLabelPlural: "etiquetas",
  },
};

export function getIndexEntry(kind: IndexKind, slug: string): IndexEntry | undefined {
  switch (kind) {
    case "company":
      return getCompany(slug);
    case "franchise":
      return getFranchiseIndexEntry(slug);
    case "genre":
      return getGenre(slug);
    case "series":
      return getSeries(slug);
    case "tag":
      return getTag(slug);
  }
}

export function getIndexList(kind: IndexKind): IndexEntry[] {
  switch (kind) {
    case "company":
      return getCompanies();
    case "franchise":
      return getFranchiseIndexList();
    case "genre":
      return getGenres();
    case "series":
      return getSeriesList();
    case "tag":
      return getTags();
  }
}

export function summarizeIndexEntry(
  entry: IndexEntry,
  kind: IndexKind,
  options?: { withGames?: boolean },
): IndexEntitySummary {
  const resolved = resolveIndexEntry(entry);
  const games = options?.withGames ? gamesForIndex(resolved) : [];
  const companyEntity = kind === "company" ? getCompanyEntity(resolved.slug) : undefined;
  return {
    kind,
    entry: resolved,
    name: resolved.name,
    slug: resolved.slug,
    catalogEntryCount: resolved.gameCount,
    games,
    platforms: platformBreakdown(resolved).map((platform) => ({
      slug: platform.slug,
      name: platform.name,
      catalogEntryCount: platform.count,
    })),
    developerCatalogEntryCount: resolved.asDeveloper?.length ?? 0,
    publisherCatalogEntryCount: resolved.asPublisher?.length ?? 0,
    alsoKnownAs: kind === "company" ? formatCompanyAliases(companyEntity) : undefined,
    wikidataId: resolved.wikidataId ?? companyEntity?.wikidataIds?.[0] ?? null,
    mergeMethod: resolved.mergeMethod,
  };
}

export function toPublicIndexEntityListItem(entry: IndexEntry): PublicIndexEntityListItem {
  const resolved = resolveIndexEntry(entry);
  return {
    name: resolved.name,
    slug: resolved.slug,
    catalogEntryCount: resolved.gameCount,
    catalogEntriesByPlatform: resolved.byPlatform,
    developerCatalogEntryCount: resolved.asDeveloper?.length ?? 0,
    publisherCatalogEntryCount: resolved.asPublisher?.length ?? 0,
  };
}

export function summarizeIndexSlug(kind: IndexKind, slug: string): IndexEntitySummary | undefined {
  const entry = getIndexEntry(kind, slug);
  if (!entry) return undefined;
  return summarizeIndexEntry(entry, kind, { withGames: true });
}

/** Texto unificado para cabeceras de listado. */
export function indexListIntro(kind: IndexKind, entityCount?: number): string {
  const stats = indexStats();
  const meta = INDEX_KIND_META[kind];
  const count = entityCount ??
    (kind === "company"
      ? stats.companies
      : kind === "franchise"
        ? getFranchiseIndexList().length
      : kind === "genre"
        ? stats.genres
        : kind === "series"
          ? stats.series
          : stats.tags);
  const entities = `${count.toLocaleString("es-ES")} ${meta.entityLabelPlural}`;
  const fichas = `${formatCatalogEntryCount(stats.gamesWithDetails)} con información detallada`;
  return `${entities} · ${fichas}`;
}

/** Subtítulo unificado para ficha de entidad. */
export function indexEntitySubtitle(summary: IndexEntitySummary): string {
  const count = formatCatalogEntryCount(summary.catalogEntryCount);
  if (summary.kind !== "company") {
    return `${count} en el catálogo`;
  }
  const parts = [`${count} en el catálogo`];
  if (summary.developerCatalogEntryCount > 0) {
    parts.push(`${formatCatalogEntryCount(summary.developerCatalogEntryCount)} como desarrolladora`);
  }
  if (summary.publisherCatalogEntryCount > 0) {
    parts.push(`${formatCatalogEntryCount(summary.publisherCatalogEntryCount)} como publicadora`);
  }
  return parts.join(" · ");
}

export function isCompanyEntry(entry: IndexEntry): boolean {
  return entry.asDeveloper !== undefined || entry.asPublisher !== undefined;
}
