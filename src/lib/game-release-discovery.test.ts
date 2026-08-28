import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGameReleaseDiscoveryResult } from "./game-release-discovery";

test("normalizes trusted GAME release candidates without exposing price fields", () => {
  const result = normalizeGameReleaseDiscoveryResult({
    source: "game-es-release-discovery",
    mode: "released_catalog_candidates",
    containsPrices: false,
    platformSlug: "ps5",
    region: "PAL España",
    collectedAt: "2026-08-28T08:00:00Z",
    asOf: "2026-08-28",
    candidates: [
      {
        title: "Juego de prueba",
        platformSlug: "ps5",
        region: "PAL España",
        releaseDate: "2026-08-27",
        year: 2026,
        sourceSku: "123456",
        productUrl: "https://www.game.es/videojuegos/accion/playstation-5/juego/123456",
        imageUrl: "https://media.game.es/COVERV2/3D_L/123/123456.png",
        publisher: "Estudio",
        genres: ["Acción"],
        catalogStatus: "new",
        matches: [],
        priceEur: 69.99,
      },
    ],
    stats: { pages: 1, rawProducts: 1, candidates: 1, stopReason: "last_page" },
  });

  assert.ok(result);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].title, "Juego de prueba");
  assert.equal("priceEur" in result.candidates[0], false);
});

test("rejects candidates with untrusted product or cover hosts", () => {
  const result = normalizeGameReleaseDiscoveryResult({
    source: "game-es-release-discovery",
    mode: "released_catalog_candidates",
    containsPrices: false,
    platformSlug: "switch2",
    candidates: [
      {
        title: "Juego manipulado",
        platformSlug: "switch2",
        releaseDate: "2026-08-20",
        year: 2026,
        sourceSku: "999999",
        productUrl: "https://example.com/phishing",
        imageUrl: "https://example.com/tracker.png",
        catalogStatus: "new",
      },
    ],
    stats: {},
  });

  assert.ok(result);
  assert.deepEqual(result.candidates, []);
});

test("rejects price-mode payloads even if they contain candidate-shaped rows", () => {
  assert.equal(normalizeGameReleaseDiscoveryResult({
    source: "game-es-release-discovery",
    mode: "released_catalog_candidates",
    containsPrices: true,
    platformSlug: "ps5",
    candidates: [],
  }), null);
});
