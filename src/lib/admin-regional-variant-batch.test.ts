import assert from "node:assert/strict";
import test from "node:test";
import {
  applyExpandedRegionalIdentity,
  buildAdminVariantImageSlug,
  classifyRegionalBatchRowPublication,
  expandRegionalVariantBatch,
  matchesPublishedRegionalVariantRow,
  regionalVariantBatchCatalogId,
  resolveRegionalBatchCoverUrl,
  selectRegionalVariantBatchRow,
} from "./admin-regional-variant-batch";
import {
  buildRuntimeCatalogEditionGuide,
  extendCatalogEditionGuideWithRuntimeGames,
} from "./catalog-derived-edition-guides";
import type { CatalogGame } from "./types";

test("a common cover never becomes the cover of a distinct box without its own front", () => {
  assert.equal(resolveRegionalBatchCoverUrl(null, "/us-common.jpg", null, 3), null);
  assert.equal(resolveRegionalBatchCoverUrl("/jp-front.jpg", "/us-common.jpg", null, 3), "/jp-front.jpg");
  assert.equal(resolveRegionalBatchCoverUrl(null, "/us-common.jpg", "/existing-jp.jpg", 3), "/existing-jp.jpg");
  assert.equal(resolveRegionalBatchCoverUrl(null, "/shared.jpg", null, 1), "/shared.jpg");
});

test("names Admin images from the game, platform, market, edition and side", () => {
  assert.equal(
    buildAdminVariantImageSlug({
      titleSlug: "_summer",
      platformSlug: "ps2",
      markets: ["JP"],
      groupLabel: "First Print Limited Edition",
      role: "back",
    }),
    "summer-ps2-jp-first-print-limited-edition-back",
  );
});

test("an existing catalog draft adopts both the exact market and its legacy region", () => {
  const updated = applyExpandedRegionalIdentity(
    { region: "PAL España", marketRegion: "ES" as const, title: "Pack" },
    { region: "PAL UK", marketRegion: "GB" },
  );

  assert.equal(updated.region, "PAL UK");
  assert.equal(updated.marketRegion, "GB");
  assert.equal(updated.title, "Pack");
});

const MORTAL_SHELL_GROUPS = [
  { markets: ["GB"], barcode: "5056635624550" },
  { markets: ["FR"], barcode: "5056635624567" },
  { markets: ["IT"], barcode: "5056635624574" },
  { markets: ["ES"], barcode: "5056635624581", packagingLanguages: ["ES"] },
  { markets: ["DE"], barcode: "5056635624598" },
  { markets: ["EU_GENERIC"], barcode: "5056635624611" },
  { markets: ["AU"], barcode: "5056635624604" },
  { markets: ["US", "CA"], barcode: "810136675634" },
  { markets: ["JP"], barcode: "4595057030309", productCodes: ["ELJM-31010"] },
  { markets: ["KR"], confidence: "PENDING_IDENTIFIER" as const },
  { markets: ["HK", "TW"], confidence: "PENDING_IDENTIFIER" as const },
];

test("Mortal Shell II expands 11 physical boxes into 13 regional records", () => {
  const result = expandRegionalVariantBatch({
    title: "Mortal Shell II",
    platformSlug: "ps5",
    physicalVariant: "Standard",
    groups: MORTAL_SHELL_GROUPS,
  });
  assert.ok(!("error" in result));
  assert.equal(result.physicalVariantCount, 11);
  assert.equal(result.rows.length, 13);
  const northAmerica = result.rows.filter((row) => row.market === "US" || row.market === "CA");
  assert.equal(new Set(northAmerica.map((row) => row.group.id)).size, 1);
  assert.equal(northAmerica[0].group.barcode, "810136675634");
  const asia = result.rows.filter((row) => row.market === "HK" || row.market === "TW");
  assert.equal(new Set(asia.map((row) => row.group.id)).size, 1);
  assert.equal(asia[0].group.confidence, "PENDING_IDENTIFIER");
  assert.equal(result.rows.find((row) => row.market === "ES")?.group.packagingLanguages?.[0], "ES");
  assert.equal(new Set(result.rows.map((row) => row.slug)).size, 13);
});

