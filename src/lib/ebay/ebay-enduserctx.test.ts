import assert from "node:assert/strict";
import test from "node:test";
import { buildEbayEndUserContext } from "./ebay-enduserctx";

test("encodes destination country and postal code inside contextualLocation", () => {
  assert.equal(
    buildEbayEndUserContext({ country: "ES", zip: "28001" }),
    "contextualLocation=country%3DES%2Czip%3D28001",
  );
});
