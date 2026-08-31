import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogGame, resolveCatalogIdParam } from "./catalog";

test("keeps removed duplicate catalog ids compatible with their surviving record", () => {
  assert.equal(
    resolveCatalogIdParam("ps4-adam%27s-venture-origins"),
    "ps4-adam-s-venture-origins",
  );
  assert.equal(
    resolveCatalogIdParam("ps4-adam's-venture-origins"),
    "ps4-adam-s-venture-origins",
  );
  assert.equal(
    getCatalogGame("ps4-earth%27s-dawn")?.id,
    "ps4-earth-s-dawn",
  );
});
