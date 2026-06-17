import { existsSync, readFileSync } from "node:fs";

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

function safeFail(code) {
  console.log(`Rakuten advertiser search failed: ${code}`);
  process.exit(1);
}

function parseXml(xml) {
  const merchants = [];
  const merchantPattern = /<merchant\b[^>]*>([\s\S]*?)<\/merchant>/gi;
  const tag = (block, name) => {
    const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    return match?.[1]?.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() || null;
  };
  let match;
  while ((match = merchantPattern.exec(xml))) {
    const mid = tag(match[1], "mid");
    const merchantName = tag(match[1], "merchantname");
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
  if (!response.ok) safeFail(`auth_http_${response.status}`);
  const json = await response.json();
  if (!json?.access_token) safeFail("auth_invalid_response");
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
  if (response.status === 403) safeFail("rate_limit");
  if (!response.ok) safeFail(`http_${response.status}`);
  return parseXml(await response.text());
}

async function main() {
  loadDotEnvLocal();
  const query = configured("RAKUTEN_ADVERTISER_SEARCH_QUERY") || "game";
  if (!configured("RAKUTEN_ACCOUNT_ID")) safeFail("missing_account_id");
  if (!configured("RAKUTEN_TOKEN_KEY") && !configured("RAKUTEN_CLIENT_ID")) safeFail("missing_client_id");
  if (!configured("RAKUTEN_TOKEN_KEY") && !configured("RAKUTEN_CLIENT_SECRET")) safeFail("missing_client_secret");

  try {
    const merchants = await searchAdvertisers(query, await getAccessToken());
    console.log("Rakuten advertiser search OK");
    console.log(`Query: ${query}`);
    console.log(`Results: ${merchants.length}`);
    for (const merchant of merchants.slice(0, 10)) console.log(`- ${merchant.mid} ${merchant.merchantName}`);
  } catch (error) {
    const code = error?.code || error?.message || "request_failed";
    if (String(code).includes("RAKUTEN_ADVERTISER_RATE_LIMIT")) safeFail("rate_limit");
    if (String(code).includes("RAKUTEN_ADVERTISER_QUERY_EMPTY")) safeFail("empty_query");
    if (String(code).includes("RAKUTEN_DISABLED")) safeFail("disabled");
    safeFail("request_failed");
  }
}

main();
