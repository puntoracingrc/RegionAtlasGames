import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame } from "./catalog";
import { catalogDerivedEditionType } from "./catalog-derived-edition-guides";

test("regional Multi-PAL packaging does not turn a standard game into Other", () => {
  const game = getCatalogGame("switch-3d-mini-golf");
  assert.ok(game);
  assert.equal(catalogDerivedEditionType({ ...game, edition: "Multi PAL", physicalVariant: "Multi-PAL / PAL EUR" }), "STANDARD");
  assert.equal(catalogDerivedEditionType({ ...game, edition: "Multi PAL", physicalVariant: "Standard" }), "STANDARD");
  assert.equal(catalogDerivedEditionType({ ...game, edition: "Multi PAL Limited Edition", physicalVariant: "PAL EUR" }), "LIMITED");
});
