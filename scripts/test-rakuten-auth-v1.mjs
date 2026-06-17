import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

const auth = readFileSync("src/lib/affiliate/providers/rakuten/rakuten-auth.ts", "utf8");
const client = readFileSync("src/lib/affiliate/providers/rakuten/rakuten-client.ts", "utf8");

assert.equal(Buffer.from("test-client:test-secret", "utf8").toString("base64"), "dGVzdC1jbGllbnQ6dGVzdC1zZWNyZXQ=");
assert.ok(auth.includes('throw new RakutenAuthError("RAKUTEN_DISABLED")'), "Provider desactivado debe lanzar RAKUTEN_DISABLED");
assert.ok(auth.includes("buildRakutenTokenKey"), "Debe existir buildRakutenTokenKey");
assert.ok(auth.includes("cachedRakutenToken && Date.now() < cachedRakutenToken.expiresAt"), "Debe reutilizar token cacheado");
assert.ok(auth.includes("refreshRakutenAccessToken(cachedRakutenToken.refreshToken)"), "Debe intentar refresh token");
assert.ok(auth.includes("requestRakutenAccessToken()"), "Debe hacer fallback a token nuevo");
assert.ok(client.includes("response.status === 401"), "Debe reintentar una vez tras 401");
assert.ok(auth.includes("rakutenTokenPromise"), "Debe evitar refrescos simultáneos");
assert.ok(!/console\.(log|error|warn)/.test(auth + client), "Auth/cliente no deben loguear tokens");

console.log("RAKUTEN_AUTH_V1 tests OK.");
