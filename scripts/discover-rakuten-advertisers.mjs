import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_QUERIES = [
  "game",
  "games",
  "gaming",
  "video game",
  "videogame",
  "console",
  "consoles",
  "electronics",
  "collectibles",
  "toy",
  "toys",
  "entertainment",
  "nintendo",
  "playstation",
  "xbox",
  "retro",
  "computer",
  "pc gaming",
  "hobby",
  "anime",
  "manga",
  "pop culture",
];

const OUTPUT_FILE = path.join(process.cwd(), "data", "rakuten-advertiser-candidates.local.json");
const PAUSE_MS = Number(process.env.RAKUTEN_ADVERTISER_DISCOVERY_PAUSE_MS || 1200);

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

function configured(name) {
  return process.env[name]?.trim() || "";
}

function safeErrorCode(error) {
  const code = String(error?.code || error?.message || "request_failed");
  if (code.includes("rate_limit") || code.includes("403")) return "rate_limit";
  if (code.includes("401")) return "auth_failed";
  if (code.includes("missing")) return code;
  return "request_failed";
}

function requireConfig() {
  if (!configured("RAKUTEN_ACCOUNT_ID")) throw new Error("missing_account_id");
  if (!configured("RAKUTEN_TOKEN_KEY") && !configured("RAKUTEN_CLIENT_ID")) throw new Error("missing_client_id");
  if (!configured("RAKUTEN_TOKEN_KEY") && !configured("RAKUTEN_CLIENT_SECRET")) throw new Error("missing_client_secret");
}

function decodeXmlEntity(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseXml(xml) {
  const merchants = [];
  const merchantPattern = /<merchant\b[^>]*>([\s\S]*?)<\/merchant>/gi;
  const tag = (block, name) => {
    const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    return match?.[1] ? decodeXmlEntity(match[1].replace(/<[^>]+>/g, "")) : null;
  };
  let match;
  while ((match = merchantPattern.exec(xml))) {
    const mid = tag(match[1] || "", "mid");
    const merchantName = tag(match[1] || "", "merchantname");
    if (mid && merchantName) merchants.push({ mid, merchantName });
  }
  return merchants;
}

async function getAccessToken() {
  const endpoint = configured("RAKUTEN_TOKEN_ENDPOINT") || "https://api.linksynergy.com/token";
  const tokenKey =
    configured("RAKUTEN_TOKEN_KEY") ||
    Buffer.from(`${configured("RAKUTEN_CLIENT_ID")}:${configured("RAKUTEN_CLIENT_SECRET")}`, "utf8").toString("base64");
  const body = new URLSearchParams();
  if (configured("RAKUTEN_TOKEN_INCLUDE_GRANT_TYPE") === "true") body.set("grant_type", "password");
  body.set("scope", configured("RAKUTEN_ACCOUNT_ID"));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error(`auth_http_${response.status}`);
  const json = await response.json();
  if (!json?.access_token) throw new Error("auth_invalid_response");
  return json.access_token;
}

async function searchAdvertisers(query, token) {
  const url = new URL("https://api.linksynergy.com/advertisersearch/1.0");
  url.searchParams.set("merchantname", query);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/xml",
    },
  });
  if (response.status === 401) throw new Error("auth_401");
  if (response.status === 403) throw new Error("rate_limit");
  if (!response.ok) throw new Error(`http_${response.status}`);
  return parseXml(await response.text());
}

async function searchAdvertisersWithRetry(query, tokenState) {
  try {
    return await searchAdvertisers(query, tokenState.token);
  } catch (error) {
    if (String(error?.message || "").includes("auth_401")) {
      tokenState.token = await getAccessToken();
      return searchAdvertisers(query, tokenState.token);
    }
    throw error;
  }
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function upsertCandidate(candidates, merchant, query, discoveredAt) {
  const advertiserId = String(merchant.mid).trim();
  if (!advertiserId) return;
  const existing = candidates.get(advertiserId);
  if (existing) {
    if (!existing.queries.includes(query)) existing.queries.push(query);
    return;
  }
  candidates.set(advertiserId, {
    provider: "rakuten",
    advertiserId,
    advertiserName: String(merchant.merchantName).trim(),
    source: "advertisersearch-1.0",
    queries: [query],
    discoveredAt,
    partnershipStatus: "unknown",
    relevanceStatus: "needs_review",
    notes: "",
  });
}

async function main() {
  loadDotEnvLocal();
  requireConfig();

  const tokenState = { token: await getAccessToken() };
  const candidates = new Map();
  const errors = [];
  let rawResults = 0;
  const discoveredAt = new Date().toISOString();

  for (const [index, query] of DEFAULT_QUERIES.entries()) {
    if (index > 0) await pause(PAUSE_MS);
    try {
      const merchants = await searchAdvertisersWithRetry(query, tokenState);
      rawResults += merchants.length;
      for (const merchant of merchants) upsertCandidate(candidates, merchant, query, discoveredAt);
      console.log(`Query OK: ${query} (${merchants.length})`);
    } catch (error) {
      const code = safeErrorCode(error);
      errors.push({ query, code });
      console.log(`Query failed: ${query} (${code})`);
      if (code === "rate_limit") await pause(Math.max(PAUSE_MS * 3, 5000));
    }
  }

  const output = Array.from(candidates.values()).sort((a, b) => a.advertiserName.localeCompare(b.advertiserName));
  mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);

  console.log("Rakuten advertiser batch discovery finished");
  console.log(`Total queries: ${DEFAULT_QUERIES.length}`);
  console.log(`Total raw results: ${rawResults}`);
  console.log(`Total unique advertisers: ${output.length}`);
  console.log(`Output file: ${OUTPUT_FILE}`);
  if (errors.length) {
    console.log("Errors:");
    for (const error of errors) console.log(`- ${error.query}: ${error.code}`);
  }
}

main().catch((error) => {
  console.log(`Rakuten advertiser batch discovery failed: ${safeErrorCode(error)}`);
  process.exit(1);
});
