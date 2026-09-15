import assert from "node:assert/strict";
import test from "node:test";
import blackFlagDocument from "../../data/catalog-edition-guides-ac4-black-flag.json";
import unityValhallaDocument from "../../data/catalog-edition-guides-ac-unity-valhalla.json";
import { getCatalogGame, publicListedCatalog } from "./catalog";
import {
  getCatalogEditionGuide,
  getCatalogEditionGuides,
  normalizeCatalogEditionGuide,
  type RawCatalogEditionGuide,
} from "./catalog-edition-guides";
import { catalogGamePath } from "./catalog-path";
import { resolveCatalogGameParam } from "./catalog-url";

const BLACK_FLAG_HITS_ID = "ps4-usa-assassin%27s-creed-iv-black-flag-playstation-hits";
const UNITY_HITS_ID = "ps4-usa-assassin%27s-creed-unity-playstation-hits";
const VALHALLA_COLLECTOR_ID = "ps4-usa-assassin%27s-creed-valhalla-collector%27s-editions";

function rawGuide(document: { guides: unknown[] }, id: string) {
  const raw = document.guides.find((entry) => (entry as { id?: string }).id === id);
  assert.ok(raw, `missing guide ${id}`);
  return normalizeCatalogEditionGuide(raw as RawCatalogEditionGuide);
}

function edition(guide: ReturnType<typeof rawGuide>, id: string) {
  const value = guide.physicalEditions.find((entry) => entry.id === id);
  assert.ok(value, `missing physical edition ${id}`);
  return value;
}

test("the three residual catalog IDs resolve inside their existing canonical V2 games", () => {
  const expected = new Map([
    [BLACK_FLAG_HITS_ID, "ps4-assassins-creed-4-black-flag"],
    [UNITY_HITS_ID, "ps4-assassins-creed-unity"],
    [VALHALLA_COLLECTOR_ID, "ps4-assassins-creed-valhalla"],
  ]);

  for (const [catalogId, canonicalCatalogId] of expected) {
    const game = getCatalogGame(catalogId);
    assert.ok(game);
    const guide = getCatalogEditionGuide(game);
    assert.ok(guide);
    assert.equal(guide.game.canonicalCatalogId, canonicalCatalogId);
    assert.notEqual(guide.currentEditionId, catalogId);
  }
});

test("Black Flag PlayStation Hits legacy US identity now maps to Europe, never a fabricated NA release", () => {
  const guide = rawGuide(blackFlagDocument, "assassins-creed-iv-black-flag-ps4");
  const europe = edition(guide, "ac4-black-flag-ps4-europe-playstation-hits-6076957");
  assert.equal(europe.barcode, "3307216076957");
  assert.equal(europe.catalogNumber, "CUSA-00009");
  assert.deepEqual(europe.ratingSystems, ["PEGI 18"]);
  assert.deepEqual(europe.catalogIds, [BLACK_FLAG_HITS_ID]);

  const german = edition(guide, "ac4-black-flag-ps4-europe-germany-playstation-hits-6076926");
  assert.equal(german.barcode, "3307216076926");
  assert.deepEqual(german.marketRegions, ["DE"]);
  assert.deepEqual(german.packagingLanguages, []);

  const australian = edition(guide, "ac4-black-flag-ps4-oceania-australia-playstation-hits-6077008");
  assert.equal(australian.barcode, "3307216077008");
  assert.deepEqual(australian.marketRegions, ["AU"]);

  assert.equal(guide.physicalEditions.some((entry) =>
    entry.editionType === "BUDGET_REISSUE" &&
    entry.broadRegion === "NORTH_AMERICA" &&
    entry.catalogIds.includes(BLACK_FLAG_HITS_ID)), false);
  assert.match(guide.evidenceNote, /No hay publicación física PlayStation Hits norteamericana demostrada/);
});

test("Black Flag keeps Ubi the Best Japan separate from PlayStation Hits", () => {
  const guide = rawGuide(blackFlagDocument, "assassins-creed-iv-black-flag-ps4");
  const japan = edition(guide, "ac4-black-flag-ps4-asia-japan-ubi-the-best");
  assert.equal(japan.barcode, "4949244003599");
  assert.equal(japan.catalogNumber, "PLJM-80081");
  assert.deepEqual(japan.marketRegions, ["JP"]);
  assert.notEqual(japan.id, "ac4-black-flag-ps4-europe-playstation-hits-6076957");
});

test("Unity legacy Hits asset is Europe pending identifiers, while Asian Greatest Hits stays separate", () => {
  const guide = rawGuide(unityValhallaDocument, "assassins-creed-unity-ps4-worldwide");
  const european = edition(guide, "ac-unity-ps4-playstation-hits-europe-pending");
  assert.equal(european.broadRegion, "EUROPE");
  assert.deepEqual(european.marketRegions, []);
  assert.deepEqual(european.ratingSystems, ["PEGI 18"]);
  assert.equal(european.confidence, "PENDING_IDENTIFIER");
  assert.equal(european.barcode, undefined);
  assert.deepEqual(european.productCodes, []);
  assert.deepEqual(european.catalogIds, [UNITY_HITS_ID]);

  const asia = edition(guide, "ac-unity-ps4-greatest-hits-asia-en-zh");
  assert.equal(asia.broadRegion, "ASIA");
  assert.equal(asia.editionType, "BUDGET_REISSUE");
  assert.deepEqual(asia.softwareLanguages, ["EN", "ZH-Hant"]);
  assert.equal(asia.barcode, undefined);
  assert.match(asia.notes.join(" "), /PlayStation Hits.*alias conceptual/);

  const japan = edition(guide, "ac-unity-ps4-ubi-the-best-jp");
  assert.equal(japan.serial, "PLJM-84051");
  assert.notEqual(japan.id, asia.id);
  assert.equal(guide.physicalEditions.some((entry) =>
    entry.catalogIds.includes(UNITY_HITS_ID) && entry.marketRegions.includes("US")), false);
});

