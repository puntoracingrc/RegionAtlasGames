import assert from "node:assert/strict";
import test from "node:test";
import { catalogIdentityKey, findCatalogIdentityCollision } from "./catalog-identity";
import type { CatalogGame } from "./types";

function game(overrides: Partial<CatalogGame> = {}): CatalogGame {
  return {
    id: "ps4-adam-s-venture-origins",
    slug: "adam-s-venture-origins",
    title: "Adam's Venture Origins",
    titlePc: "Adam's Venture Origins",
    platformSlug: "ps4",
    region: "PAL España",
    edition: "standard",
    listingStatus: "listed",
    coverUrl: null,
    pcId: null,
    pcRegion: null,
    pcCondition: null,
    matchConfidence: null,
    marketMin: null,
    marketMax: null,
    recommendedPrice: null,
    pcRefPrice: null,
    deltaEsVsPc: null,
    priceSource: null,
    updatedAt: null,
    hasEsPrice: false,
    ...overrides,
  };
}

test("normalizes HTML entities and apostrophe variants into one catalog identity", () => {
  const expected = catalogIdentityKey(game());

  assert.equal(catalogIdentityKey(game({ title: "Adam&#39;s Venture Origins" })), expected);
  assert.equal(catalogIdentityKey(game({ title: "Adam´s Venture Origins" })), expected);
  assert.equal(catalogIdentityKey(game({ title: "Adam’s Venture Origins" })), expected);
});

test("keeps regional, edition and physical variants as separate catalog identities", () => {
  const standard = catalogIdentityKey(game());

  assert.notEqual(catalogIdentityKey(game({ region: "USA" })), standard);
  assert.notEqual(catalogIdentityKey(game({ edition: "collector" })), standard);
  assert.notEqual(catalogIdentityKey(game({ physicalVariant: "steelbook" })), standard);
});

test("finds an equivalent title while allowing the edited record itself", () => {
  const existing = game();
  const incoming = game({ id: "draft", title: "Adam&#39;s Venture Origins" });

  assert.equal(findCatalogIdentityCollision([existing], incoming)?.id, existing.id);
  assert.equal(
    findCatalogIdentityCollision([existing], incoming, { excludeCatalogId: existing.id }),
    null,
  );
});
