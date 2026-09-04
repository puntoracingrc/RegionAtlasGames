import assert from "node:assert/strict";
import test from "node:test";
import { publicListedCatalog } from "./catalog";
import { formatCatalogEntryCount } from "./catalog-entry-count";
import {
  COMPANY_SIZE_OPTIONS,
  COMPANY_SORT_OPTIONS,
} from "./company-explorer-types";
import { getCompanyExplorerData } from "./company-index";
import { buildCompanyProfileView } from "./company-profile";
import { buildCompanyIntro, buildCompanyMetadata } from "./company-seo";
import { buildGenreProfileView } from "./genre-profile";
import { buildGenreMetadata } from "./genre-seo";
import { getPublicTaxonomyGroups } from "./game-taxonomy-groups";
import {
  indexEntitySubtitle,
  summarizeIndexEntry,
  toPublicIndexEntityListItem,
} from "./index-entity";
import { gamesForIndex, getSeries } from "./indexes";
import { buildSeriesProfile } from "./series-profile";
import type { IndexEntry } from "./types";

test("formats catalog records as fichas with Spanish singular and plural", () => {
  assert.equal(formatCatalogEntryCount(0), "0 fichas");
  assert.equal(formatCatalogEntryCount(1), "1 ficha");
  assert.equal(formatCatalogEntryCount(12_345), "12.345 fichas");
});

test("adapts the legacy index count to an explicit public catalog-entry contract", () => {
  const [firstEntry, secondEntry] = publicListedCatalog;
  assert.ok(firstEntry);
  assert.ok(secondEntry);
  const byPlatform = [firstEntry, secondEntry].reduce<Record<string, number>>((counts, entry) => {
    counts[entry.platformSlug] = (counts[entry.platformSlug] ?? 0) + 1;
    return counts;
  }, {});
  const entry: IndexEntry = {
    name: "Compañía de prueba",
    slug: "company-count-semantics-test",
    museumPath: "",
    gameIds: [firstEntry.id, secondEntry.id],
    byPlatform,
    gameCount: 2,
    asDeveloper: [firstEntry.id],
    asPublisher: [secondEntry.id],
  };

  const listItem = toPublicIndexEntityListItem(entry);
  assert.equal(listItem.catalogEntryCount, entry.gameIds.length);
  assert.equal(listItem.developerCatalogEntryCount, 1);
  assert.equal(listItem.publisherCatalogEntryCount, 1);
  assert.equal(Object.hasOwn(listItem, "gameCount"), false);

  const summary = summarizeIndexEntry(entry, "company");
  assert.equal(summary.catalogEntryCount, entry.gameIds.length);
  assert.equal(Object.hasOwn(summary, "gameCount"), false);
  assert.equal(
    indexEntitySubtitle(summary),
    "2 fichas en el catálogo · 1 ficha como desarrolladora · 1 ficha como publicadora",
  );
});

test("company views expose catalog records explicitly for large representative companies", () => {
  for (const slug of ["square-enix", "activision", "nintendo"]) {
    const view = buildCompanyProfileView(slug);
    assert.ok(view, `missing company profile view for ${slug}`);
    assert.equal(view.catalogEntryCount, view.games.length);
    assert.equal(
      view.platforms.reduce((total, platform) => total + platform.catalogEntryCount, 0),
      view.catalogEntryCount,
    );
    assert.ok(view.developerCatalogEntryCount <= view.catalogEntryCount);
    assert.ok(view.publisherCatalogEntryCount <= view.catalogEntryCount);
    assert.equal(Object.hasOwn(view, "gameCount"), false);
  }
});

test("generated company metadata and copy call catalog records fichas", () => {
  const view = buildCompanyProfileView("square-enix");
  assert.ok(view);
  const formattedCount = formatCatalogEntryCount(view.catalogEntryCount);
  assert.ok(buildCompanyIntro(view).includes(formattedCount));
  assert.match(String(buildCompanyMetadata(view).description), /fichas/);
  assert.doesNotMatch(String(buildCompanyMetadata(view).description), /\d[\d.]* juegos/);
});

test("series and genre profiles count catalog entries across platforms and regions", () => {
  const seriesEntry = getSeries("call-of-duty");
  assert.ok(seriesEntry);
  const seriesGames = gamesForIndex(seriesEntry);
  const series = buildSeriesProfile(seriesEntry, seriesGames);
  assert.equal(series.catalogEntryCount, seriesGames.length);
  assert.equal(
    series.platforms.reduce((total, platform) => total + platform.catalogEntryCount, 0),
    series.catalogEntryCount,
  );
  assert.ok(new Set(seriesGames.map((game) => game.platformSlug)).size > 1);
  assert.ok(new Set(seriesGames.map((game) => game.region)).size > 1);
  assert.match(series.description, /fichas? del catálogo/);

  const genre = buildGenreProfileView("action");
  assert.ok(genre);
  assert.equal(genre.catalogEntryCount, genre.games.length);
  assert.equal(
    genre.platforms.reduce((total, platform) => total + platform.catalogEntryCount, 0),
    genre.catalogEntryCount,
  );
  assert.match(String(buildGenreMetadata(genre).description), /fichas/);
});

test("public company size and count sorts name fichas rather than games or titles", () => {
  const countSorts = COMPANY_SORT_OPTIONS.filter((option) =>
    ["games-desc", "games-asc", "pub-desc", "dev-desc", "grails-desc"].includes(option.value),
  );
  assert.ok(countSorts.every((option) => option.label.toLowerCase().includes("fichas")));
  assert.ok(COMPANY_SIZE_OPTIONS.every((option) => option.value === "all" || option.label.includes("fichas")));

  const explorer = getCompanyExplorerData();
  assert.ok(explorer.platformOptions.every((option) => Object.hasOwn(option, "companyCount")));
  assert.ok(explorer.genreOptions.every((option) => Object.hasOwn(option, "companyCount")));
  assert.ok(explorer.platformOptions.every((option) => !Object.hasOwn(option, "count")));
});

test("the shared genre and tag index exposes an explicit catalog-entry count", async () => {
  const groups = await getPublicTaxonomyGroups({ includeFacetCounts: false });
  const terms = groups.flatMap((group) => group.terms);
  assert.ok(terms.length > 0);
  assert.ok(terms.every((term) => Object.hasOwn(term, "catalogEntryCount")));
  assert.ok(terms.every((term) => !Object.hasOwn(term, "count")));
});
