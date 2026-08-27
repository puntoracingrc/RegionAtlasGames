import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedMutationOrigin } from "./request-origin";
import { assertSafeRemoteUrl, isPrivateOrReservedIp } from "./remote-fetch";
import {
  checkRateLimit,
  readJsonBody,
  resetMemoryRateLimitsForTests,
} from "./request-security";

test("accepts same-origin mutations and rejects cross-origin requests", () => {
  const sameOrigin = new Request("https://www.regionatlas.games/api/auth/login", {
    method: "POST",
    headers: { origin: "https://www.regionatlas.games" },
  });
  const crossOrigin = new Request("https://www.regionatlas.games/api/auth/login", {
    method: "POST",
    headers: { origin: "https://example.com" },
  });
  const missingOrigin = new Request("https://www.regionatlas.games/api/auth/login", {
    method: "POST",
  });

  assert.equal(isTrustedMutationOrigin(sameOrigin), true);
  assert.equal(isTrustedMutationOrigin(crossOrigin), false);
  assert.equal(isTrustedMutationOrigin(missingOrigin), false);
  assert.equal(
    isTrustedMutationOrigin(new Request("https://www.regionatlas.games/api/auth/me")),
    true,
  );
});

test("honors forwarded host and protocol behind Vercel", () => {
  const request = new Request("https://internal.vercel.app/api/user/settings", {
    method: "PATCH",
    headers: {
      origin: "https://www.regionatlas.games",
      "x-forwarded-host": "www.regionatlas.games",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(isTrustedMutationOrigin(request), true);
});

test("rejects oversized or malformed JSON bodies", async () => {
  const oversized = await readJsonBody(
    new Request("https://www.regionatlas.games/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(200) }),
    }),
    64,
  );
  const malformed = await readJsonBody(
    new Request("https://www.regionatlas.games/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.deepEqual(oversized, {
    ok: false,
    error: "La solicitud es demasiado grande.",
    status: 413,
  });
  assert.deepEqual(malformed, { ok: false, error: "JSON no válido.", status: 400 });
});

test("blocks requests after the configured in-memory limit", async () => {
  resetMemoryRateLimitsForTests();
  const base = {
    namespace: "test-auth",
    identifier: "client-1",
    limit: 2,
    windowMs: 60_000,
    now: 1_000,
    backend: "memory" as const,
  };

  assert.equal((await checkRateLimit(base)).allowed, true);
  assert.equal((await checkRateLimit(base)).allowed, true);
  const blocked = await checkRateLimit(base);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test("blocks local and private destinations for remote imports", async () => {
  assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIp("10.0.0.4"), true);
  assert.equal(isPrivateOrReservedIp("::1"), true);
  assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
  await assert.rejects(() => assertSafeRemoteUrl("http://127.0.0.1/admin"));
  await assert.rejects(() => assertSafeRemoteUrl("http://localhost/admin"));
  assert.equal((await assertSafeRemoteUrl("https://8.8.8.8/image.jpg")).hostname, "8.8.8.8");
});
