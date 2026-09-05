import assert from "node:assert/strict";
import test from "node:test";
import {
  getVerifiedCatalogCompilation,
  getVerifiedCatalogVariant,
  getVerifiedCatalogVariants,
  resolveVerifiedCommercialCanonicalCatalogId,
} from "./catalog-commercial-relations";
import { getCatalogWorkKey } from "./catalog-work";

test("preserves a compilation entry while exposing its verified components", () => {
  const compilation = getVerifiedCatalogCompilation("ps4-mafia-trilogy");

  assert.ok(compilation);
  assert.equal(compilation.status, "verified");
  assert.equal(compilation.componentCount, 3);
  assert.deepEqual(
    compilation.components.map((component) => component.title),
    ["Mafia: Definitive Edition", "Mafia II: Definitive Edition", "Mafia III: Definitive Edition"],
  );
});

test("publishes only verified physical-variant relationships", () => {
  const collector = "ps4-armored-core-vi-fires-of-rubicon-collector%27s-edition";
  const standard = "ps4-armored-core-vi-fires-of-rubicon";

  assert.equal(getVerifiedCatalogVariant(collector)?.canonicalCatalogId, standard);
  assert.equal(resolveVerifiedCommercialCanonicalCatalogId(collector), standard);
  assert.equal(getVerifiedCatalogVariants(standard).length, 2);
  assert.equal(getVerifiedCatalogVariant("ps4-dishonored-pray-arkane-collection"), undefined);
});

test("verified variants share a work identity without removing their catalog entries", () => {
  assert.equal(
    getCatalogWorkKey("ps4-young-souls-collector%27s-edition"),
    getCatalogWorkKey("ps4-young-souls"),
  );
  assert.equal(
    getCatalogWorkKey("ps4-young-souls-deluxe-edition"),
    getCatalogWorkKey("ps4-young-souls"),
  );
});
