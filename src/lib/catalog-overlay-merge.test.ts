import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCatalogGameWithOverlay,
  mergeCatalogPlatformGames,
  mergeVerifiedCompanyCredits,
  resolveCatalogOverlayCandidate,
} from "./catalog-overlay-merge";
import type { CatalogGame, GameDetails } from "./types";
import { getVerifiedCompanyCreditDetails } from "./verified-company-credits";

function game(id: string, title: string, platformSlug = "nes"): CatalogGame {
  return {
    id,
    slug: id,
    title,
    titlePc: null,
    platformSlug,
    region: "PAL Europa",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
    pcId: null,
    pcRegion: null,
    pcCondition: null,
    matchConfidence: null,
    marketMin: null,
    marketMax: null,
    recommendedPrice: null,
    pcRefPrice: null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: null,
    hasEsPrice: false,
  };
}

function details(): GameDetails {
  return {
    year: 2017,
    releaseDate: null,
    reference: null,
    players: null,
    support: null,
    developer: null,
    publisher: null,
    genres: [],
    series: null,
    fetchedAt: "2026-06-19T05:30:49Z",
  };
}

test("an overlay registered for a static id takes precedence", () => {
  const staticGame = game("nes-pal-mario", "Mario");
  assert.equal(
    resolveCatalogOverlayCandidate("nes-pal-mario", staticGame, [staticGame.id], {}),
    staticGame.id,
  );
});

test("an overlay SEO slug resolves even when there is no static game", () => {
  assert.equal(
    resolveCatalogOverlayCandidate("mario-pal-europa", undefined, ["nes-pal-mario"], {
      "mario-pal-europa": "nes-pal-mario",
    }),
    "nes-pal-mario",
  );
});

