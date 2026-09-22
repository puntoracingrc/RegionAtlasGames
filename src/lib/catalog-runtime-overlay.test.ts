import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_DEPLOY_HOOK_TIMEOUT_MS,
  catalogDeployHookRequestInit,
} from "./catalog-runtime-overlay";

test("the catalog deploy hook is best-effort and time bounded", () => {
  const request = catalogDeployHookRequestInit();

  assert.equal(request.method, "POST");
  assert.equal(CATALOG_DEPLOY_HOOK_TIMEOUT_MS, 5_000);
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(request.signal.aborted, false);
});
