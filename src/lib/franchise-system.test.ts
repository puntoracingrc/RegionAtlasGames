import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import buildSitemap from "../app/sitemap";
import { generateMetadata as generateFranchiseMetadata } from "../app/franquicia/[slug]/page";
import { generateMetadata as generateSeriesMetadata } from "../app/saga/[slug]/page";
import { buildIndexEntityJsonLd } from "../components/index-entity-json-ld";
import { getPublicSeriesIndexEntry } from "./admin-series-manager";
import { getMembershipExclusion, getMembershipExclusions } from "./franchise-curation";
import {
  getAllGameFranchiseRelations,
  getEntityRelationshipDisplays,
  getFranchiseEntity,
  getFranchiseIndexEntry,
  getFranchiseIndexList,
  getFranchisesForCatalogEntry,
  getLegacySeriesRedirect,
  getSeriesFranchiseRelations,
  listPublicFranchisesForCatalogEntries,
} from "./franchise-system";
import { summarizeIndexEntry } from "./index-entity";
import { getCompany, getGenre, getSeries } from "./indexes";

type VerificationReport = {
  counts: {
    catalogEntriesBefore: number;
    catalogEntriesAfter: number;
    uniqueCatalogIdsBefore: number;
    uniqueCatalogIdsAfter: number;
    companiesBefore: number;
    companiesAfter: number;
    legacySeriesUrls: number;
    permanentRedirects: number;
    retainedLegacyPages: number;
    franchises: number;
    promotedLegacySeries: number;
    retainedSeries: number;
    catalogEntryFranchiseRelations: number;
    seriesFranchiseRelations: number;
    entityRelationships: number;
    ambiguousLegacySeries: number;
    approvedMembershipExclusions: number;
    franchiseEditorialOverrides: number;
  };
  checks: Record<string, boolean>;
  failures: string[];
};

const report = JSON.parse(
  readFileSync("data/migrations/franchise-series-v1/post-migration-report.json", "utf8"),
) as VerificationReport;

test("preserva identidades, conteos y todas las salidas legacy verificadas", () => {
  assert.ok(report.counts.catalogEntriesBefore > 0);
  assert.equal(report.counts.catalogEntriesAfter, report.counts.catalogEntriesBefore);
  assert.equal(report.counts.uniqueCatalogIdsBefore, report.counts.catalogEntriesBefore);
  assert.equal(report.counts.uniqueCatalogIdsAfter, report.counts.uniqueCatalogIdsBefore);
  assert.ok(report.counts.companiesBefore > 0);
  assert.equal(report.counts.companiesAfter, report.counts.companiesBefore);
  assert.equal(report.counts.legacySeriesUrls, 427);
  assert.equal(report.counts.permanentRedirects, 8);
  assert.equal(report.counts.retainedLegacyPages, 419);
  assert.equal(report.counts.franchises, 9);
  assert.equal(report.counts.promotedLegacySeries, 8);
  assert.equal(report.counts.retainedSeries, 7);
  assert.ok(report.counts.catalogEntryFranchiseRelations > 0);
  assert.equal(report.counts.catalogEntryFranchiseRelations, getAllGameFranchiseRelations().length);
  assert.equal(report.counts.seriesFranchiseRelations, 8);
  assert.equal(report.counts.entityRelationships, 1);
  assert.equal(report.counts.ambiguousLegacySeries, 412);
  assert.equal(report.counts.approvedMembershipExclusions, getMembershipExclusions().length);
  assert.equal(report.counts.franchiseEditorialOverrides, 1);
  assert.deepEqual(report.failures, []);
  assert.ok(Object.values(report.checks).every(Boolean));
});

test("promueve solo franquicias explícitas y conserva las sagas reales", () => {
  assert.equal(getFranchiseIndexList().length, 9);
  const finalFantasy = getFranchiseIndexEntry("final-fantasy");
  assert.ok(finalFantasy);
  const publicSummary = summarizeIndexEntry(finalFantasy, "franchise");
  assert.equal(publicSummary.catalogEntryCount, finalFantasy.gameIds.length);
  assert.ok(publicSummary.catalogEntryCount > 0);
  assert.equal(Object.hasOwn(publicSummary, "gameCount"), false);
  assert.equal(getLegacySeriesRedirect("final-fantasy")?.destination, "/franquicia/final-fantasy");
  assert.equal(getLegacySeriesRedirect("mega-man-x"), undefined);

  const megaManX = getSeriesFranchiseRelations("mega-man-x");
  assert.equal(megaManX.length, 1);
  assert.equal(megaManX[0]?.franchiseSlug, "mega-man");
  assert.equal(megaManX[0]?.primary, true);
});

