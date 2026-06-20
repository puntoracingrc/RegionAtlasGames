import assert from "node:assert/strict";

process.env.AFFILIATE_MIN_CONFIDENCE_TO_SHOW = "0.85";
process.env.AFFILIATE_MIN_CONFIDENCE_RELATED = "0.65";
process.env.EBAY_OAUTH_TOKEN_ENDPOINT = "https://api.ebay.com/identity/v1/oauth2/token";
process.env.EBAY_BROWSE_API_BASE = "https://api.ebay.com/buy/browse/v1";

const { buildEbayBasicAuthHeader, clearEbayCachedToken, getEbayAccessToken } = await import("../src/lib/ebay/ebay-auth.ts");
const { ebayFetch } = await import("../src/lib/ebay/ebay-client.ts");
const { buildEbayEndUserContext, buildEbayGameCustomId } = await import("../src/lib/ebay/ebay-enduserctx.ts");
const { normalizeEbayItem, normalizeEbayCondition } = await import("../src/lib/ebay/ebay-normalize.ts");
const { searchEbayOffers } = await import("../src/lib/ebay/ebay-search.ts");
const { scoreOfferMatch } = await import("../src/lib/affiliate/matching/score-offer-match.ts");

const input = {
  gameId: "silent-hill-2-ps2-pal",
  query: "Silent Hill 2 PS2 PAL",
  title: "Silent Hill 2",
  platform: "PS2",
  region: "PAL",
  limit: 5,
};

function item(overrides = {}) {
  return {
    itemId: "v1|123|0",
    title: "Silent Hill 2 PS2 PAL España completo",
    itemWebUrl: "https://www.ebay.es/itm/123",
    itemAffiliateWebUrl: "https://www.ebay.es/itm/123?mkcid=1",
    image: { imageUrl: "https://i.ebayimg.com/images/123.jpg" },
    price: { value: "29.99", currency: "EUR" },
    shippingOptions: [{ shippingCost: { value: "4.50", currency: "EUR" } }],
    condition: "Used",
    buyingOptions: ["FIXED_PRICE"],
    ...overrides,
  };
}

assert.equal(buildEbayBasicAuthHeader("client", "secret"), `Basic ${Buffer.from("client:secret", "utf8").toString("base64")}`, "genera Basic auth");
assert.equal(buildEbayGameCustomId({ customIdPrefix: "rag", gameSlug: "silent-hill-2", platformSlug: "ps2" }), "rag-game-silent-hill-2-ps2", "genera customid por juego y plataforma");
assert.equal(buildEbayEndUserContext({ campaignId: "camp123", customIdPrefix: "rag", gameSlug: "silent-hill-2", platformSlug: "ps2" }), "affiliateCampaignId=camp123,affiliateReferenceId=rag-game-silent-hill-2-ps2", "genera enduserctx afiliado por juego");

process.env.EBAY_AFFILIATE_ENABLED = "true";
process.env.EBAY_CLIENT_ID = "client";
process.env.EBAY_CLIENT_SECRET = "secret";
clearEbayCachedToken();
let tokenRequests = 0;
globalThis.fetch = async () => {
  tokenRequests += 1;
  return Response.json({ access_token: `token-${tokenRequests}`, token_type: "Bearer", expires_in: 3600 });
};
assert.equal(await getEbayAccessToken(), "token-1");
assert.equal(await getEbayAccessToken(), "token-1");
assert.equal(tokenRequests, 1, "token cacheado no repite request");

clearEbayCachedToken();
let calls = 0;
globalThis.fetch = async (url) => {
  calls += 1;
  if (calls === 1) return Response.json({ access_token: "first-token", token_type: "Bearer", expires_in: 3600 });
  if (calls === 2) return new Response("", { status: 401 });
  if (calls === 3) return Response.json({ access_token: "retry-token", token_type: "Bearer", expires_in: 3600 });
  if (String(url).includes("item_summary")) return Response.json({ ok: true });
  throw new Error("unexpected_fetch");
};
const retryResult = await ebayFetch("https://api.ebay.com/buy/browse/v1/item_summary/search?q=test");
assert.deepEqual(retryResult, { ok: true }, "401 limpia token y reintenta una vez");
assert.equal(calls, 4);

