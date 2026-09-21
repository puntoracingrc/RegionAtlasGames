import assert from "node:assert/strict";
import test from "node:test";
import { attemptOptionalImageUpload } from "./admin-optional-image-upload";

test("an optional image upload returns its value when it succeeds", async () => {
  const result = await attemptOptionalImageUpload("Portada", async () => ({ url: "/cover.jpg" }));

  assert.deepEqual(result, {
    value: { url: "/cover.jpg" },
    warning: null,
  });
});

test("an optional image upload becomes a warning instead of throwing", async () => {
  const result = await attemptOptionalImageUpload("Contraportada UK", async () => {
    throw new Error("CDN no disponible");
  });

  assert.deepEqual(result, {
    value: null,
    warning: "Contraportada UK: CDN no disponible",
  });
});