test("el contrato público de franquicias expone fichas catalogadas sin gameCount ambiguo", () => {
  const references = listPublicFranchisesForCatalogEntries(["ps2-lego-star-wars"]);
  assert.ok(references.length > 0);
  assert.ok(references.every((reference) => reference.catalogEntryCount > 0));
  assert.ok(references.every((reference) => reference.matchedCatalogEntryCount === 1));
  assert.ok(references.every((reference) => reference.matchedCatalogIds[0] === "ps2-lego-star-wars"));
  assert.ok(references.every((reference) => !Object.hasOwn(reference, "gameCount")));
});

test("LEGO Star Wars conserva pertenencia múltiple con LEGO como principal", () => {
  const seriesRelations = getSeriesFranchiseRelations("lego-star-wars");
  assert.deepEqual(
    seriesRelations.map((relation) => [relation.franchiseSlug, relation.primary]),
    [["lego", true], ["star-wars", false]],
  );

  const gameFranchises = getFranchisesForCatalogEntry("ps2-lego-star-wars");
  assert.deepEqual(
    gameFranchises.map((franchise) => franchise.slug).sort(),
    ["lego", "star-wars"],
  );
  assert.ok(gameFranchises.every((franchise) => franchise.membership === "inherited"));
});

test("aplica solo exclusiones editoriales explícitas y conserva casos sin nombre de franquicia", async () => {
  assert.equal(
    getFranchisesForCatalogEntry("ps1-wanted").some((entry) => entry.slug === "need-for-speed"),
    false,
  );
  assert.equal(
    getFranchisesForCatalogEntry("ps2-harry-potter-collection").some((entry) => entry.slug === "lego"),
    false,
  );

  const legoHarryPotter = await getPublicSeriesIndexEntry("lego-harry-potter");
  assert.ok(legoHarryPotter);
  assert.equal(legoHarryPotter.gameIds.includes("ps2-harry-potter-collection"), false);

  for (const [catalogId, franchiseSlug] of [
    ["ps3-shift-2-unleashed", "need-for-speed"],
    ["ps2-drome-racers", "lego"],
    ["ps2-crisis-zone", "time-crisis"],
    ["ps2-shadow-the-hedgehog", "sonic-the-hedgehog"],
  ] as const) {
    assert.ok(
      getFranchisesForCatalogEntry(catalogId).some((entry) => entry.slug === franchiseSlug),
      `${catalogId} debe conservar ${franchiseSlug}`,
    );
  }
});

test("clasifica los cinco títulos Game Boy como marca histórica o regional, no Final Fantasy directo", () => {
  const decisions = [
    "gameboy-japon-seiken-densetsu-final-fantasy-gaiden",
    "gameboy-usa-final-fantasy-adventure",
    "gameboy-usa-final-fantasy-legend",
    "gameboy-usa-final-fantasy-legend-ii",
    "gameboy-usa-final-fantasy-legend-iii",
  ];
  for (const catalogId of decisions) {
    const exclusion = getMembershipExclusion(
      catalogId,
      "franchise",
      "franchise:final-fantasy",
    );
    assert.ok(exclusion);
    assert.ok(
      exclusion.classification === "historical_branding" ||
      exclusion.classification === "regional_rebranding",
    );
    assert.equal(
      getFranchisesForCatalogEntry(catalogId).some((entry) => entry.slug === "final-fantasy"),
      false,
    );
  }
});

test("Final Fantasy no publica la biografía corporativa de Square Enix", () => {
  const finalFantasy = getFranchiseEntity("final-fantasy");
  assert.ok(finalFantasy);
  assert.equal(finalFantasy.description, null);
  assert.doesNotMatch(JSON.stringify(finalFantasy), /Eidos|fusión de Square y Enix|Tomb Raider|Hitman/i);
});

