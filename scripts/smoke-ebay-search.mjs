import { existsSync, readFileSync } from "node:fs";

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

loadEnvLocal();

try {
  if (process.env.EBAY_AFFILIATE_ENABLED !== "true") throw new Error("ebay_disabled");
  if (!process.env.EBAY_CLIENT_ID?.trim()) throw new Error("missing_client_id");
  if (!process.env.EBAY_CLIENT_SECRET?.trim()) throw new Error("missing_client_secret");

  const query = process.env.EBAY_SEARCH_QUERY?.trim();
  if (!query) throw new Error("missing_query");

  const { searchEbayOffers } = await import("../src/lib/ebay/ebay-search.ts");
  const { ebayMarketplaceId } = await import("../src/lib/ebay/ebay-client.ts");
  const offers = await searchEbayOffers({
    gameId: "smoke-ebay-search",
    title: query,
    query,
    maxResults: 10,
  });

  console.log("eBay search OK");
  console.log(`Marketplace: ${ebayMarketplaceId()}`);
  console.log(`Query: ${query}`);
  console.log(`Results: ${offers.length}`);
  for (const offer of offers.slice(0, 10)) {
    console.log(`- ${offer.externalProductId} | ${offer.title} | ${offer.price ?? "n/a"} | ${offer.currency ?? "n/a"} | hasAffiliateUrl ${Boolean(offer.affiliateUrl)}`);
  }
} catch (error) {
  const code = error instanceof Error ? error.message : "unknown_error";
  console.log(`eBay search failed: ${code}`);
  process.exit(1);
}
