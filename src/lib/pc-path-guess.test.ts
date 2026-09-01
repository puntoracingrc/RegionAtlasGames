import assert from "node:assert/strict";
import test from "node:test";

import { normalizeImportedPlatformSlug } from "./collection-platform-slugs";
import { guessPcPath } from "./pc-path-guess";

test("PS Vita PAL uses the live PriceCharting console path", () => {
  assert.deepEqual(
    guessPcPath({
      platformSlug: "psvita",
      region: "PAL España",
      title: "99 Vidas",
    }),
    {
      pcPath: "/game/pal-playstation-vita/99-vidas",
      pcRegion: "PAL EU (referencia)",
      slug: "99-vidas",
    },
  );
});

test("PS Vita imports accept the corrected and legacy console slugs", () => {
  assert.equal(normalizeImportedPlatformSlug("pal-playstation-vita"), "psvita");
  assert.equal(normalizeImportedPlatformSlug("pal-ps-vita"), "psvita");
});
