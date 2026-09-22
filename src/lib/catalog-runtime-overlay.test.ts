import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_DEPLOY_HOOK_TIMEOUT_MS,
  catalogDeployHookRequestInit,
} from "./catalog-runtime-overlay";
import { overlayTitlePlatformKey, overlayWorkKey } from "./catalog-overlay-documents";

test("the catalog deploy hook is best-effort and time bounded", () => {
  const request = catalogDeployHookRequestInit();

  assert.equal(request.method, "POST");
  assert.equal(CATALOG_DEPLOY_HOOK_TIMEOUT_MS, 5_000);
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(request.signal.aborted, false);
});

test("runtime family index keys group editions without scanning the whole platform", () => {
  const standard = {
    platformSlug: "ps4",
    title: ".hack//G.U. Last Recode",
    workId: "hack-gu-last-recode",
  };
  const premium = {
    platformSlug: "ps4",
    title: ".hack//G.U. Last Recode",
    workId: "hack-gu-last-recode",
  };

  assert.equal(overlayTitlePlatformKey(standard), "ps4:hack-g-u-last-recode");
  assert.equal(overlayTitlePlatformKey(premium), overlayTitlePlatformKey(standard));
  assert.equal(overlayWorkKey(standard), "ps4:hack-gu-last-recode");
  assert.equal(overlayWorkKey({ ...standard, workId: null }), null);
});
