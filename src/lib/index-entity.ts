import type { CatalogGame, IndexEntry } from "./types";
import {
  gamesForIndex,
  getCompanies,
  getCompany,
  getGenre,
  getGenres,
  getSeries,
  getSeriesList,
  indexStats,
  platformBreakdown,
  resolveIndexEntry,
} from "./indexes";

export type IndexKind = "company" | "genre" | "series";

export type IndexEntitySummary = {
  kind: IndexKind;
  entry: IndexEntry;
  name: string;
  slug: string;
  gameCount: number;
  games: CatalogGame[];
  platforms: ReturnType<typeof platformBreakdown>;
  developerCount: number;
  publisherCount: number;
};

export const INDEX_KIND_META: Record<
  IndexKind,
  {
    listTitle: string;
    backLabel: string;
    searchLabel: string;
    basePath: "/compania" | "/genero" | "/saga";
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
};

export function getIndexEntry(kind: IndexKind, slug: string): IndexEntry | undefined {
  switch (kind) {
    case "company":
      return getCompany(slug);
    case "genre":
      return getGenre(slug);
    case "series":
      return getSeries(slug);
  }
}

export function getIndexList(kind: IndexKind): IndexEntry[] {
  switch (kind) {
    case "company":
      return getCompanies();
    case "genre":
      return getGenres();
    case "series":
      return getSeriesList();
  }
}

export function summarizeIndexEntry(entry: IndexEntry, kind: IndexKind): IndexEntitySummary {
  const resolved = resolveIndexEntry(entry);
  const games = gamesForIndex(resolved);
  return {
    kind,
    entry: resolved,
    name: resolved.name,
    slug: resolved.slug,
    gameCount: games.length,
    games,
    platforms: platformBreakdown(resolved),
    developerCount: resolved.asDeveloper?.length ?? 0,
    publisherCount: resolved.asPublisher?.length ?? 0,
  };
}

export function summarizeIndexSlug(kind: IndexKind, slug: string): IndexEntitySummary | undefined {
  const entry = getIndexEntry(kind, slug);
  if (!entry) return undefined;
  return summarizeIndexEntry(entry, kind);
}

/** Texto unificado para cabeceras de listado. */
export function indexListIntro(kind: IndexKind): string {
  const stats = indexStats();
  const meta = INDEX_KIND_META[kind];
  const count =
    kind === "company" ? stats.companies : kind === "genre" ? stats.genres : stats.series;
  const entities = `${count.toLocaleString("es-ES")} ${meta.entityLabelPlural}`;
  const fichas = `${stats.gamesWithDetails.toLocaleString("es-ES")} juegos con ficha del museo`;
  return `${entities} · ${fichas}`;
}

/** Subtítulo unificado para ficha de entidad. */
export function indexEntitySubtitle(summary: IndexEntitySummary): string {
  const count = summary.gameCount.toLocaleString("es-ES");
  if (summary.kind !== "company") {
    return `${count} juegos en el catálogo`;
  }
  const parts = [`${count} juegos en el catálogo`];
  if (summary.developerCount > 0) {
    parts.push(`${summary.developerCount.toLocaleString("es-ES")} como desarrolladora`);
  }
  if (summary.publisherCount > 0) {
    parts.push(`${summary.publisherCount.toLocaleString("es-ES")} como publicadora`);
  }
  return parts.join(" · ");
}

export function isCompanyEntry(entry: IndexEntry): boolean {
  return entry.asDeveloper !== undefined || entry.asPublisher !== undefined;
}
