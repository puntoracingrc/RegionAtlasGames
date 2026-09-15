import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import guideDocument from "../../data/catalog-edition-guides-ac-syndicate-ps4.json";
import { canonicalCatalogId } from "./catalog-id-aliases";
import { getCatalogEditionGuide, getCatalogEditionGuides } from "./catalog-edition-guides";
import { getCatalogGame } from "./catalog";

function syndicateGuide() {
  const guide = getCatalogEditionGuides().find((entry) => entry.id === "assassins-creed-syndicate-ps4");
  assert.ok(guide);
  return guide;
}

test("Syndicate PS4 is one V2 game with distinct documented physical releases", () => {
  const guide = syndicateGuide();
  assert.equal(guide.schemaVersion, 2);
  assert.equal(guide.game.canonicalCatalogId, "ps4-assassins-creed-syndicate");
  assert.equal(guide.game.title, "Assassin's Creed Syndicate");
  assert.equal(guide.physicalEditions.length, 30);
  assert.deepEqual(
    guide.physicalEditions.flatMap((edition) => edition.catalogIds).sort(),
    [
      "ps4-assassins-creed-syndicate",
      "ps4-usa-assassin%27s-creed-syndicate",
      "ps4-usa-assassin%27s-creed-syndicate-charing-cross-collector%27s-edition",
      "ps4-usa-assassin%27s-creed-syndicate-gold-edition",
      "ps4-usa-assassin%27s-creed-syndicate-limited-edition",
    ].sort(),
  );
  assert.equal(canonicalCatalogId("ps4-assassin%27s-creed-syndicate"), guide.game.canonicalCatalogId);
  assert.equal(guideDocument.schemaVersion, 2);
});

test("Syndicate regional identifiers and packaging stay attached to exact boxes", () => {
  const byId = new Map(syndicateGuide().physicalEditions.map((edition) => [edition.id, edition]));
  const spain = byId.get("assassins-creed-syndicate-ps4-standard-es");
  assert.ok(spain);
  assert.equal(spain.barcode, "3307215893227");
  assert.equal(spain.catalogNumber, "CUSA-02376");
  assert.deepEqual(spain.marketRegions, ["ES"]);
  assert.deepEqual(spain.packagingLanguages, ["ES"]);
  assert.deepEqual(spain.scanSetIds, ["ps4-assassins-creed-syndicate"]);
  assert.deepEqual(spain.ratingSystems, ["PEGI"]);

  assert.equal(byId.get("assassins-creed-syndicate-ps4-standard-it")?.barcode, "3307215893241");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-standard-benelux")?.barcode, "3307215893197");
  assert.deepEqual(byId.get("assassins-creed-syndicate-ps4-standard-nordic")?.packagingLanguages, ["NO", "SV", "DA", "FI"]);
  assert.deepEqual(byId.get("assassins-creed-syndicate-ps4-standard-cz")?.packagingLanguages, ["CS"]);
  assert.deepEqual(byId.get("assassins-creed-syndicate-ps4-standard-eu-3307215893081")?.marketRegions, []);
  assert.deepEqual(byId.get("assassins-creed-syndicate-ps4-standard-eu-3307215893210")?.marketRegions, []);
});

test("Syndicate edition families do not collapse into Standard", () => {
  const editions = syndicateGuide().physicalEditions;
  const byId = new Map(editions.map((edition) => [edition.id, edition]));
  assert.equal(byId.get("assassins-creed-syndicate-ps4-special-dfi")?.editionType, "SPECIAL");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-rooks-eu")?.editionType, "SPECIAL");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-charing-cross-fr-eu")?.editionType, "COLLECTOR");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-big-ben-eu")?.editionType, "COLLECTOR");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-gold-us")?.barcode, "887256013967");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-limited-us")?.barcode, undefined);
  assert.equal(byId.get("assassins-creed-syndicate-ps4-ubi-the-best-jp")?.catalogNumber, "PLJM-84095");
  assert.deepEqual(byId.get("assassins-creed-syndicate-ps4-ebiten-collector-jp")?.includesEditionIds, [
    "assassins-creed-syndicate-ps4-standard-jp",
  ]);
});

test("Syndicate keeps Japan, Asia, Arabic and Russian disc identities separate", () => {
  const byId = new Map(syndicateGuide().physicalEditions.map((edition) => [edition.id, edition]));
  assert.equal(byId.get("assassins-creed-syndicate-ps4-standard-jp")?.catalogNumber, "PLJM-84026");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-standard-asia")?.catalogNumber, "PLAS-07036");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-standard-middle-east")?.catalogNumber, "CUSA-02378");
  assert.equal(byId.get("assassins-creed-syndicate-ps4-standard-russia-cis")?.catalogNumber, "CUSA-02377/RUS");
  assert.notEqual(
    byId.get("assassins-creed-syndicate-ps4-standard-jp")?.id,
    byId.get("assassins-creed-syndicate-ps4-standard-asia")?.id,
  );
});

test("the local Charing Cross legacy asset is absent, so its USA classification remains pending", () => {
  const suspiciousCatalogId = "ps4-usa-assassin%27s-creed-syndicate-charing-cross-collector%27s-edition";
  const suspicious = getCatalogGame(suspiciousCatalogId);
  assert.ok(suspicious);
  assert.equal(suspicious.region, "USA");
  assert.equal(
    existsSync(path.join(process.cwd(), "public", suspicious.coverUrl!)),
    false,
  );
  const pending = syndicateGuide().physicalEditions.find((edition) => edition.catalogIds.includes(suspiciousCatalogId));
  assert.ok(pending);
  assert.equal(pending.broadRegion, "OTHER");
  assert.deepEqual(pending.marketRegions, []);
  assert.equal(pending.barcode, undefined);
  assert.match(pending.notes.join(" "), /NEEDS_REGION_CORRECTION/);
  assert.equal(getCatalogEditionGuide(suspicious)?.id, syndicateGuide().id);
});