test("Valhalla Collector's Edition has separate NA and EU variants and never collapses into Ultimate", () => {
  const guide = rawGuide(unityValhallaDocument, "assassins-creed-valhalla-ps4-worldwide");
  const northAmerica = edition(guide, "ac-valhalla-ps4-collector-na");
  assert.equal(northAmerica.barcode, "887256110024");
  assert.deepEqual(northAmerica.marketRegions, ["US"]);
  assert.deepEqual(northAmerica.ratingSystems, ["ESRB M"]);
  assert.equal(northAmerica.confidence, "HIGH");
  assert.deepEqual(northAmerica.packagingLanguages, []);
  assert.deepEqual(northAmerica.catalogIds, [VALHALLA_COLLECTOR_ID]);
  assert(northAmerica.physicalContents.includes("Juego en disco (1)"));
  assert(northAmerica.digitalContents.includes("Season Pass"));

  const europe = edition(guide, "ac-valhalla-ps4-collector-eu");
  assert.equal(europe.broadRegion, "EUROPE");
  assert.equal(europe.confidence, "CONFIRMED");
  assert.equal(europe.barcode, undefined);
  assert.deepEqual(europe.productCodes, []);
  assert.deepEqual(europe.packagingLanguages, []);

  const family = guide.editionFamilies.find((entry) => entry.id === "collectors-edition");
  assert.ok(family);
  assert.equal(family.label, "Collector's Edition");
  assert.deepEqual(family.physicalEditionIds, [northAmerica.id, europe.id]);
  assert(!family.physicalEditionIds.includes("ac-valhalla-ps4-ultimate-eu-game"));
  assert(!family.physicalEditionIds.includes("ac-valhalla-ps4-ultimate-steelbook-us"));
});

test("legacy routes, legacy region labels, covers and price identities survive the V2 correction", () => {
  const expected = [
    {
      id: BLACK_FLAG_HITS_ID,
      path: "/catalogo/assassin-s-creed-iv-black-flag-playstation-hits-ps4-pal-us",
      region: "USA",
      coverUrl: "/covers/ps4/assassin-s-creed-iv-black-flag-playstation-hits.jpg",
      recommendedPrice: 6.89,
      sealedPrice: 8.63,
    },
    {
      id: UNITY_HITS_ID,
      path: "/catalogo/assassin-s-creed-unity-playstation-hits-ps4-pal-us",
      region: "USA",
      coverUrl: "/covers/ps4/assassin-s-creed-unity-playstation-hits.jpg",
      recommendedPrice: null,
      sealedPrice: undefined,
    },
    {
      id: VALHALLA_COLLECTOR_ID,
      path: "/catalogo/assassin-s-creed-valhalla-collector-s-editions-ps4-pal-us",
      region: "USA",
      coverUrl: "/covers/ps4/assassin-s-creed-valhalla-collector-s-editions.jpg",
      recommendedPrice: 144.3,
      sealedPrice: 258.33,
    },
  ];

  for (const item of expected) {
    const game = getCatalogGame(item.id);
    assert.ok(game);
    assert.equal(game.region, item.region);
    assert.equal(game.coverUrl, item.coverUrl);
    assert.equal(game.recommendedPrice, item.recommendedPrice);
    assert.equal(game.estimatedPriceSealed, item.sealedPrice);
    assert.equal(catalogGamePath(game), item.path);
    assert.equal(resolveCatalogGameParam(item.path.replace("/catalogo/", ""))?.id, item.id);
  }
});

test("the supplied 47-entry list and the expanded current PS4 catalog remain fully covered", () => {
  const expectedTitles = [
    "Assassin's Creed III Remastered",
    "Assassin's Creed IV: Black Flag",
    "Assassin's Creed Chronicles",
    "Assassin's Creed Mirage",
    "Assassin's Creed Odyssey",
    "Assassin's Creed Origins",
    "Assassin's Creed Rogue Remastered",
    "Assassin's Creed Syndicate",
    "Assassin's Creed: The Ezio Collection",
    "Assassin's Creed Unity",
    "Assassin's Creed Valhalla",
  ];
  const covered = new Set(
    getCatalogEditionGuides()
      .filter((guide) => guide.game.platformSlug === "ps4" && expectedTitles.includes(guide.game.title))
      .map((guide) => guide.game.title),
  );
  assert.equal(covered.size, 11);
  assert.deepEqual([...covered].sort(), [...expectedTitles].sort());

  const currentEntries = publicListedCatalog.filter((game) =>
    game.platformSlug === "ps4" && /assassin.?s creed/i.test(game.title),
  );
  assert.ok(currentEntries.length >= 47);
  assert.deepEqual(
    currentEntries.filter((game) => !getCatalogEditionGuide(game)).map((game) => game.id),
    [],
  );
});

test("the residual closure creates no physical Freedom Cry or Liberation Remastered entry", () => {
  const forbidden = publicListedCatalog.filter((game) =>
    game.platformSlug === "ps4" &&
    (/Assassin's Creed Freedom Cry/i.test(game.title) || /Assassin's Creed Liberation Remastered/i.test(game.title)),
  );
  assert.deepEqual(forbidden, []);
});
