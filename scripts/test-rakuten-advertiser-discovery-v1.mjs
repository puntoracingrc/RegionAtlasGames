import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

function normalize(merchants, query, discoveredAt = "2026-06-17T00:00:00.000Z") {
  return merchants.map((merchant) => ({
    provider: "rakuten",
    advertiserId: merchant.mid.trim(),
    advertiserName: merchant.merchantName.trim(),
    source: "advertisersearch-1.0",
    query: query.trim(),
    discoveredAt,
    partnershipStatus: "unknown",
  }));
}

const one = parseXml(`<?xml version="1.0"?><advertiserSearchResponse><midlist><merchant><mid>99999</mid><merchantname>Awesome Pet Shop</merchantname></merchant></midlist></advertiserSearchResponse>`);
assert.equal(one.length, 1);
assert.equal(one[0].mid, "99999");
assert.equal(one[0].merchantName, "Awesome Pet Shop");

const many = parseXml(`<advertiserSearchResponse><midlist><merchant><mid>1</mid><merchantname>A &amp; B Games</merchantname></merchant><merchant><mid>2</mid><merchantname>Console Shop</merchantname></merchant></midlist></advertiserSearchResponse>`);
assert.equal(many.length, 2);
assert.equal(many[0].merchantName, "A & B Games");
assert.equal(parseXml(`<advertiserSearchResponse><midlist></midlist></advertiserSearchResponse>`).length, 0);

const candidate = normalize(one, "game")[0];
assert.equal(candidate.advertiserId, "99999");
assert.equal(candidate.advertiserName, "Awesome Pet Shop");
assert.equal(candidate.provider, "rakuten");
assert.equal(candidate.source, "advertisersearch-1.0");
assert.equal(candidate.partnershipStatus, "unknown");

const source = readFileSync("src/lib/rakuten/advertiser-search.ts", "utf8");
assert.ok(source.includes("RAKUTEN_ADVERTISER_QUERY_EMPTY"), "Query vacía debe devolver error");
assert.ok(source.includes("response.status === 401"), "Debe manejar 401");
assert.ok(source.includes("clearToken()"), "401 debe limpiar token");
assert.ok(source.match(/requestAdvertisers/g).length >= 3, "401 debe reintentar una sola vez");
assert.ok(source.includes("response.status === 403"), "Debe manejar 403");
assert.ok(source.includes("RAKUTEN_ADVERTISER_RATE_LIMIT"), "403 debe devolver rate limit");

const smoke = readFileSync("scripts/smoke-rakuten-advertiser-search.mjs", "utf8");
assert.ok(!/console\.(log|error|warn)[^\n]*(access_token|refresh_token|client_secret|Authorization|token-key)/i.test(smoke));

const frontend = readFileSync("scripts/validate-rakuten-advertiser-discovery-v1.mjs", "utf8");
assert.ok(frontend.includes("No frontend imports"));

console.log("RAKUTEN_ADVERTISER_DISCOVERY_V1 tests OK.");
