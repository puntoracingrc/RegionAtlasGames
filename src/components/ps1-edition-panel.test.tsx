import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Ps1EditionPanel } from "./ps1-edition-panel";
import { getCatalogGame } from "@/lib/catalog";
import type { CatalogGame, GameDetails } from "@/lib/types";

test("PS1 panel trusts a confirmed V2 box over a stale legacy review flag", () => {
  const base = getCatalogGame("ps1-usa-1xtreme");
  assert.ok(base);
  const details = { ps1Edition: {
    status: "review", languages: null, components: [], graphics: [], sources: [],
  } } as unknown as GameDetails;
  const box = { confidence: "CONFIRMED" } as NonNullable<CatalogGame["physicalReleaseGroup"]>;
  const game = { ...base, regionalStatus: "resolved", physicalReleaseGroup: box } as CatalogGame;
  const html = renderToStaticMarkup(createElement(Ps1EditionPanel, { game, details }));
  assert.doesNotMatch(html, /El mercado de esta ficha está pendiente de confirmar/);
  assert.match(html, /Región/);

  const unresolved = renderToStaticMarkup(createElement(Ps1EditionPanel, {
    game: { ...game, physicalReleaseGroup: { ...box, confidence: "PENDING_IDENTIFIER" } }, details,
  }));
  assert.match(unresolved, /El mercado de esta ficha está pendiente de confirmar/);
});