test("a large regional batch must be processed one stable row at a time", () => {
  const result = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps4",
    groups: [{ markets: ["US", "CA"], barcode: "012345678905" }, { markets: ["JP"] }],
  });
  assert.ok(!("error" in result));
  assert.ok("error" in selectRegionalVariantBatchRow(result.rows, undefined));
  const first = selectRegionalVariantBatchRow(result.rows, 0);
  const second = selectRegionalVariantBatchRow(result.rows, 1);
  assert.ok(!("error" in first));
  assert.ok(!("error" in second));
  assert.equal(first.row.group.id, second.row.group.id);
  assert.equal(regionalVariantBatchCatalogId("ps4", first.row), "ps4-usa-example-us");
  assert.ok("error" in selectRegionalVariantBatchRow(result.rows, 3));
});

test("uncertain batch responses require exact published identity, not just a matching catalog ID", () => {
  const result = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps4",
    groups: [{ markets: ["JP"], barcode: "4571331332291", productCodes: ["PLJM-80265"] }],
  });
  assert.ok(!("error" in result));
  const row = result.rows[0];
  const game = {
    id: regionalVariantBatchCatalogId("ps4", row),
    title: "Example", platformSlug: "ps4", workId: "example",
    region: row.region, marketRegion: row.marketRegion,
    physicalVariant: row.physicalVariant,
    physicalReleaseGroup: row.group,
  } as CatalogGame;
  const input = { title: "Example", platformSlug: "ps4", workId: "example", row };
  assert.equal(matchesPublishedRegionalVariantRow(game, input), true);
  assert.equal(matchesPublishedRegionalVariantRow({ ...game, physicalReleaseGroup: { ...row.group, barcode: "0000000000000" } }, input), false);
  assert.equal(matchesPublishedRegionalVariantRow({ ...game, workId: "another-game" }, input), false);
  assert.equal(classifyRegionalBatchRowPublication({ indexed: false, overlayGame: game, staticGame: null, detailsReady: true, identityMatches: true }), "INCOMPLETE");
  assert.equal(classifyRegionalBatchRowPublication({ indexed: true, overlayGame: game, staticGame: null, detailsReady: false, identityMatches: true }), "INCOMPLETE");
  assert.equal(classifyRegionalBatchRowPublication({ indexed: true, overlayGame: game, staticGame: null, detailsReady: true, identityMatches: false }), "CONFLICT");
  assert.equal(classifyRegionalBatchRowPublication({ indexed: true, overlayGame: game, staticGame: null, detailsReady: true, identityMatches: true }), "MATCHING");
});

test("existing regional titles are preserved unless a box supplies an explicit title", () => {
  const result = expandRegionalVariantBatch({
    title: "ESPN Extreme Games",
    platformSlug: "ps1",
    groups: [
      { markets: ["US"], existingCatalogIds: { US: "ps1-usa-1xtreme" } },
      { markets: ["JP"], regionalTitle: "ESPN Street Games", existingCatalogIds: { JP: "ps1-japon-espn-streetgames" } },
      { markets: ["EU_GENERIC"] },
    ],
  });
  assert.ok(!("error" in result));
  assert.equal(result.rows[0].regionalTitle, null);
  assert.equal(result.rows[1].regionalTitle, "ESPN Street Games");
  assert.equal(result.rows[2].regionalTitle, "ESPN Extreme Games");

  const linked = result.rows[0];
  const published = {
    id: linked.existingCatalogId,
    title: "1Xtreme", platformSlug: "ps1", workId: "espn-extreme-games",
    region: linked.region, marketRegion: linked.marketRegion,
    physicalVariant: linked.physicalVariant,
    physicalReleaseGroup: linked.group,
  } as CatalogGame;
  assert.equal(matchesPublishedRegionalVariantRow(published, {
    title: "ESPN Extreme Games", platformSlug: "ps1", workId: "espn-extreme-games", row: linked,
  }), true);
  const japan = result.rows[1];
  assert.equal(matchesPublishedRegionalVariantRow({
    ...published, id: japan.existingCatalogId!, title: "Another game",
    region: japan.region, marketRegion: japan.marketRegion,
    physicalVariant: japan.physicalVariant, physicalReleaseGroup: japan.group,
  }, {
    title: "ESPN Extreme Games", platformSlug: "ps1", workId: "espn-extreme-games", row: japan,
  }), false);
});

