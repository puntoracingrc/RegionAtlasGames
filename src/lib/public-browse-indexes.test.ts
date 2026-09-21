import assert from "node:assert/strict";
import test from "node:test";
import { publicListedCatalog } from "./catalog";
import {
  augmentCatalogBrowseFilterOptions,
  getCatalogBrowseData,
  getCatalogBrowseIndexStats,
  mergeCatalogBrowseOverlay,
} from "./catalog-browse-index";
import { toCatalogCardGame } from "./catalog-card-game";
import { getCatalogCardLookup } from "./catalog-card-lookup";
import { toCatalogListGame } from "./catalog-list-game";
import { groupCatalogListGames } from "./catalog-physical-edition-browse";
import { getCompanyBrowseData } from "./company-browse-index";
import { filterCompanies as filterCompaniesFast } from "./company-explorer-filter";
import { DEFAULT_COMPANY_FILTERS } from "./company-explorer-types";
import { filterCompanies, getCompanyExplorerData } from "./company-index";
import { getRegionDisplay } from "./region-display";

test("el índice compacto conserva todas las tarjetas agrupadas", async () => {
  delete process.env.CATALOG_RUNTIME_OVERLAY_ENABLED;
  const actual = await getCatalogBrowseData();
  const expected = groupCatalogListGames(publicListedCatalog.map(toCatalogListGame));
  assert.equal(actual.source, "compact");
  assert.equal(actual.games.length, expected.length);
  assert.equal(getCatalogBrowseIndexStats().groupedCount, expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    assert.deepEqual(toCatalogCardGame(actual.games[index]), toCatalogCardGame(expected[index]));
    assert.deepEqual(tokens(actual.games[index].searchText), tokens(expected[index].searchText));
    assert.deepEqual(tokens(actual.games[index].gameSearchText), tokens(expected[index].gameSearchText));
    assert.deepEqual(tokens(actual.games[index].companySearchText), tokens(expected[index].companySearchText));
  }
});

function tokens(value = ""): string[] {
  return [...new Set(value.split(" ").filter(Boolean))].sort();
}

test("el lookup de Vitrina conserva la identidad pública del catálogo", () => {
  const lookup = getCatalogCardLookup();
  assert.equal(lookup.size, publicListedCatalog.length);
  for (const game of publicListedCatalog) {
    const indexed = lookup.get(game.id);
    assert.ok(indexed, game.id);
    assert.equal(indexed.title, game.title);
    assert.equal(indexed.platformSlug, game.platformSlug);
    assert.equal(indexed.region, game.region);
    assert.equal(indexed.canonicalSeoSlug, game.canonicalSeoSlug ?? null);
    assert.equal(indexed.coverUrl, game.coverUrl ?? null);
  }
});

test("una incorporación caliente del worker amplía sus filtros seleccionables", async () => {
  const indexed = await getCatalogBrowseData();
  const workerGame = {
    ...indexed.games[0],
    region: "Worker Test Region",
    platformSlug: "worker-console",
    displayPlatform: "Worker Console",
    companies: ["Worker Studio"],
  };
  const augmented = augmentCatalogBrowseFilterOptions(indexed.filterOptions, [workerGame]);
  const regionLabel = getRegionDisplay(workerGame.region).label;
  assert.ok(augmented.regions.some((option) => option.label === regionLabel));
  assert.ok(augmented.regionsByPlatform[workerGame.platformSlug]
    .some((option) => option.label === regionLabel));
  assert.ok(augmented.platforms.some((option) => option.slug === workerGame.platformSlug));
  assert.ok(augmented.companies.some((option) => option.name === "Worker Studio"));
});

test("el overlay caliente actualiza y añade tarjetas sin reconstruir el catálogo", async () => {
  const indexed = await getCatalogBrowseData();
  const base = indexed.games.find((game) => (
    game.physicalEditionGroup?.catalogIds.length === 1 &&
    game.physicalEditionGroup.catalogIds[0] === game.id
  ));
  assert.ok(base);
  const staticGame = publicListedCatalog.find((game) => game.id === base.id);
  assert.ok(staticGame);
  const updated = {
    ...staticGame,
    region: "PAL Francia",
    coverUrl: "https://example.com/worker-cover.jpg",
    recommendedPrice: 777,
    estimatedPriceComplete: 777,
  };
  const added = {
    ...staticGame,
    id: "worker-new-catalog-game",
    slug: "worker-new-catalog-game",
    title: "Worker New Catalog Game",
    region: "PAL Francia",
    canonicalSeoSlug: "worker-new-catalog-game-pal-fr",
  };
  const merged = mergeCatalogBrowseOverlay(
    indexed.games,
    [updated, added],
    [{ slug: base.platformSlug, name: base.displayPlatform }],
  );
  const patched = merged.find((game) => game.id === base.id);
  const inserted = merged.find((game) => game.id === added.id);
  assert.equal(merged.length, indexed.games.length + 1);
  assert.equal(patched?.region, "PAL Francia");
  assert.equal(patched?.recommendedPrice, 777);
  assert.equal(patched?.coverUrl, updated.coverUrl);
  assert.equal(inserted?.title, added.title);
  assert.match(inserted?.searchText ?? "", /worker new catalog game/);
});

