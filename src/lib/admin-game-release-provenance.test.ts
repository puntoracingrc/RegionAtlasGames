import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogEntry,
  buildDetailsEntry,
  mergeCatalogFromDraft,
  mergeDetailsFromDraft,
} from "./admin-catalog-publish";
import { draftFromManualInput } from "./admin-draft-storage";
import type { CatalogGame, GameDetails } from "./types";

test("preserves trusted GAME provenance from draft to published catalog data", () => {
  const gameEsSource = {
    sku: "123456",
    productUrl: "https://www.game.es/videojuegos/accion/playstation-5/juego/123456",
    imageUrl: "https://media.game.es/COVERV2/3D_L/123/123456.png",
    fetchedAt: "2026-08-28T10:00:00Z",
    preowned: {
      sku: "654321",
      productUrl: "https://www.game.es/videojuegos/accion/playstation-5/juego-seminuevo/654321",
      fetchedAt: "2026-08-28T10:00:00Z",
    },
  };
  const draft = draftFromManualInput({
    pcId: -1,
    title: "Juego de prueba",
    platformSlug: "ps5",
    region: "PAL España",
    coverUrl: gameEsSource.imageUrl,
    year: 2026,
    releaseDate: "2026-08-20",
    pegi: 12,
    support: "Disco Blu-ray",
    publisherName: "Editor",
    genreNames: ["Acción", "Simulación", "Deportes"],
    gameEsSource,
  });

  const game = buildCatalogEntry(draft, null);
  const details = buildDetailsEntry(draft);
  assert.equal(game.matchConfidence, "GAME_ES_ADMIN");
  assert.equal(game.gameEsSku, "123456");
  assert.equal(game.gameEsProductUrl, gameEsSource.productUrl);
  assert.equal(game.gameEsPreownedSku, "654321");
  assert.equal(game.regionVerified, false);
  assert.equal(game.hasEsPrice, false);
  assert.equal(details.sources?.gameEs?.sku, "123456");
  assert.equal(details.sources?.gameEs?.preowned?.sku, "654321");
  assert.equal(details.pegi, 12);
  assert.equal(details.fieldSources?.publisher, "game-es");
  assert.equal(details.fieldSources?.genres, "game-es");
  assert.deepEqual(details.genres.map((genre) => genre.slug), ["action", "simulation", "sports"]);
});

test("publishes the initial regional prices entered in the batch form", () => {
  const draft = draftFromManualInput({
    pcId: -1,
    title: "Juego con precios regionales",
    platformSlug: "ps5",
    region: "Norteamérica",
    marketRegion: "US",
    initialPrices: {
      estimatedPriceLoose: 31.5,
      estimatedPriceGameManual: 35,
      estimatedPriceComplete: 45,
      estimatedPriceSealed: 60,
      estimatedPriceNewRetail: 69.99,
    },
  });

  const game = buildCatalogEntry(draft, null);
  assert.equal(game.estimatedPriceLoose, 31.5);
  assert.equal(game.estimatedPriceGameManual, 35);
  assert.equal(game.estimatedPriceComplete, 45);
  assert.equal(game.estimatedPriceSealed, 60);
  assert.equal(game.estimatedPriceNewRetail, 69.99);
  assert.equal(game.hasEsPrice, true);
});

test("publishes the shared V2 work identity created by a regional batch", () => {
  const draft = draftFromManualInput({
    pcId: -1,
    title: "Mortal Shell II",
    platformSlug: "ps5",
    region: "PAL España",
    workId: "mortal-shell-ii",
    regionalStatus: "resolved",
  });

  const game = buildCatalogEntry(draft, null);
  assert.equal(game.workId, "mortal-shell-ii");
  assert.equal(game.regionalStatus, "resolved");
});

test("keeps verified region evidence and unrelated field provenance on later edits", () => {
  const gameEsSource = {
    sku: "123456",
    productUrl: "https://www.game.es/videojuegos/accion/playstation-5/juego/123456",
    imageUrl: "https://media.game.es/COVERV2/3D_L/123/123456.png",
    fetchedAt: "2026-08-28T10:00:00Z",
  };
  const draft = draftFromManualInput({
    pcId: -1,
    title: "Juego revisado",
    platformSlug: "ps5",
    region: "PAL España",
    year: 2025,
    releaseDate: "2025-02-14",
    developerName: "Estudio",
    publisherName: "Editor revisado",
    gameEsSource,
  });
  const existingGame = {
    ...buildCatalogEntry(draft, null),
    regionEvidence: ["game_es_retail_catalog", "admin_box_review"],
    regionVerified: true,
  } satisfies CatalogGame;
  const existingDetails = {
    ...buildDetailsEntry(draft),
    developer: { name: "Estudio", slug: "estudio", source: "wikidata" },
    fieldSources: {
      year: "wikidata",
      releaseDate: "wikidata",
      developer: "wikidata",
      publisher: "game-es",
    },
  } satisfies GameDetails;

  const mergedGame = mergeCatalogFromDraft(existingGame, draft);
  const mergedDetails = mergeDetailsFromDraft(existingDetails, draft);

  assert.equal(mergedGame.regionVerified, true);
  assert.deepEqual(mergedGame.regionEvidence, ["game_es_retail_catalog", "admin_box_review"]);
  assert.equal(mergedDetails.fieldSources?.year, "wikidata");
  assert.equal(mergedDetails.fieldSources?.releaseDate, "wikidata");
  assert.equal(mergedDetails.fieldSources?.developer, "wikidata");
  assert.equal(mergedDetails.fieldSources?.publisher, "game-es");
  assert.equal(mergedDetails.sources?.gameEs?.sku, "123456");
});