test("a physical box can group markets but cannot cross broad regions", () => {
  const valid = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps5",
    groups: [{ markets: ["FR", "ES", "IT"] }, { markets: ["PT", "GB"] }],
  });
  assert.ok(!("error" in valid));
  assert.equal(valid.rows.length, 5);
  assert.equal(new Set(valid.rows.slice(0, 3).map((row) => row.group.id)).size, 1);

  const invalid = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps5",
    groups: [{ markets: ["ES", "US"] }],
  });
  assert.ok("error" in invalid);
  assert.match(invalid.error, /grandes regiones/);

  const invalidPrice = expandRegionalVariantBatch({
    title: "Example",
    platformSlug: "ps5",
    groups: [{ markets: ["ES"], marketPrices: { ES: { estimatedPriceComplete: -1 } } }],
  });
  assert.ok("error" in invalidPrice);
  assert.match(invalidPrice.error, /precio no válido/);
});

test("different physical boxes can reuse a market without sharing an identity", () => {
  const result = expandRegionalVariantBatch({
    title: ".hack//G.U. Last Recode",
    platformSlug: "ps4",
    baseSlug: "hack-gu-last-recode",
    physicalVariant: "Premium Edition",
    groups: [
      {
        label: "Standard Japan",
        markets: ["JP"],
        barcode: "4573173322188",
        existingCatalogIds: { JP: "ps4-japon-hack-gu-last-recode-jp" },
      },
      { label: "Premium Edition Japan", markets: ["JP"], barcode: "4573173322195" },
      { label: "Welcome Price Japan", markets: ["JP"], barcode: "4573173343343" },
    ],
  });

  assert.ok(!("error" in result));
  assert.equal(result.rows.length, 3);
  assert.equal(new Set(result.rows.map((row) => row.slug)).size, 3);
  assert.deepEqual(result.rows.map((row) => row.slug), [
    "hack-gu-last-recode-jp",
    "hack-gu-last-recode-jp-premium-edition-japan",
    "hack-gu-last-recode-jp-welcome-price-japan",
  ]);
  assert.notEqual(result.rows[0].group.id, result.rows[1].group.id);
});

test("same-market boxes use their physical edition when custom labels are blank", () => {
  const result = expandRegionalVariantBatch({
    title: "'98 Koshien",
    platformSlug: "ps1",
    baseSlug: "98-koshien",
    physicalVariant: "Standard",
    groups: [
      {
        physicalVariant: "Standard",
        markets: ["JP"],
        existingCatalogIds: { JP: "ps1-japon-%2798-koshien" },
      },
      { physicalVariant: "Magical 1500", markets: ["JP"] },
      { physicalVariant: "Taikenban / Demo", markets: ["JP"] },
    ],
  });

  assert.ok(!("error" in result));
  assert.deepEqual(result.rows.map((row) => row.slug), [
    "98-koshien-jp",
    "98-koshien-jp-magical-1500",
    "98-koshien-jp-taikenban-demo",
  ]);
  assert.equal(new Set(result.rows.map((row) => row.slug)).size, 3);
});

