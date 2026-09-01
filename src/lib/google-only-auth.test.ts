import assert from "node:assert/strict";
import test from "node:test";
import { POST as passwordLogin } from "@/app/api/auth/login/route";
import { POST as magicLinkLogin } from "@/app/api/auth/magic-link/route";
import { POST as emailRegistration } from "@/app/api/auth/register/route";
import { GET as verifyMagicLink } from "@/app/api/auth/verify/route";

test("legacy email authentication endpoints are closed", async () => {
  const responses = await Promise.all([
    passwordLogin(),
    magicLinkLogin(),
    emailRegistration(),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = (await response.json()) as { error?: string };
    assert.match(payload.error ?? "", /Google/);
  }
});

test("old magic links return to the Google-only login", async () => {
  const response = await verifyMagicLink(
    new Request("https://www.regionatlas.games/api/auth/verify?token=legacy"),
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://www.regionatlas.games/login?google=email-disabled",
  );
});
