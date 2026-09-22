import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CatalogEditionGuide,
  catalogEditionFamilyHref,
} from "./catalog-edition-guide";
import { catalog, getCatalogGame } from "@/lib/catalog";
import { getCatalogEditionGuide } from "@/lib/catalog-edition-guides";
import type { CatalogEditionFamily } from "@/lib/catalog-edition-guide-types";

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

test("runtime edition families link to their overlay catalog route", () => {
  const es = getCatalogGame("ps4-hack-gu-last-recode");
  assert.ok(es);
  const sourceGuide = getCatalogEditionGuide(
    es,
    catalog.filter((game) => game.platformSlug === "ps4"),
  );
  assert.ok(sourceGuide);

  const runtimeCatalogId = "ps4-runtime-special-edition";
  const runtimeEditionId = "runtime-special-edition";
  const runtimeFamily: CatalogEditionFamily = {
    id: "runtime-special",
    label: "Special Edition",
    representativeCatalogId: runtimeCatalogId,
    physicalEditionIds: [runtimeEditionId],
    priceConditions: ["sealed", "complete"],
  };
  const runtimeGuide = {
    ...sourceGuide,
    physicalEditions: [
      ...sourceGuide.physicalEditions,
      {
        ...sourceGuide.physicalEditions[0],
        id: runtimeEditionId,
        catalogIds: [runtimeCatalogId],
        catalogLinks: [{
          catalogId: runtimeCatalogId,
          href: "/catalogo/runtime-special-edition-ps4-pal-jp",
          current: false,
          region: "NTSC-J Japón",
        }],
      },
    ],
    editionFamilies: [...sourceGuide.editionFamilies, runtimeFamily],
  };

  assert.equal(
    catalogEditionFamilyHref(runtimeFamily, runtimeGuide),
    "/catalogo/runtime-special-edition-ps4-pal-jp",
  );
});
