import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogEditionGuide } from "./catalog-edition-guide";
import { catalog, getCatalogGame } from "@/lib/catalog";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";

test("regional edition cards show trends only from their exact price identity", () => {
  const es = getCatalogGame("ps4-hack-gu-last-recode");
  const us = getCatalogGame("ps4-usa-hack-gu-last-recode");
  assert.ok(es);
  assert.ok(us);
  const sourceGuide = getCatalogEditionGuide(
    es,
    catalog.filter((game) => game.platformSlug === "ps4"),
  );
  assert.ok(sourceGuide);

  // The isolated render omits collection actions, which need the App Router.
  const guide = { ...sourceGuide, editionFamilies: [], currentEditionFamilyId: undefined };
  const html = renderToStaticMarkup(
    <CatalogEditionGuide
      game={es}
      guide={guide}
      priceGames={{ [es.id]: es, [us.id]: us }}
    />,
  );

  assert.equal((html.match(/Bajada de al menos 5 €/g) ?? []).length, 2);
  assert.match(html, /data-price-catalog-id="ps4-hack-gu-last-recode"/);
  assert.match(html, /data-price-catalog-id="ps4-usa-hack-gu-last-recode"/);
});
