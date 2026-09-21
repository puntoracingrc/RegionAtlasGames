import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame, listedCatalog } from "./catalog";
import { getCatalogEditionGuide } from "./catalog-edition-guides";

test("the reviewed 3D promo aliases resolve to one Brazilian catalog identity", () => {
  const canonical = getCatalogGame("ps3-usa-this-is-the-next-level");
  const alias = getCatalogGame("ps3-usa-3d-logo-and-demo-disc");

  assert.ok(canonical);
  assert.equal(alias?.id, canonical.id);
  assert.equal(canonical.title, "This Is the Next Level: 3D Games and Demo Disc");
  assert.equal(canonical.region, "Brasil");
  assert.equal(canonical.marketRegion, "BR");
  assert.equal(canonical.physicalReleaseGroup?.serial, "BCUS-98274");
  assert.equal(canonical.physicalReleaseGroup?.barcode, null);
  assert.equal(
    listedCatalog.some((game) => game.id === "ps3-usa-3d-logo-and-demo-disc"),
    false,
  );
});

test("the reviewed PS3 3D products keep their distinct physical identities", () => {
  const gamingPack = getCatalogGame("ps3-3d-gaming-pack");
  const collection = getCatalogGame("ps3-3d-collection-asia");

  assert.ok(gamingPack);
  assert.equal(gamingPack.region, "PAL Australia");
  assert.equal(gamingPack.marketRegion, "AU");
  assert.equal(gamingPack.physicalReleaseGroup?.physicalContentStatus, "CODE_IN_BOX");
  assert.equal(gamingPack.physicalReleaseGroup?.physicalProductType, "DOWNLOAD_CODE_IN_BOX");

  assert.ok(collection);
  assert.equal(collection.title, "3D Collection");
  assert.equal(collection.region, "Asia");
  assert.deepEqual(collection.physicalReleaseGroup?.productCodes, ["BCAS-20136"]);
  assert.equal(collection.physicalReleaseGroup?.barcode, "4948872961356");
  assert.notEqual(collection.workId, gamingPack.workId);
});

test("the reviewed Super Robot Wars Z releases keep editions and digital bonuses separate", () => {
  const jigoku = getCatalogGame("ps3-japon-3rd-super-robot-wars-z-jigoku-hen");
  const jigokuBest = getCatalogGame("ps3-japon-3rd-super-robot-wars-z-jigoku-hen-playstation-3-the-best");
  const tengoku = getCatalogGame("ps3-japon-3rd-super-robot-wars-z-tengokuhen");

  assert.ok(jigoku);
  assert.equal(jigoku.title, "3rd Super Robot Wars Z: Jigoku-hen");
  assert.equal(jigoku.physicalReleaseGroup?.barcode, "4560467043386");
  assert.deepEqual(jigoku.physicalReleaseGroup?.productCodes, ["BLJS-10256"]);

  assert.ok(jigokuBest);
  assert.equal(jigokuBest.workId, jigoku.workId);
  assert.equal(jigokuBest.physicalVariant, "PlayStation 3 the Best");
  assert.equal(jigokuBest.physicalReleaseGroup?.barcode, "4560467046905");
  assert.deepEqual(jigokuBest.physicalReleaseGroup?.productCodes, ["BLJS-50041"]);

  const jigokuGuide = getCatalogEditionGuide(jigoku);
  assert.equal(jigokuGuide?.editionFamilies.length, 2);
  assert.deepEqual(
    jigokuGuide?.editionFamilies.map((family) => family.label).sort(),
    ["Estándar", "PlayStation 3 the Best"].sort(),
  );

  assert.ok(tengoku);
  assert.notEqual(tengoku.workId, jigoku.workId);
  assert.equal(tengoku.title, "3rd Super Robot Wars Z: Tengoku-hen");
  assert.equal(tengoku.physicalReleaseGroup?.barcode, "4560467047209");
  assert.deepEqual(tengoku.physicalReleaseGroup?.productCodes, ["BLJS-10299"]);
  assert.match(tengoku.physicalReleaseGroup?.notes?.join(" ") ?? "", /Rengoku-hen.*digital/i);
  assert.equal(
    listedCatalog.some((game) => /Rengoku-hen/i.test(game.title) && game.platformSlug === "ps3"),
    false,
  );
});
