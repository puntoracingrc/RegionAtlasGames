import assert from "node:assert/strict";
import test from "node:test";
import { resolveEncodedCatalogIdParam } from "./catalog-id-param";

const ids = new Set([
  "ps4-normal-game",
  "3ds-collector%27s-edition",
  "3ds-cats-&amp;-dogs",
]);

test("prefers the exact opaque catalog identifier", () => {
  assert.equal(
    resolveEncodedCatalogIdParam("3ds-collector%27s-edition", (id) => ids.has(id)),
    "3ds-collector%27s-edition",
  );
});

test("recovers one transport-encoding layer without changing the canonical id", () => {
  assert.equal(
    resolveEncodedCatalogIdParam("3ds-collector%2527s-edition", (id) => ids.has(id)),
    "3ds-collector%27s-edition",
  );
  assert.equal(
    resolveEncodedCatalogIdParam("3ds-cats-%26amp%3B-dogs", (id) => ids.has(id)),
    "3ds-cats-&amp;-dogs",
  );
});

test("recovers a legacy percent id after an upstream proxy decodes it", () => {
  assert.equal(
    resolveEncodedCatalogIdParam("3ds-collector's-edition", (id) => ids.has(id)),
    "3ds-collector%27s-edition",
  );
});

test("leaves normal, unknown and malformed identifiers untouched", () => {
  assert.equal(resolveEncodedCatalogIdParam("ps4-normal-game", (id) => ids.has(id)), "ps4-normal-game");
  assert.equal(resolveEncodedCatalogIdParam("ps4-unknown%27game", (id) => ids.has(id)), "ps4-unknown%27game");
  assert.equal(resolveEncodedCatalogIdParam("ps4-bad%id", (id) => ids.has(id)), "ps4-bad%id");
});
