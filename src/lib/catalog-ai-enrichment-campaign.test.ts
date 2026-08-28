import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCrossPlatformSteamIdentity,
  assessCatalogEditorialStyle,
  assessDescriptionOriginality,
  isCrossPlatformSteamTitleMatch,
  type AdminAiFillRunResult,
} from "./admin-ai-fill";
import type { AdminGameDraft } from "./admin-draft-types";
import {
  buildCatalogAiProposal,
  CATALOG_AI_ENRICHMENT_SCHEMA_VERSION,
  catalogGameNeedsAiEnrichment,
  normalizeCatalogAiEnrichmentResult,
} from "./catalog-ai-enrichment-campaign";
import type { CatalogGame, GameDetails } from "./types";

const game = {
  id: "ps5-juego-prueba",
  slug: "juego-prueba",
  title: "Juego Prueba",
  titlePc: "Juego Prueba",
  platformSlug: "ps5",
  region: "PAL España",
  edition: "standard",
  listingStatus: "listed",
} as CatalogGame;

const completeDraft: AdminGameDraft = {
  pcId: 0,
  catalogId: game.id,
  slug: game.slug,
  title: game.title,
  titlePc: game.titlePc,
  platformSlug: game.platformSlug,
  region: game.region,
  physicalVariant: null,
  edition: game.edition,
  reference: null,
  coverUrl: null,
  year: 2026,
  releaseDate: "2026-08-01",
  players: 1,
  support: "Disco Blu-ray",
  developerName: "Estudio Prueba",
  developerSlug: "estudio-prueba",
  publisherName: "Editora Prueba",
  publisherSlug: "editora-prueba",
  genreNames: ["Acción"],
  subgenreNames: ["Hack and slash"],
  facetNames: ["Un jugador"],
  description:
    "Juego Prueba plantea combates directos y exploración por escenarios conectados. La edición de PlayStation 5 combina progresión, desafíos opcionales y una campaña diseñada para un jugador.",
  seoMeta: {
    seoTitle: "Juego Prueba para PS5 PAL España",
    seoDescription: "Ficha de Juego Prueba para PS5 PAL España con edición, lanzamiento y datos verificados del juego.",
    coverAlt: "Portada de Juego Prueba para PS5 PAL España",
    jsonLdDescription: "Ficha de Juego Prueba para PlayStation 5.",
    faqs: [],
    highlights: [],
    generatedAt: "2026-08-28T00:00:00Z",
    method: "ai",
    model: "test-model",
  },
  descriptionMeta: null,
  source: "manual",
  updatedAt: "2026-08-28T00:00:00Z",
};

function completeDetails(): GameDetails {
  return {
    year: 2026,
    releaseDate: "2026-08-01",
    reference: null,
    players: 1,
    support: "Disco Blu-ray",
    developer: { name: "Estudio Prueba", slug: "estudio-prueba", museumPath: null, pcPath: null, source: "merged" },
    publisher: { name: "Editora Prueba", slug: "editora-prueba", museumPath: null, pcPath: null, source: "merged" },
    genres: [{ name: "Acción", slug: "action", museumPath: null, pcPath: null, source: "merged" }],
    subgenres: [],
    facets: [],
    series: null,
    sources: {},
    fetchedAt: "2026-08-28T00:00:00",
    mergedAt: "2026-08-28T00:00:00",
    description: completeDraft.description,
    seoMeta: completeDraft.seoMeta,
  };
}

function successfulRun(): AdminAiFillRunResult {
  return {
    finalDraft: structuredClone(completeDraft),
    error: null,
    fieldsUpdated: ["developerName", "description", "seoMeta"],
    sources: ["PlayStation Store", "Steam"],
    urls: ["https://store.playstation.com/es-es/product/test", "https://store.steampowered.com/app/1"],
    steamTags: ["Action"],
    logs: ["Fuente oficial encontrada: PlayStation Store"],
    qualitySignals: [{
      metric: "description-originality",
      score: 94,
      passed: true,
      detail: "solapamiento=0% · secuencia=3 palabras",
    }, {
      metric: "editorial-style",
      score: 100,
      passed: true,
      detail: "tono editorial limpio",
    }],
  };
}

test("detects missing and complete catalog details", () => {
  assert.equal(catalogGameNeedsAiEnrichment({ ...completeDetails(), description: null }), true);
  assert.equal(catalogGameNeedsAiEnrichment(completeDetails()), false);
});