test("una variante física revisada del overlay se agrupa y se busca por EAN", async () => {
  const indexed = await getCatalogBrowseData();
  const collector = indexed.games.find((game) => (
    game.id === "ps3-007-quantum-of-solace-collector%27s-edition"
  ));
  const collectorSource = publicListedCatalog.find((game) => (
    game.id === "ps3-007-quantum-of-solace-collector%27s-edition"
  ));
  assert.ok(collector && collectorSource);
  const runtimeAustralia = {
    ...collectorSource,
    id: "ps3-007-quantum-of-solace-collectors-edition-au",
    slug: "007-quantum-of-solace-collectors-edition-au",
    title: "007 Quantum of Solace Collector's Edition AU",
    region: "Australia",
    marketRegion: "AU" as const,
    workId: null,
    physicalVariant: "Collector AU",
    physicalReleaseGroup: null,
  };

  const merged = mergeCatalogBrowseOverlay(
    indexed.games,
    [runtimeAustralia],
    indexed.filterOptions.platforms,
  );
  const grouped = merged.find((game) => (
    game.physicalEditionGroup?.catalogIds.includes(runtimeAustralia.id)
  ));

  assert.equal(grouped?.id, collector.id);
  assert.equal(grouped?.physicalEditionGroup?.physicalEditionCount, 3);
  assert.match(grouped?.searchText ?? "", /5030917063701/);
  assert.match(grouped?.searchText ?? "", /bles 00411/);
});

test("el overlay caliente cambia una ficha existente de Estándar a Recopilatorio", async () => {
  const indexed = await getCatalogBrowseData();
  const base = indexed.games.find((game) => (
    game.physicalEditionGroup?.catalogIds.length === 1 &&
    game.physicalEditionGroup.editionTypes.includes("STANDARD")
  ));
  assert.ok(base);
  const staticGame = publicListedCatalog.find((game) => game.id === base.id);
  assert.ok(staticGame);

  const overlay = {
    ...staticGame,
    physicalVariant: "Recopilatorio",
    physicalReleaseGroup: {
      id: `${staticGame.platformSlug}:runtime-compilation:recopilatorio:01-us`,
      label: "USA · recopilatorio de 3 discos",
      barcode: "710425473432",
      confidence: "CONFIRMED" as const,
      packagingLanguages: ["EN"],
      ratingSystems: ["ESRB M"],
      physicalContents: ["Disco 1", "Disco 2", "Disco 3"],
    },
  };
  const merged = mergeCatalogBrowseOverlay(
    indexed.games,
    [overlay],
    [{ slug: base.platformSlug, name: base.displayPlatform }],
  );
  const patched = merged.find((game) => game.id === base.id);
  assert.equal(patched?.physicalVariant, "Recopilatorio");
  assert.equal(patched?.physicalEditionGroup?.editionFamilyLabel, "Recopilatorio");
  assert.deepEqual(patched?.physicalEditionGroup?.editionTypes, ["COMPILATION"]);

  const filters = augmentCatalogBrowseFilterOptions(indexed.filterOptions, merged);
  assert.ok(filters.physicalEditions.editionTypes.some((option) => option.value === "COMPILATION"));
  assert.ok(filters.physicalEditions.editionFamilies.some((option) => option.value === "Recopilatorio"));
});

test("el overlay caliente agrupa las regiones nuevas bajo una tarjeta V2", async () => {
  const indexed = await getCatalogBrowseData();
  const seed = publicListedCatalog.find((game) => game.platformSlug === "ps5");
  assert.ok(seed);
  const common = {
    ...seed,
    title: "Mortal Shell II",
    titlePc: "Mortal Shell II",
    physicalVariant: "Standard",
    edition: "standard",
    workId: "mortal-shell-ii",
    regionalStatus: "resolved" as const,
  };
  const es = {
    ...common,
    id: "ps5-mortal-shell-ii-es",
    slug: "mortal-shell-ii-es",
    region: "PAL España",
    marketRegion: "ES",
    physicalReleaseGroup: {
      id: "ps5:mortal-shell-ii:standard:01-es",
      label: "España",
      barcode: "5056635624581",
      confidence: "CONFIRMED" as const,
    },
  };
  const fr = {
    ...common,
    id: "ps5-mortal-shell-ii-fr",
    slug: "mortal-shell-ii-fr",
    region: "PAL Francia",
    marketRegion: "FR",
    physicalReleaseGroup: {
      id: "ps5:mortal-shell-ii:standard:02-fr",
      label: "Francia",
      barcode: "5056635624567",
      confidence: "CONFIRMED" as const,
    },
  };

  const merged = mergeCatalogBrowseOverlay(
    indexed.games,
    [es, fr],
    [{ slug: "ps5", name: "PS5" }],
  );
  const mortalShellCards = merged.filter((game) => (
    game.title === "Mortal Shell II"
      && game.platformSlug === "ps5"
      && game.physicalEditionGroup?.editionFamilyLabel === "Estándar"
  ));
  assert.equal(mortalShellCards.length, 1);
  assert.ok(mortalShellCards[0].physicalEditionGroup?.catalogIds.includes(es.id));
  assert.ok(mortalShellCards[0].physicalEditionGroup?.catalogIds.includes(fr.id));
  assert.equal(mortalShellCards[0].physicalEditionGroup?.physicalEditionCount, 2);
});

test("el índice de compañías y sus filtros coinciden con la fuente enriquecida", () => {
  const indexed = getCompanyBrowseData();
  const expected = getCompanyExplorerData();
  assert.deepEqual(indexed, expected);
  const filters = [
    DEFAULT_COMPANY_FILTERS,
    { ...DEFAULT_COMPANY_FILTERS, role: "developers" as const, sort: "games-desc" as const },
    { ...DEFAULT_COMPANY_FILTERS, q: "silver", status: "active" as const },
    { ...DEFAULT_COMPANY_FILTERS, market: "priced" as const, sort: "market-desc" as const },
  ];
  for (const current of filters) {
    assert.deepEqual(
      filterCompaniesFast(indexed.companies, current).map((company) => company.slug),
      filterCompanies(expected.companies, current).map((company) => company.slug),
    );
  }
});
