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
