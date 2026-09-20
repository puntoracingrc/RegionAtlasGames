import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCatalogGame, catalog, getPlatform } from "./catalog";
import { getCatalogEditionGuide } from "./catalog-edition-guides";
import { mergeCatalogRegionalPhysicalDetails } from "./catalog-runtime-overlay";

const detailData = JSON.parse(readFileSync("data/game-details.json", "utf8"));
const ps4 = () => getCatalogEditionGuide(getCatalogGame("ps4-a-way-out")!)!;
const xbox = () => getCatalogEditionGuide(getCatalogGame("xboxone-usa-a-way-out")!)!;

test("A Way Out enriches the two existing PS4 identities and adds one native Xbox One identity", () => {
  assert.deepEqual(catalog.filter(g => g.title === "A Way Out").map(g => g.id).sort(), [
    "ps4-a-way-out", "ps4-usa-a-way-out", "xboxone-usa-a-way-out",
  ]);
  assert.equal(getPlatform("xboxone")?.active, true);
  assert.equal(ps4().physicalEditions.length, 12);
  assert.equal(xbox().physicalEditions.length, 6);
  for (const edition of xbox().physicalEditions) {
    assert.equal(edition.nativePhysicalPlatform, "xboxone");
    assert.equal(edition.physicalProductType, "NATIVE_GAME_DISC");
    assert.equal(edition.serial, undefined, "commercial MPN is not a disc serial");
  }
});

test("PS4 physical identifiers are bound to the regional barcode, not a title-only match", () => {
  for (const [id, serial, barcode] of [
    ["ps4-a-way-out", "CUSA-08004", "5030931122767"],
    ["ps4-usa-a-way-out", "CUSA-07995", "014633739138"],
  ]) {
    const d = detailData[id];
    assert.equal(d.reference, serial);
    assert.equal(d.ean, barcode);
    assert.equal(d.fieldSources.reference, "research");
    assert.equal(d.sources.serialstation.titleId, "CUSA07919", "retain the superseded source as history");
    const edition = ps4().physicalEditions.find(e => e.catalogIds.includes(id))!;
    assert.equal(edition.serial, serial);
    assert.equal(edition.barcode, barcode);
  }
});

test("shared V2 editorial details do not overwrite regional CUSA/UPC at runtime", () => {
  const result = mergeCatalogRegionalPhysicalDetails(
    getCatalogGame("ps4-usa-a-way-out")!,
    detailData["ps4-a-way-out"],
    detailData["ps4-usa-a-way-out"],
  );
  assert.equal(result?.reference, "CUSA-07995");
  assert.equal(result?.ean, "014633739138");
  assert.equal(result?.fieldSources?.reference, "research");
});

test("missing regional identifiers do not inherit the canonical box's identifiers", () => {
  const game = getCatalogGame("ps4-usa-a-way-out")!;
  const shared = detailData["ps4-a-way-out"];
  const result = mergeCatalogRegionalPhysicalDetails(game, shared, undefined)!;
  assert.equal(result.reference, null);
  assert.equal(result.ean, null);
  assert.equal(result.sources?.serialstation, undefined);
  assert.equal(result.developer, shared.developer);
  assert.equal(mergeCatalogRegionalPhysicalDetails(game, undefined, undefined), undefined);
  assert.equal(mergeCatalogRegionalPhysicalDetails(game, undefined, detailData[game.id]), detailData[game.id]);
});

test("unverified CUSA, distribution and packaging claims are not promoted", () => {
  for (const suffix of ["nordic", "ca", "br"]) {
    const edition = ps4().physicalEditions.find(e => e.id === `a-way-out-ps4-${suffix}`)!;
    assert.equal(edition.serial, undefined);
    assert.deepEqual(edition.softwareFamilyCodes, []);
  }
  assert.deepEqual(ps4().physicalEditions.find(e => e.id.endsWith("-nordic"))!.evidenceMarkets, ["DK", "NO", "SE"]);
  for (const guide of [ps4(), xbox()]) {
    for (const edition of guide.physicalEditions) {
      assert.deepEqual(edition.distributionMarkets, []);
      if (!["a-way-out-ps4-pl", "a-way-out-ps4-ch"].includes(edition.id)) {
        assert.deepEqual(edition.packagingLanguages, []);
      } else {
        assert.ok(edition.componentLanguageEvidence.every(e => e.basis === "DECLARED"));
      }
      assert.ok(edition.evidence.length > 0);
      assert.ok(edition.evidence.every(e => e.type === "UNKNOWN"));
      assert.equal(edition.images.length, 0);
      assert.notEqual(edition.confidence, "CONFIRMED_PHYSICAL_COPY");
      assert.equal(edition.fullGameDownloadRequired, undefined);
    }
  }
});

test("Xbox One import has no fabricated prices, cover, serial or native Series edition", () => {
  const game = getCatalogGame("xboxone-usa-a-way-out")!;
  assert.equal(game.coverUrl, null);
  assert.equal(game.recommendedPrice, null);
  assert.equal(game.priceSource, null);
  assert.equal(detailData[game.id].ean, "014633739152");
  assert.equal(detailData[game.id].reference, null);
  assert.equal(catalog.some(g => g.platformSlug === "xboxseries" && g.title === "A Way Out"), false);
});
