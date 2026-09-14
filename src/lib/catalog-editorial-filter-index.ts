import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { normalizeCatalogSearchParts } from "@/lib/catalog-search-normalize";
import { toCatalogListGameShell } from "@/lib/catalog-list-game-shell";
import {
  catalogGameSearchTextBase,
  toCatalogQuickSearchGame,
} from "@/lib/catalog-quick-search-game";
import type { CatalogGame, CatalogListGame } from "@/lib/types";

const INDEX_VERSION = 1;
const INDEX_FILE = "catalog-editorial-filter-index.json.gz";

export type CatalogEditorialFilterRecord = [
  year: number | null,
  companySearchText: string,
  companies: string[],
  sortGenre: string | null,
  sortReference: string | null,
  genreSlugs: string[],
  subgenreSlugs: string[],
  facetSlugs: string[],
  searchTextAdditions: string,
  gameSearchTextAdditions: string,
];

type CatalogEditorialFilterPayload = {
  version: number;
  catalogCount: number;
  recordCount: number;
  records: Record<string, CatalogEditorialFilterRecord>;
};

let indexCache: CatalogEditorialFilterPayload | null = null;

function loadCatalogEditorialFilterIndex(): CatalogEditorialFilterPayload {
  if (indexCache) return indexCache;
  const compressed = readFileSync(path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "index",
    INDEX_FILE,
  ));
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8")) as CatalogEditorialFilterPayload;
  if (payload.version !== INDEX_VERSION || !payload.records || typeof payload.records !== "object") {
    throw new Error(`Índice editorial incompatible: ${INDEX_FILE}`);
  }
  indexCache = payload;
  return indexCache;
}

export function getCatalogEditorialFilterRecord(
  catalogId: string,
): CatalogEditorialFilterRecord | undefined {
  return loadCatalogEditorialFilterIndex().records[catalogId];
}

export function catalogEditorialFilterIndexStats(): Pick<
  CatalogEditorialFilterPayload,
  "catalogCount" | "recordCount" | "version"
> {
  const { catalogCount, recordCount, version } = loadCatalogEditorialFilterIndex();
  return { catalogCount, recordCount, version };
}

function applyEditorialMetadata(
  base: CatalogListGame,
  record: CatalogEditorialFilterRecord | undefined,
): CatalogListGame {
  const filterableBase: CatalogListGame = {
    ...base,
    companySearchText: base.companySearchText ?? "",
    companies: base.companies ?? [],
    sortGenre: base.sortGenre ?? "\uffff",
    sortReference: base.sortReference ?? base.slug ?? base.id,
    genreSlugs: base.genreSlugs ?? [],
    subgenreSlugs: base.subgenreSlugs ?? [],
    facetSlugs: base.facetSlugs ?? [],
  };
  if (!record) return filterableBase;
  return {
    ...filterableBase,
    displayYear: record[0],
    companySearchText: record[1],
    companies: record[2],
    sortGenre: record[3] ?? "\uffff",
    sortReference: record[4] ?? filterableBase.sortReference,
    genreSlugs: record[5],
    subgenreSlugs: record[6],
    facetSlugs: record[7],
  };
}

/** Minimal row for editorial filters and ordering that do not include free text. */
export function toCatalogEditorialFilterGame(game: CatalogGame): CatalogListGame {
  return applyEditorialMetadata(
    toCatalogListGameShell(game),
    getCatalogEditorialFilterRecord(game.id),
  );
}

/**
 * Builds the same filterable catalog row as the rich details path while only
 * inflating a compact, precomputed editorial index.
 */
export function toCatalogEditorialListGame(game: CatalogGame): CatalogListGame {
  const quick = applyEditorialMetadata(
    toCatalogQuickSearchGame(game),
    getCatalogEditorialFilterRecord(game.id),
  );
  const record = getCatalogEditorialFilterRecord(game.id);
  const gameSearchText = catalogGameSearchTextBase(game);
  if (!record) return { ...quick, gameSearchText };

  return {
    ...quick,
    searchText: normalizeCatalogSearchParts([quick.searchText, record[8]]),
    gameSearchText: normalizeCatalogSearchParts([gameSearchText, record[9]]),
  };
}
