import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Ps2EditionPanel } from "./ps2-edition-panel";
import { getCatalogGame } from "@/lib/catalog";
import type { GameDetails } from "@/lib/types";

test("PS2 detail page renders when an Admin overlay has only a partial edition profile", () => {
  const game = getCatalogGame("ps2-jp-slps-25655");
  assert.ok(game);

  for (const status of ["review", "resolved"] as const) {
    const details = { ps2Edition: { status, languages: {} } } as GameDetails;
    const html = renderToStaticMarkup(createElement(Ps2EditionPanel, { game, details }));
    assert.match(html, /Edición, idiomas y documentación/);
    if (status === "review") assert.match(html, /necesita contraste/);
  }
});