test("platform overlays replace static games with the same id", () => {
  const staticMario = game("nes-pal-mario", "Mario");
  const overlayMario = { ...staticMario, title: "Super Mario Bros.", recommendedPrice: 42 };
  const merged = mergeCatalogPlatformGames("nes", [staticMario, game("nes-pal-zelda", "Zelda")], [
    overlayMario,
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((entry) => entry.id === staticMario.id)?.recommendedPrice, 42);
  assert.equal(merged.find((entry) => entry.id === staticMario.id)?.title, "Super Mario Bros.");
});

test("a newer static TodoConsolas reference survives a stale runtime overlay", () => {
  const staticGame = {
    ...game("ps4-pal-mario", "Mario", "ps4"),
    tcnsRetailPrice: 19.95,
    tcnsProductUrl: "https://www.todoconsolas.com/mario.html",
    tcnsCondition: "preowned",
    tcnsMatchedAt: "2026-08-29T10:00:00Z",
  };
  const overlayGame = {
    ...game("ps4-pal-mario", "Mario antiguo", "ps4"),
    recommendedPrice: 35,
  };

  const merged = mergeCatalogGameWithOverlay(staticGame, overlayGame);

  assert.equal(merged.title, "Mario antiguo");
  assert.equal(merged.recommendedPrice, 35);
  assert.equal(merged.tcnsRetailPrice, 19.95);
  assert.equal(merged.tcnsProductUrl, "https://www.todoconsolas.com/mario.html");
  assert.equal(merged.tcnsCondition, "preowned");
  assert.equal(merged.tcnsMatchedAt, "2026-08-29T10:00:00Z");
});

test("a newer runtime TodoConsolas reference still takes precedence", () => {
  const staticGame = {
    ...game("ps4-pal-mario", "Mario", "ps4"),
    tcnsRetailPrice: 19.95,
    tcnsMatchedAt: "2026-08-29T10:00:00Z",
  };
  const overlayGame = {
    ...staticGame,
    tcnsRetailPrice: 24.95,
    tcnsProductUrl: "https://www.todoconsolas.com/mario-new.html",
    tcnsMatchedAt: "2026-08-29T11:00:00Z",
  };

  const merged = mergeCatalogGameWithOverlay(staticGame, overlayGame);

  assert.equal(merged.tcnsRetailPrice, 24.95);
  assert.equal(merged.tcnsProductUrl, "https://www.todoconsolas.com/mario-new.html");
  assert.equal(merged.tcnsMatchedAt, "2026-08-29T11:00:00Z");
});

test("verified physical-edition facts survive a stale runtime overlay", () => {
  const staticGame = {
    ...game("ps4-7-days-to-die", "7 Days To Die", "ps4"),
    manualExpected: false,
    originalContents: [],
    originalContentsSource: "admin_verified",
    originalContentsUpdatedAt: "2026-08-30T12:00:00Z",
    regionalPackaging: [
      { region: "PAL España", frontCoverLanguages: ["es"], backCoverLanguages: ["es"] },
    ],
    regionalPackagingSource: "admin_verified",
    regionalPackagingUpdatedAt: "2026-08-30T12:00:00Z",
  };
  const overlayGame = game("ps4-7-days-to-die", "7 Days To Die", "ps4");

  const merged = mergeCatalogGameWithOverlay(staticGame, overlayGame);

  assert.equal(merged.manualExpected, false);
  assert.deepEqual(merged.originalContents, []);
  assert.deepEqual(merged.regionalPackaging, staticGame.regionalPackaging);
});

test("an overlay moved to another platform removes the stale static entry", () => {
  const staticGame = game("nes-pal-mario", "Mario");
  const movedOverlay = { ...staticGame, platformSlug: "snes" };

  assert.deepEqual(mergeCatalogPlatformGames("nes", [staticGame], [movedOverlay]), []);
});

test("a newer verified static company credit survives a stale details overlay", () => {
  const staticDetails = getVerifiedCompanyCreditDetails("ps4-destiny-2");
  assert.ok(staticDetails);
  const overlayDetails: GameDetails = {
    ...details(),
    developer: { name: "Wolf Team", slug: "wolf-team", source: "museum" },
    mergedAt: "2026-09-06T10:00:00Z",
    description: "La descripcion del overlay se conserva.",
  };

  const merged = mergeVerifiedCompanyCredits(staticDetails, overlayDetails);

  assert.equal(merged.developer?.slug, "bungie");
  assert.equal(merged.publisher?.slug, "activision");
  assert.equal(merged.fieldSources?.developer, "official");
  assert.deepEqual(
    merged.fieldProvenance?.developer,
    staticDetails.fieldProvenance?.developer,
  );
  assert.equal(merged.description, overlayDetails.description);
});

test("a newer runtime company credit remains authoritative", () => {
  const staticDetails: GameDetails = {
    ...details(),
    developer: { name: "Bungie", slug: "bungie", source: "official" },
    fieldProvenance: {
      developer: {
        source: "official",
        evidenceUrls: ["https://example.com/static"],
        evidenceSummary: "Credito estatico verificado.",
        reviewedAt: "2026-09-05",
        reviewBatch: "company-credit-ps4-pal-batch-1",
      },
    },
  };
  const overlayDetails: GameDetails = {
    ...details(),
    developer: { name: "Current Studio", slug: "current-studio", source: "official" },
    fieldSources: { developer: "official" },
    fieldProvenance: {
      developer: {
        source: "official",
        evidenceUrls: ["https://example.com/runtime"],
        evidenceSummary: "Credito de runtime verificado despues del lote.",
        reviewedAt: "2026-09-06",
        reviewBatch: "company-credit-runtime-review",
      },
    },
  };

  assert.equal(
    mergeVerifiedCompanyCredits(staticDetails, overlayDetails).developer?.slug,
    "current-studio",
  );
});

test("an unverified static credit cannot replace an overlay credit", () => {
  const staticDetails: GameDetails = {
    ...details(),
    developer: { name: "Unverified Studio", slug: "unverified-studio" },
    fieldSources: { developer: "wikidata" },
  };
  const overlayDetails: GameDetails = {
    ...details(),
    developer: { name: "Overlay Studio", slug: "overlay-studio" },
  };

  assert.equal(
    mergeVerifiedCompanyCredits(staticDetails, overlayDetails).developer?.slug,
    "overlay-studio",
  );
});

test("a verified static credit fills an empty overlay field", () => {
  const staticDetails: GameDetails = {
    ...details(),
    publisher: { name: "Activision", slug: "activision", source: "official" },
    fieldSources: { publisher: "official" },
    fieldProvenance: {
      publisher: {
        source: "official",
        evidenceUrls: ["https://example.com/publisher"],
        evidenceSummary: "Publicadora fisica verificada.",
        reviewedAt: "2026-09-05",
        reviewBatch: "company-credit-ps4-pal-batch-1",
      },
    },
  };
  const overlayDetails: GameDetails = {
    ...details(),
    publisher: null,
    mergedAt: "2026-09-06T10:00:00Z",
  };

  assert.equal(
    mergeVerifiedCompanyCredits(staticDetails, overlayDetails).publisher?.slug,
    "activision",
  );
});

test("verified company credits provide details when static assets are unavailable", () => {
  const verifiedDetails = getVerifiedCompanyCreditDetails("ps4-destiny-2");
  assert.ok(verifiedDetails);

  const merged = mergeVerifiedCompanyCredits(verifiedDetails);

  assert.equal(merged.developer?.slug, "bungie");
  assert.equal(merged.publisher?.slug, "activision");
  assert.deepEqual(merged.genres, []);
  assert.equal(merged.year, null);
  assert.equal(merged.series, null);
});
