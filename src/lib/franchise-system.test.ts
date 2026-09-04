import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import buildSitemap from "../app/sitemap";
import { generateMetadata as generateFranchiseMetadata } from "../app/franquicia/[slug]/page";
import { generateMetadata as generateSeriesMetadata } from "../app/saga/[slug]/page";
import {
  getEntityRelationshipDisplays,
  getFranchiseIndexEntry,
  getFranchiseIndexList,
  getFranchisesForCatalogEntry,
  getLegacySeriesRedirect,
  getSeriesFranchiseRelations,
  listPublicFranchisesForCatalogEntries,
} from "./franchise-system";
import { summarizeIndexEntry } from "./index-entity";

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
  assert.equal(report.counts.catalogEntryFranchiseRelations, 340);
  assert.equal(report.counts.seriesFranchiseRelations, 8);
  assert.equal(report.counts.entityRelationships, 1);
  assert.equal(report.counts.ambiguousLegacySeries, 412);
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
