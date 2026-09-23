import assert from "node:assert/strict";
import test from "node:test";
import { catalogEditionContentsLayout, uniqueAlternateCatalogLinks } from "./catalog-edition-guide";

test("edition contents use the full card width when there is no contents image", () => {
  const layout = catalogEditionContentsLayout(false);

  assert.doesNotMatch(layout.wrapper, /md:grid-cols-\[/);
  assert.match(layout.details, /sm:grid-cols-\[max-content_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(layout.details, /md:grid-cols-1/);
});

test("edition contents reserve a second column only when a contents image exists", () => {
  const layout = catalogEditionContentsLayout(true);

  assert.match(layout.wrapper, /md:grid-cols-\[minmax\(0,0\.85fr\)_minmax\(18rem,1\.15fr\)\]/);
  assert.match(layout.details, /md:grid-cols-1/);
});

test("legacy catalog identities sharing a public route render one alternate link", () => {
  const links = uniqueAlternateCatalogLinks([
    { catalogId: "legacy-jp", href: "/catalogo/hack-jp", current: false, region: "NTSC-J Japón" },
    { catalogId: "overlay-jp", href: "/catalogo/hack-jp", current: false, region: "NTSC-J Japón" },
    { catalogId: "current-us", href: "/catalogo/hack-us", current: true, region: "NTSC USA" },
  ]);

  assert.deepEqual(links.map((link) => link.catalogId), ["legacy-jp"]);
});