test("a regional batch can explicitly reuse existing catalog entries", () => {
  const result = expandRegionalVariantBatch({
    title: "007 Blood Stone",
    platformSlug: "ps3",
    groups: [
      { markets: ["ES"], existingCatalogIds: { ES: "ps3-007-blood-stone" } },
      { markets: ["US"], existingCatalogIds: { US: "ps3-usa-007-blood-stone" } },
    ],
  });
  assert.ok(!("error" in result));
  assert.equal(result.rows.find((row) => row.market === "ES")?.existingCatalogId, "ps3-007-blood-stone");
  assert.equal(result.rows.find((row) => row.market === "US")?.existingCatalogId, "ps3-usa-007-blood-stone");

  const duplicate = expandRegionalVariantBatch({
    title: "Duplicate",
    platformSlug: "ps3",
    groups: [
      { markets: ["ES"], existingCatalogIds: { ES: "ps3-existing" } },
      { markets: ["FR"], existingCatalogIds: { FR: "ps3-existing" } },
    ],
  });
  assert.ok("error" in duplicate);
  assert.match(duplicate.error, /asignada más de una vez/);
});

test("V2 keeps regional links but counts one physical edition per shared box", () => {
  const result = expandRegionalVariantBatch({
    title: "Mortal Shell II",
    platformSlug: "ps5",
    physicalVariant: "Standard",
    groups: MORTAL_SHELL_GROUPS,
  });
  assert.ok(!("error" in result));
  const games = result.rows.map((row, index) => ({
    id: `ps5-mortal-shell-ii-${index}`,
    slug: row.slug,
    title: "Mortal Shell II",
    titlePc: "Mortal Shell II",
    platformSlug: "ps5",
    region: row.region,
    marketRegion: row.marketRegion,
    physicalReleaseGroup: row.group,
    physicalVariant: "Standard",
    edition: "standard",
    listingStatus: "listed",
    regionalStatus: "resolved",
    workId: "mortal-shell-ii",
    coverUrl: null,
  } as CatalogGame));
  const guide = buildRuntimeCatalogEditionGuide(games[0], [], games);
  assert.equal(guide.physicalEditions.length, 11);
  assert.equal(guide.editionFamilies.length, 1);
  assert.equal(guide.editionFamilies[0].label, "Estándar");
  assert.ok(guide.physicalEditions.every((edition) => edition.editionType === "STANDARD"));
  const northAmerica = guide.physicalEditions.find((edition) => edition.barcode === "810136675634");
  assert.deepEqual(northAmerica?.marketRegions.sort(), ["CA", "US"]);
  assert.equal(northAmerica?.catalogIds.length, 2);
  const asia = guide.physicalEditions.find((edition) => edition.marketRegions.includes("HK"));
  assert.deepEqual(asia?.marketRegions.sort(), ["HK", "TW"]);
  assert.equal(guide.editionFamilies[0].physicalEditionIds.length, 11);
});

test("V2 prefers a named physical variant over a legacy standard edition", () => {
  const game = {
    id: "ps3-007-quantum-of-solace-not-for-resale",
    slug: "007-quantum-of-solace-not-for-resale",
    title: "007 Quantum of Solace",
    titlePc: "007 Quantum of Solace",
    platformSlug: "ps3",
    region: "PAL Europa",
    marketRegion: "EU_GENERIC",
    physicalVariant: "Not For Resale",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
  } as CatalogGame;

  const guide = buildRuntimeCatalogEditionGuide(game, [], [game]);
  const edition = guide.physicalEditions.find((candidate) => candidate.catalogIds.includes(game.id));
  const family = guide.editionFamilies.find((candidate) => edition && candidate.physicalEditionIds.includes(edition.id));

  assert.equal(family?.label, "Not For Resale");
  assert.equal(edition?.label, "Not For Resale");
});