test("rejects copied prose and accepts independently structured text", () => {
  const source = "El protagonista recorre una ciudad abandonada mientras resuelve puzles y combate criaturas para descubrir el origen del desastre.";
  assert.equal(assessDescriptionOriginality(source, source).passed, false);
  const original = "La aventura alterna exploración urbana, enfrentamientos y acertijos. Su historia gira alrededor de las causas que dejaron la ciudad sin habitantes.";
  assert.equal(assessDescriptionOriginality(original, source).passed, true);
});

test("flags promotional and reception language", () => {
  const style = assessCatalogEditorialStyle(
    "Descubre un título aclamado que vendió millones de unidades y ganó el premio a juego del año.",
  );
  assert.equal(style.passed, false);
  assert.ok(style.violations.length >= 3);
  assert.equal(assessCatalogEditorialStyle("El juego combina plataformas, exploración y desafíos opcionales.").passed, true);
});

test("rejects a same-title Steam game when companies and year contradict the console record", () => {
  const identity = assessCrossPlatformSteamIdentity(completeDraft, {
    developerName: "Otro Estudio",
    publisherName: "Otra Editora",
    releaseDate: "12 octubre 2021",
  });
  assert.equal(identity.passed, false);
});

test("rejects Steam DLCs that only contain the requested title", () => {
  assert.equal(
    isCrossPlatformSteamTitleMatch(
      "Astro Bot",
      "Sackboy: Una aventura a lo grande - Disfraz de ASTRO BOT",
    ),
    false,
  );
  assert.equal(isCrossPlatformSteamTitleMatch("Juego Prueba Console Edition", "Juego Prueba"), true);
});

test("accepts a cross-platform Steam reference corroborated by publisher", () => {
  const identity = assessCrossPlatformSteamIdentity(completeDraft, {
    developerName: "Estudio Port",
    publisherName: "Editora Prueba Publishing LLC",
    releaseDate: "12 octubre 2022",
  });
  assert.equal(identity.passed, true);
});

test("marks a sourced complete proposal ready", () => {
  const proposal = buildCatalogAiProposal({ game, details: null, run: successfulRun() });
  assert.equal(proposal.status, "ready");
  assert.ok(proposal.qualityScore >= 75);
  assert.equal(proposal.warnings.length, 0);
});

test("keeps an otherwise complete proposal in review without traceable URLs", () => {
  const run = successfulRun();
  run.urls = [];
  const proposal = buildCatalogAiProposal({ game, details: null, run });
  assert.equal(proposal.status, "review");
  assert.match(proposal.warnings.join(" "), /fuente/i);
});

test("normalizer rejects result drafts that try to carry price fields", () => {
  const proposal = buildCatalogAiProposal({ game, details: null, run: successfulRun() });
  const result = {
    schemaVersion: CATALOG_AI_ENRICHMENT_SCHEMA_VERSION,
    source: "region-atlas-catalog-ai",
    mode: "proposal-only",
    containsWrites: false,
    generatedAt: "2026-08-28T00:00:00Z",
    model: "test-model",
    platformSlug: "ps5",
    enrichmentMode: "missing",
    cursor: { startAfterCatalogId: null, nextCatalogId: game.id, hasMore: false },
    stats: { catalogGames: 1, incompleteBefore: 1, selected: 1, ready: 1, review: 0, errors: 0 },
    proposals: [{ ...proposal, draft: { ...proposal.draft, recommendedPrice: 1 } }],
  };
  assert.equal(normalizeCatalogAiEnrichmentResult(result), null);
});

test("normalizer rejects malformed arrays and inconsistent summaries", () => {
  const proposal = buildCatalogAiProposal({ game, details: null, run: successfulRun() });
  const base = {
    schemaVersion: CATALOG_AI_ENRICHMENT_SCHEMA_VERSION,
    source: "region-atlas-catalog-ai",
    mode: "proposal-only",
    containsWrites: false,
    generatedAt: "2026-08-28T00:00:00Z",
    model: "test-model",
    platformSlug: "ps5",
    enrichmentMode: "missing",
    cursor: { startAfterCatalogId: null, nextCatalogId: game.id, hasMore: false },
    stats: { catalogGames: 1, incompleteBefore: 1, selected: 1, ready: 1, review: 0, errors: 0 },
    proposals: [proposal],
  };
  assert.ok(normalizeCatalogAiEnrichmentResult(base));
  assert.equal(normalizeCatalogAiEnrichmentResult({ ...base, proposals: [{ ...proposal, urls: null }] }), null);
  assert.equal(normalizeCatalogAiEnrichmentResult({ ...base, stats: { ...base.stats, selected: 2 } }), null);
});