const withAffiliate = normalizeEbayItem(input, item(), "2026-06-17T00:00:00.000Z");
assert(withAffiliate, "normaliza item con affiliate url");
assert.equal(withAffiliate.provider, "ebay");
assert.equal(withAffiliate.affiliateUrl, "https://www.ebay.es/itm/123?mkcid=1");
assert.equal(withAffiliate.rawProductUrl, "https://www.ebay.es/itm/123");
assert.notEqual(withAffiliate.affiliateUrl, withAffiliate.rawProductUrl, "itemWebUrl no es affiliateUrl");
assert.equal(withAffiliate.price, 29.99);
assert.equal(withAffiliate.currency, "EUR");
assert.equal(withAffiliate.shippingPrice, 4.5);
assert.equal(withAffiliate.condition, "used");
assert.equal(withAffiliate.status, "active");

const withoutAffiliate = normalizeEbayItem(input, item({ itemAffiliateWebUrl: undefined }), "2026-06-17T00:00:00.000Z");
assert(withoutAffiliate, "normaliza item sin affiliate url para review");
assert.equal(withoutAffiliate.affiliateUrl, "");
assert.equal(withoutAffiliate.status, "invalid_affiliate_url");

const expired = normalizeEbayItem(input, item({ itemEndDate: "2020-01-01T00:00:00.000Z" }), "2026-06-17T00:00:00.000Z");
assert.equal(expired?.status, "expired");
const inactive = normalizeEbayItem(input, item({ estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }] }), "2026-06-17T00:00:00.000Z");
assert.equal(inactive?.status, "inactive");

assert.equal(normalizeEbayCondition("New"), "new");
assert.equal(normalizeEbayCondition("Used"), "used");
assert.equal(normalizeEbayCondition("Manufacturer refurbished"), "refurbished");
assert.equal(normalizeEbayCondition("Algo raro"), "unknown");

assert.equal(normalizeEbayItem(input, item({ title: "Silent Hill 2 PS2 manual only" })), null, "bloquea manual only");
assert.equal(normalizeEbayItem(input, item({ title: "Silent Hill 2 PS2 box only" })), null, "bloquea box only");
assert.equal(normalizeEbayItem(input, item({ title: "Silent Hill 2 PS2 repro" })), null, "bloquea repro");

const wrongPlatformScore = scoreOfferMatch({ gameId: input.gameId, title: input.title, platform: input.platform, region: input.region }, { title: "Silent Hill 2 PS5 PAL" });
assert(wrongPlatformScore < withAffiliate.matchConfidence, "plataforma incorrecta baja score");
assert.equal(normalizeEbayItem(input, item({ title: "Silent Hill 2 PS5 PAL" })), null, "plataforma incorrecta puede ocultarse por umbral conservador");

const wrongRegion = normalizeEbayItem(input, item({ title: "Silent Hill 2 PS2 NTSC USA" }), "2026-06-17T00:00:00.000Z");
assert(wrongRegion === null || wrongRegion.matchConfidence < withAffiliate.matchConfidence, "región incorrecta baja score u oculta");

process.env.EBAY_AFFILIATE_ENABLED = "false";
let disabledCalled = false;
globalThis.fetch = async () => {
  disabledCalled = true;
  throw new Error("fetch_should_not_run");
};
const disabledResults = await searchEbayOffers(input);
assert.deepEqual(disabledResults, []);
assert.equal(disabledCalled, false, "provider desactivado no llama API");

const fs = await import("node:fs");
const smokeSource = fs.readFileSync("scripts/smoke-ebay-auth.mjs", "utf8") + fs.readFileSync("scripts/smoke-ebay-search.mjs", "utf8");
assert(!/console\.(log|error|warn)[^\n]*(Authorization|access_token|client_secret|campaign id|campaignId)/i.test(smokeSource), "no imprime secretos");

const frontendSource = fs.readdirSync("src/components").map((name) => fs.statSync(`src/components/${name}`).isFile() ? fs.readFileSync(`src/components/${name}`, "utf8") : "").join("\n");
assert(!/from\s+["'][^"']*ebay|require\([^)]*ebay/i.test(frontendSource), "no hay imports eBay en frontend público básico");

console.log("EBAY_SYNC_V1 tests OK.");
