import { existsSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";

function loadDotEnvLocal() {
  const envPath = ".env.local";
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

function configured(name) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function fail(code) {
  console.log(`Rakuten auth failed: ${code}`);
  process.exit(1);
}

async function main() {
  loadDotEnvLocal();

  const accountId = configured("RAKUTEN_ACCOUNT_ID");
  const endpoint = configured("RAKUTEN_TOKEN_ENDPOINT") || "https://api.linksynergy.com/token";
  const tokenKey =
    configured("RAKUTEN_TOKEN_KEY") ||
    (configured("RAKUTEN_CLIENT_ID") && configured("RAKUTEN_CLIENT_SECRET")
      ? Buffer.from(`${configured("RAKUTEN_CLIENT_ID")}:${configured("RAKUTEN_CLIENT_SECRET")}`, "utf8").toString(
          "base64",
        )
      : null);

  if (!accountId) fail("missing_account_id");
  if (!tokenKey) fail("missing_credentials");

  const body = new URLSearchParams();
  if (configured("RAKUTEN_TOKEN_INCLUDE_GRANT_TYPE") === "true") body.set("grant_type", "password");
  body.set("scope", accountId);

  const timeoutMs = Number(configured("RAKUTEN_TOKEN_TIMEOUT_MS") || 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 10_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) fail(`http_${response.status}`);
    const json = await response.json();
    if (!json?.access_token || !json?.refresh_token || !json?.expires_in) fail("invalid_response");
    console.log("Rakuten auth OK");
  } catch (error) {
    if (error?.name === "AbortError") fail("timeout");
    fail("request_failed");
  } finally {
    clearTimeout(timeout);
  }
}

main();
