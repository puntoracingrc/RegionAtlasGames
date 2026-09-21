import assert from "node:assert/strict";
import test from "node:test";
import { buildCoverBlobPath } from "./covers-upload";

test("builds a stable internal path for an Admin cover", () => {
  assert.equal(
    buildCoverBlobPath("PS2", "_summer-ps2-jp-first-print-limited-edition-front"),
    "/catalog-covers/runtime/ps2/summer-ps2-jp-first-print-limited-edition-front.jpg",
  );
});
