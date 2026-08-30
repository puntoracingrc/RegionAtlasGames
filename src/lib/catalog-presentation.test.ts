import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeCatalogDisplayText,
  normalizeCatalogGamePresentation,
  normalizeGameDetailsPresentation,
} from "./catalog-presentation";
import type { CatalogGame, GameDetails } from "./types";
import { getCoverSrc } from "./cover-url";

test("decodes repeated HTML entities without decoding URL escapes", () => {
  assert.equal(decodeCatalogDisplayText("Tom &amp;amp; Jerry&#39;s"), "Tom & Jerry's");
  assert.equal(decodeCatalogDisplayText("Collector%27s Edition"), "Collector%27s Edition");
});

test("normalizes presentation fields while preserving stable identifiers", () => {
  const game = {
    id: "ps4-tom-%26-jerry%27s",
    slug: "tom-%26-jerry%27s",
    title: "Tom &amp; Jerry&#39;s",
    titlePc: "Tom &amp;amp; Jerry&#39;s",
  } as CatalogGame;

  const normalized = normalizeCatalogGamePresentation(game);
  assert.equal(normalized.id, game.id);
  assert.equal(normalized.slug, game.slug);
  assert.equal(normalized.title, "Tom & Jerry's");
  assert.equal(normalized.titlePc, "Tom & Jerry's");
});

test("normalizes only user-facing detail text", () => {
  const details = {
    description: "Acción &amp; aventura",
    reference: "REF&#39;01",
    museumPath: "/game/foo&amp;bar",
  } as GameDetails;

  const normalized = normalizeGameDetailsPresentation(details);
  assert.equal(normalized.description, "Acción & aventura");
  assert.equal(normalized.reference, "REF'01");
  assert.equal(normalized.museumPath, details.museumPath);
});

test("allows curated local catalog covers without allowing arbitrary URLs", () => {
  assert.equal(
    getCoverSrc("/catalog-covers/ps4/1971-project-helios.jpg"),
    "/catalog-covers/ps4/1971-project-helios.jpg",
  );
  assert.equal(getCoverSrc("https://untrusted.example/cover.jpg"), null);
});
