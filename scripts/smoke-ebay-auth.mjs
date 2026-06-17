import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function required(name, code) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(code);
  return value;
}

loadEnvLocal();

try {
  required("EBAY_CLIENT_ID", "missing_client_id");
  required("EBAY_CLIENT_SECRET", "missing_client_secret");
  process.env.EBAY_AFFILIATE_ENABLED = "true";
  const { getEbayAccessTokenInfo } = await import("../src/lib/ebay/ebay-auth.ts");
  await getEbayAccessTokenInfo();
  console.log("eBay auth OK");
  console.log("expires_in detected");
} catch (error) {
  const code = error instanceof Error ? error.message : "unknown_error";
  console.log(`eBay auth failed: ${code}`);
  process.exit(1);
}
