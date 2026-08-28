import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCrossPlatformSteamIdentity,
  assessCatalogEditorialStyle,
  assessDescriptionOriginality,
  findNintendoOfficialProductUrl,
  isCrossPlatformSteamTitleMatch,
  parseNintendoOfficialPage,
  parsePlayStationOfficialPage,
  selectWikipediaSearchTitle,
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

test("selects an exact Nintendo product instead of a similarly named edition", () => {
  const indexHtml = `
    <a href="/es-es/Juegos/Juegos-de-Nintendo-Switch-2/Mario-Kart-World-Deluxe-1.html" title="Mario Kart World Deluxe">Ver</a>
    <a href="/es-es/Juegos/Juegos-de-Nintendo-Switch-2/Mario-Kart-World-2.html" title="Mario Kart World">Ver</a>
  `;
  assert.equal(
    findNintendoOfficialProductUrl(
      indexHtml,
      "Mario Kart World",
      "https://www.nintendo.com/es-es/Juegos/Juegos-de-Nintendo-Switch-2/Indice.html",
    ),
    "https://www.nintendo.com/es-es/Juegos/Juegos-de-Nintendo-Switch-2/Mario-Kart-World-2.html",
  );
});

test("parses useful facts from a Nintendo España product page", () => {
  const html = `
    <html><head>
      <title>Mario Kart World | Juegos de Nintendo Switch 2 | Nintendo ES</title>
      <meta name="description" content="&iexcl;Carreras en un mundo conectado!">
      <meta property="og:image" content="https://www.nintendo.com/cover.png">
    </head><body>
      <span>Consola: <a>Nintendo Switch 2</a></span>
      <span>Fecha de lanzamiento: 05-06-2025</span>
      <p class="game_info_title">Categorías</p><p class="game_info_text">Fiesta, Carreras</p>
      <p class="game_info_title">Jugadores</p><p class="game_info_text">Una sola consola (1-4), En línea (2-24)</p>
      <p class="game_info_title">Distribuidor</p><p class="game_info_text">Nintendo</p>
    </body></html>
  `;
  const reference = parseNintendoOfficialPage(html, "https://www.nintendo.com/es-es/juego.html");
  assert.equal(reference?.title, "Mario Kart World");
  assert.equal(reference?.releaseDate, "2025-06-05");
  assert.equal(reference?.publisherName, "Nintendo");
  assert.deepEqual(reference?.genres, ["Fiesta", "Carreras"]);
  assert.equal(reference?.players, 4);
  assert.deepEqual(reference?.platforms, ["Nintendo Switch 2"]);
  assert.match(reference?.text ?? "", /¡Carreras/);
});

test("parses useful facts from a historical PlayStation España page", () => {
  const html = `
    <html><head>
      <meta name="description" content="Una misión de plataformas para PS VR.">
      <meta property="og:image" content="https://gmedia.playstation.com/cover.png">
    </head><body>
      <h1>ASTRO BOT Rescue Mission</h1>
      <script>{"type":"NO_OF_PLAYERS","value":"1"}</script>
      <dt>Plataforma:</dt><dd data-qa="gameInfo#releaseInformation#platform-value">PS4</dd>
      <dt>Lanzamiento:</dt><dd data-qa="gameInfo#releaseInformation#releaseDate-value">2/10/2018</dd>
      <dt>Editor:</dt><dd data-qa="gameInfo#releaseInformation#publisher-value">Sony Interactive Entertainment</dd>
      <dt>Géneros:</dt><dd data-qa="gameInfo#releaseInformation#genre-value"><span>Acción</span></dd>
    </body></html>
  `;
  const reference = parsePlayStationOfficialPage(html, "https://www.playstation.com/es-es/games/astro-bot-rescue-mission/");
  assert.equal(reference?.title, "ASTRO BOT Rescue Mission");
  assert.equal(reference?.releaseDate, "2018-10-02");
  assert.equal(reference?.publisherName, "Sony Interactive Entertainment");
  assert.deepEqual(reference?.genres, ["Acción"]);
  assert.equal(reference?.players, 1);
  assert.deepEqual(reference?.platforms, ["PS4"]);
});

test("chooses the exact Wikipedia title even when it is not the first result", () => {
  assert.equal(
    selectWikipediaSearchTitle("Mario Kart World", ["Mario Kart Live: Home Circuit", "Mario Kart World"]),
    "Mario Kart World",
  );
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
