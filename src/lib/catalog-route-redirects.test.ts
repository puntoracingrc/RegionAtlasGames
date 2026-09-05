import assert from "node:assert/strict";
import test from "node:test";
import {
  getCatalogRedirectTargetIdForCatalogId,
  getCatalogRouteRedirect,
} from "./catalog-route-redirects";

test("resolves safe duplicate redirects by catalog id and legacy SEO slug", () => {
  assert.equal(
    getCatalogRedirectTargetIdForCatalogId("ps4-rpg-maker"),
    "ps4-rpg-maker-with",
  );
  assert.equal(
    getCatalogRouteRedirect("rpg-maker-ps4-pal-es")?.targetCatalogId,
    "ps4-rpg-maker-with",
  );
  assert.equal(
    getCatalogRouteRedirect("ps4-jets-%27n%27-guns-2")?.targetCatalogId,
    "ps4-jets%27n%27guns-2",
  );
});

test("redirects workbook-scoped wrong-platform records to their verified catalog entry", () => {
  assert.equal(
    getCatalogRouteRedirect("cars-ps4-pal-es")?.targetCatalogId,
    "ps2-disney-pixar-cars",
  );
  assert.equal(getCatalogRouteRedirect("unrelated-game"), undefined);
});

test("every consolidated slug has a stable canonical destination", () => {
  const redirect = getCatalogRouteRedirect("ps4-rpg-maker");

  assert.equal(redirect?.targetParam, "rpg-maker-with-ps4-pal-es");
  assert.equal(redirect?.permanent, true);
});
