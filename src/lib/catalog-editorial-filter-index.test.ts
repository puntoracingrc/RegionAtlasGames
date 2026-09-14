import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { publicListedCatalog } from "@/lib/catalog";
import {
  catalogEditorialFilterIndexStats,
  toCatalogEditorialFilterGame,
  toCatalogEditorialListGame,
} from "@/lib/catalog-editorial-filter-index";
import {
  facetFilterOptions,
  filterCatalogGames,
  subgenreFilterOptions,
  type CatalogFilterState,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { groupCatalogListGames } from "@/lib/catalog-physical-edition-browse";
import type { CatalogListGame } from "@/lib/types";

const indexedFields = [
  "displayYear",
  "companySearchText",
  "companies",
  "sortGenre",
  "sortReference",
  "genreSlugs",
  "subgenreSlugs",
  "facetSlugs",
] as const;

function sameTokens(left = "", right = ""): boolean {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size !== rightTokens.size) return false;
  return [...leftTokens].every((token) => rightTokens.has(token));
}

function metadataMismatch(expected: CatalogListGame, actual: CatalogListGame): string | null {
  for (const field of indexedFields) {
    if (JSON.stringify(expected[field]) !== JSON.stringify(actual[field])) return field;
  }
  if (!sameTokens(expected.searchText, actual.searchText)) return "searchText";
  if (!sameTokens(expected.gameSearchText, actual.gameSearchText)) return "gameSearchText";
  return null;
}

test("the compact editorial index preserves rich filter metadata", () => {
  const compressed = readFileSync(path.join(process.cwd(), "data", "index", "catalog-editorial-filter-index.json.gz"));
  assert.equal(compressed[9], 0xff, "gzip header must be portable across build operating systems");
  const stats = catalogEditorialFilterIndexStats();
  assert.equal(stats.version, 1);
  assert.equal(stats.catalogCount, publicListedCatalog.length);
  assert.ok(stats.recordCount > 0);

  const mismatches: string[] = [];
  for (const game of publicListedCatalog) {
    const expected = toCatalogListGame(game);
    const filterGame = toCatalogEditorialFilterGame(game);
    const searchGame = toCatalogEditorialListGame(game);
    const field = metadataMismatch(expected, {
      ...filterGame,
      searchText: searchGame.searchText,
      gameSearchText: searchGame.gameSearchText,
    });
    if (field) mismatches.push(`${game.id}:${field}`);
    if (mismatches.length >= 10) break;
  }
  assert.deepEqual(mismatches, []);
});

test("deep editorial filters return the same grouped catalog identities", () => {
  const richGames = groupCatalogListGames(publicListedCatalog.map(toCatalogListGame));
  const compactGames = groupCatalogListGames(
    publicListedCatalog.map(toCatalogEditorialFilterGame),
    { mergeSearchText: false },
  );
  const subgenre = subgenreFilterOptions(richGames)[0]?.slug ?? "all";
  const facet = facetFilterOptions(richGames)[0]?.slug ?? "all";
  const base: CatalogFilterState = {
    q: "",
    region: "all",
    platform: "all",
    sort: "title-asc",
    priceFilter: "all",
  };
  const cases: CatalogFilterState[] = [
    { ...base, company: "Nintendo" },
    { ...base, genre: "accion" },
    { ...base, subgenre },
    { ...base, facet },
    { ...base, sort: "year-desc" },
    { ...base, sort: "reference-asc" },
    { ...base, sort: "genre-asc" },
  ];
  const searchCases: CatalogFilterState[] = [
    { ...base, q: "accion", queryScope: "full" },
    { ...base, q: "mario", company: "Nintendo", sort: "year-desc" },
  ];

  for (const filters of cases) {
    const expected = filterCatalogGames(richGames, filters, { platforms: true, regions: true });
    const actual = filterCatalogGames(compactGames, filters, { platforms: true, regions: true });
    assert.deepEqual(actual.items.map((game) => game.id), expected.items.map((game) => game.id));
    assert.deepEqual(actual.reviewCounts, expected.reviewCounts);
    assert.equal(actual.total, expected.total);
  }

  const compactSearchGames = groupCatalogListGames(publicListedCatalog.map(toCatalogEditorialListGame));
  for (const filters of searchCases) {
    const expected = filterCatalogGames(richGames, filters, { platforms: true, regions: true });
    const actual = filterCatalogGames(compactSearchGames, filters, { platforms: true, regions: true });
    assert.deepEqual(actual.items.map((game) => game.id), expected.items.map((game) => game.id));
    assert.deepEqual(actual.reviewCounts, expected.reviewCounts);
    assert.equal(actual.total, expected.total);
  }
});
