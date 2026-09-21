import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame, listedCatalog } from "./catalog";

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