test("V2 recognizes a legacy bracketed variant even without physicalVariant", () => {
  const game = {
    id: "ps3-007-quantum-of-solace-t-shirt-bundle",
    slug: "007-quantum-of-solace-t-shirt-bundle",
    title: "007 Quantum of Solace [T-Shirt Bundle]",
    titlePc: "007 Quantum of Solace [T-Shirt Bundle]",
    platformSlug: "ps3",
    region: "NTSC USA",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
  } as CatalogGame;

  const guide = buildRuntimeCatalogEditionGuide(game, [], [game]);
  const edition = guide.physicalEditions.find((candidate) => candidate.catalogIds.includes(game.id));
  const family = guide.editionFamilies.find((candidate) => edition && candidate.physicalEditionIds.includes(edition.id));

  assert.equal(family?.label, "T-Shirt Bundle");
  assert.equal(edition?.label, "T-Shirt Bundle");
});

test("the detail guide folds a published batch into the existing V2 central card", () => {
  const result = expandRegionalVariantBatch({
    title: "Mortal Shell II",
    platformSlug: "ps5",
    physicalVariant: "Standard",
    groups: MORTAL_SHELL_GROUPS,
  });
  assert.ok(!("error" in result));
  const runtimeGames = result.rows.map((row, index) => ({
    id: `ps5-mortal-shell-ii-runtime-${index}`,
    slug: row.slug,
    title: "Mortal Shell II",
    titlePc: "Mortal Shell II",
    platformSlug: "ps5",
    region: row.region,
    marketRegion: row.marketRegion,
    physicalReleaseGroup: row.group,
    physicalVariant: "Standard",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
  } as CatalogGame));
  const genericGames = [
    { id: "ps5-mortal-shell-ii", region: "PAL España", marketRegion: "ES" },
    { id: "ps5-usa-mortal-shell-ii", region: "NTSC USA", marketRegion: "US" },
  ].map((entry) => ({
    ...entry,
    slug: "mortal-shell-ii",
    title: "Mortal Shell II",
    titlePc: "Mortal Shell II",
    platformSlug: "ps5",
    physicalVariant: null,
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
  } as CatalogGame));

  const baseGuide = buildRuntimeCatalogEditionGuide(genericGames[0], [], genericGames);
  const browseGuide = buildRuntimeCatalogEditionGuide(runtimeGames[0], [baseGuide], runtimeGames);
  assert.equal(browseGuide.physicalEditions.length, 11);
  assert.equal(browseGuide.editionFamilies[0].physicalEditionIds.length, 11);
  const fallbackBrowseGuide = buildRuntimeCatalogEditionGuide(
    runtimeGames[0],
    [],
    [...genericGames, ...runtimeGames],
  );
  assert.equal(fallbackBrowseGuide.physicalEditions.length, 11);
  assert.equal(fallbackBrowseGuide.editionFamilies[0].physicalEditionIds.length, 11);

  const merged = extendCatalogEditionGuideWithRuntimeGames(
    baseGuide,
    runtimeGames.find((game) => game.marketRegion === "ES")!,
    [...genericGames, ...runtimeGames],
  );

  assert.equal(merged.physicalEditions.length, 11);
  assert.equal(merged.editionFamilies[0].physicalEditionIds.length, 11);
  assert.equal(new Set(merged.physicalEditions.flatMap((edition) => edition.catalogIds)).size, 15);
  const spanish = merged.physicalEditions.find((edition) => edition.marketRegions.includes("ES"));
  assert.ok(spanish?.catalogIds.includes("ps5-mortal-shell-ii"));
  const northAmerica = merged.physicalEditions.find((edition) => edition.barcode === "810136675634");
  assert.deepEqual(northAmerica?.marketRegions.sort(), ["CA", "US"]);
  assert.ok(northAmerica?.catalogIds.includes("ps5-usa-mortal-shell-ii"));
});