test("JSON-LD denomina inequívocamente fichas catalogadas en todas las entidades", () => {
  const franchise = getFranchiseIndexEntry("final-fantasy");
  const series = getSeries("mega-man-x");
  const company = getCompany("square-enix");
  const genre = getGenre("action");
  assert.ok(franchise && series && company && genre);
  const tag = {
    name: "Pixel art",
    slug: "pixel-art",
    museumPath: "/etiqueta/pixel-art",
    gameIds: [],
    byPlatform: {},
    gameCount: 0,
  };

  for (const summary of [
    summarizeIndexEntry(franchise, "franchise"),
    summarizeIndexEntry(series, "series"),
    summarizeIndexEntry(company, "company"),
    summarizeIndexEntry(genre, "genre"),
    summarizeIndexEntry(tag, "tag"),
  ]) {
    const [collection] = buildIndexEntityJsonLd(
      summary,
      [{ label: summary.name }],
      "https://www.regionatlas.games",
    );
    assert.ok("mainEntity" in collection);
    assert.equal(collection.mainEntity.numberOfItems, summary.catalogEntryCount);
    assert.equal(collection.mainEntity.name, `Fichas catalogadas de ${summary.name}`);
    assert.doesNotMatch(collection.mainEntity.name, /^(Franquicias|Compañías|Sagas):/);
  }
});

test("el sitemap publica franquicias y excluye únicamente las sagas redirigidas", async () => {
  const paths = new Set((await buildSitemap()).map((entry) => new URL(entry.url).pathname));
  assert.ok(paths.has("/franquicia"));
  assert.ok(paths.has("/franquicia/final-fantasy"));
  assert.ok(paths.has("/franquicia/mario"));
  assert.equal(paths.has("/saga/final-fantasy"), false);
  assert.ok(paths.has("/saga/mega-man-x"));
  assert.ok(paths.has("/saga/lego-star-wars"));
});

test("canonical distingue franquicias, sagas reales y aliases legacy", async () => {
  const franchiseMetadata = await generateFranchiseMetadata({
    params: Promise.resolve({ slug: "final-fantasy" }),
  });
  const redirectedSeriesMetadata = await generateSeriesMetadata({
    params: Promise.resolve({ slug: "final-fantasy" }),
  });
  const realSeriesMetadata = await generateSeriesMetadata({
    params: Promise.resolve({ slug: "mega-man-x" }),
  });
  const countFallbackMetadata = await generateFranchiseMetadata({
    params: Promise.resolve({ slug: "mario" }),
  });

  assert.equal(franchiseMetadata.alternates?.canonical, "/franquicia/final-fantasy");
  assert.match(String(countFallbackMetadata.description), /fichas?/);
  assert.doesNotMatch(String(countFallbackMetadata.description), /\d[\d.]* juegos/);
  assert.equal(redirectedSeriesMetadata.alternates?.canonical, "/franquicia/final-fantasy");
  assert.equal(realSeriesMetadata.alternates?.canonical, "/saga/mega-man-x");
});

test("presenta una relación en ambos sentidos sin almacenar el inverso", () => {
  const relationships = [{
    id: "relationship:series:mega-man-x:derived-from:franchise:mega-man",
    sourceType: "series" as const,
    sourceId: "mega-man-x",
    targetType: "franchise" as const,
    targetId: "franchise:mega-man",
    relationshipType: "derived_from" as const,
    source: "test",
    confidence: "high" as const,
    reviewedAt: "2026-09-04",
  }];

  const fromSeries = getEntityRelationshipDisplays(
    { type: "series", id: "mega-man-x" },
    { relationships },
  );
  const fromFranchise = getEntityRelationshipDisplays(
    { type: "franchise", id: "franchise:mega-man" },
    { relationships },
  );
  assert.equal(fromSeries[0]?.label, "Derivada de");
  assert.equal(fromSeries[0]?.href, "/franquicia/mega-man");
  assert.equal(fromFranchise[0]?.label, "Origen de");
  assert.equal(fromFranchise[0]?.href, "/saga/mega-man-x");
});
