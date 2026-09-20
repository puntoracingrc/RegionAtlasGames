import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getCatalogGame } from "@/lib/catalog";
import { GamePriceHero } from "./game-price-hero";

test("detail price cards show the exact regional trend and omit transport totals", () => {
  const game = getCatalogGame("ps4-hack-gu-last-recode");
  assert.ok(game);

  const html = renderToStaticMarkup(
    <GamePriceHero game={game} allowedBuckets={["complete", "sealed"]} />,
  );

  assert.match(html, /65(?:\u00a0|&nbsp;)€/);
  assert.match(html, /Bajada de al menos 5 €/);
  assert.doesNotMatch(html, /Transporte estimado/);
  assert.doesNotMatch(html, /Artículo \+ transporte/);
  assert.doesNotMatch(html, /entrega calculada/);
});