test("a regional box keeps its gallery, physical data and independent market prices", () => {
  const result = expandRegionalVariantBatch({
    title: "Mortal Shell II",
    platformSlug: "ps5",
    groups: [{
      markets: ["US", "CA"],
      barcode: "810136675634",
      physicalContentStatus: "PHYSICAL_FULL_GAME",
      physicalProductType: "NATIVE_GAME_DISC",
      physicalContents: ["Caja", "Juego"],
      softwareLanguages: ["EN", "FR"],
      ratingSystems: ["ESRB M"],
      catalogNumber: "PPSA-99999",
      serial: "PPSA-99999",
      boxCode: "675634-CVR",
      releaseDate: "2026-08-20",
      releaseDateContext: "Lanzamiento norteamericano",
      images: [{
        key: "mortal-shell-ii-na-front",
        placement: "GALLERY",
        url: "/covers/ps5/mortal-shell-ii-na-front.jpg",
        thumbnailUrl: "/covers/ps5/mortal-shell-ii-na-front.jpg",
        width: 1200,
        height: 1600,
        caption: "Portada",
        evidenceType: "OWNER_CONFIRMATION",
      }],
      marketPrices: {
        US: { estimatedPriceComplete: 45, estimatedPriceSealed: 60 },
        CA: { estimatedPriceComplete: 55, estimatedPriceSealed: 70 },
      },
    }],
  });
  assert.ok(!("error" in result));
  assert.equal(result.rows[0].group.images?.[0]?.caption, "Portada");
  assert.equal(result.rows[0].group.physicalProductType, "NATIVE_GAME_DISC");
  assert.equal(result.rows.find((row) => row.market === "US")?.initialPrices?.estimatedPriceComplete, 45);
  assert.equal(result.rows.find((row) => row.market === "CA")?.initialPrices?.estimatedPriceComplete, 55);

  const games = result.rows.map((row, index) => ({
    id: `ps5-mortal-shell-ii-na-${index}`,
    slug: row.slug,
    title: "Mortal Shell II",
    titlePc: "Mortal Shell II",
    platformSlug: "ps5",
    region: row.region,
    marketRegion: row.marketRegion,
    physicalReleaseGroup: row.group,
    physicalVariant: "Standard",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: row.group.coverUrl ?? null,
  } as CatalogGame));
  const guide = buildRuntimeCatalogEditionGuide(games[0], [], games);
  const edition = guide.physicalEditions.find((candidate) => candidate.barcode === "810136675634");
  assert.ok(edition);
  assert.equal(edition.images[0]?.caption, "Portada");
  assert.equal(edition.ratingSystems[0], "ESRB M");
  assert.equal(edition.physicalContents[0], "Caja");
  assert.deepEqual(edition.softwareLanguages, ["EN", "FR"]);
  assert.equal(edition.catalogNumber, "PPSA-99999");
  assert.equal(edition.serial, "PPSA-99999");
  assert.equal(edition.boxCode, "675634-CVR");
  assert.equal(edition.releaseDate, "2026-08-20");
  assert.equal(edition.releaseDateContext, "Lanzamiento norteamericano");
});

test("boxes from the same market can keep different physical editions", () => {
  const result = expandRegionalVariantBatch({
    title: ".hack//G.U. Last Recode",
    platformSlug: "ps4",
    physicalVariant: "Standard",
    groups: [
      { label: "JP Standard", markets: ["JP"], barcode: "4573173322188" },
      { label: "JP Premium", physicalVariant: "Premium Edition", markets: ["JP"], barcode: "4573173322195" },
      { label: "JP Welcome Price!!", physicalVariant: "Welcome Price!!", markets: ["JP"], barcode: "4573173343343" },
    ],
  });

  assert.ok(!("error" in result));
  assert.deepEqual(result.rows.map((row) => row.physicalVariant), [
    "Standard",
    "Premium Edition",
    "Welcome Price!!",
  ]);
  assert.equal(new Set(result.rows.map((row) => row.slug)).size, 3);
  assert.match(result.rows[0].group.id, /:standard:/);
  assert.match(result.rows[1].group.id, /:premium-edition:/);
  assert.match(result.rows[2].group.id, /:welcome-price:/);
});
