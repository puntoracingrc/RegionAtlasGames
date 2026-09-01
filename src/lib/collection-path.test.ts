import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionCatalogAnchorId,
  collectionCatalogReturnPath,
} from "./collection-path";

test("builds a stable collection anchor for returning to a game", () => {
  assert.equal(
    collectionCatalogAnchorId("ps4-13-sentinels-aegis-rim"),
    "collection-game-ps4-13-sentinels-aegis-rim",
  );
  assert.equal(
    collectionCatalogReturnPath("ps4-game/collector's-edition"),
    "/coleccion#collection-game-ps4-game-collector-s-edition",
  );
});
