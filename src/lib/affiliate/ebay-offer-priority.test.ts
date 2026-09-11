import assert from "node:assert/strict";
import test from "node:test";
import {
  ebayAffiliateSearchFilter,
  ebayOfferCountryPriority,
  ebayPriorityCountry,
  mergeRegionFirstEbayOffers,
  normalizeEbayCountry,
  shouldExpandEbaySearch,
} from "./ebay-offer-priority";

test("searches the ficha country first while retaining delivery to Spain", () => {
  for (const country of ["ES", "IT", "CN", "JP", "US", "TW", "KR", "FR", "GB"]) {
    assert.equal(ebayAffiliateSearchFilter("preferred", country),
      `buyingOptions:{FIXED_PRICE},deliveryCountry:ES,itemLocationCountry:${country}`);
  }
  assert.equal(
    ebayAffiliateSearchFilter("expanded", "IT"),
    "buyingOptions:{FIXED_PRICE},deliveryCountry:ES",
  );
  assert.equal(ebayAffiliateSearchFilter("preferred", "EU"), ebayAffiliateSearchFilter("expanded", null));
  assert.equal(ebayAffiliateSearchFilter("preferred", "IT,itemLocationCountry:ES"), ebayAffiliateSearchFilter("expanded", null));
});

test("resolves legacy and structured countries without confusing NTSC-J with Japan", () => {
  for (const [region, country] of [
    ["PAL Italia", "IT"], ["PAL España", "ES"], ["USA", "US"], ["Japón", "JP"],
    ["JAPAN", "JP"], ["PAL UK/ENG", "GB"], ["NTSC-J China", "CN"], ["NTSC-J Taiwán", "TW"],
  ]) assert.equal(ebayPriorityCountry({ region }), country);
  assert.equal(ebayPriorityCountry({ region: "NTSC-J", regionCode: "CN", marketRegion: "China" }), "CN");
  assert.equal(ebayPriorityCountry({ region: "NTSC-J", regionCode: "KR", marketRegion: "Korea" }), "KR");
  assert.equal(ebayPriorityCountry({ region: "PAL", marketRegion: "Italy" }), "IT");
  assert.equal(ebayPriorityCountry({ region: "PAL España", regionCode: "IT", marketRegion: "Italy" }), "IT");
});

test("does not invent a country for multi-country, broad or pending markets", () => {
  for (const region of ["PAL Europa", "NTSC-J Asia", "PAL · Mercado por determinar", "NTSC-J · Mercado por determinar", "NTSC-U/C · Mercado por determinar", "Internacional", "Occidental"]) {
    assert.equal(ebayPriorityCountry({ region }), null);
  }
  for (const regionCode of ["EU", "ASIA", "US-CA", "JP-KR", "GB-AU", "EU-AU", "SCAND", "UNKNOWN"]) {
    assert.equal(ebayPriorityCountry({ region: "PAL España", regionCode }), null);
  }
  assert.equal(ebayPriorityCountry({ region: "USA", marketRegion: "USA, Canada" }), null);
});

test("normalizes country aliases without inferring origin from a title or language", () => {
  for (const [location, code] of [["España", "ES"], ["Spain", "ES"], ["Italia", "IT"], ["Italy", "IT"], ["China", "CN"], ["UK", "GB"], ["United Kingdom", "GB"], ["USA", "US"]]) {
    assert.equal(normalizeEbayCountry(location), code);
  }
  assert.equal(normalizeEbayCountry("PAL España"), null);
  assert.equal(normalizeEbayCountry("Italiano"), null);
  assert.equal(normalizeEbayCountry(null), null);
  assert.equal(ebayOfferCountryPriority({ provider: "ebay", location: "IT" }, "IT"), 0);
  assert.equal(ebayOfferCountryPriority({ provider: "ebay", location: "ES" }, "IT"), 1);
  assert.equal(ebayOfferCountryPriority({ provider: "ebay", location: null }, "IT"), 1);
  assert.equal(ebayOfferCountryPriority({ provider: "amazon", location: "Amazon" }, "IT"), 0);
});

test("expands the search only when the preferred country has too few valid offers", () => {
  assert.equal(shouldExpandEbaySearch(0, 3), true);
  assert.equal(shouldExpandEbaySearch(2, 3), true);
  assert.equal(shouldExpandEbaySearch(3, 3), false);
});

test("keeps the ficha country first, deduplicates and does not promote unknown origins", () => {
  const offers = mergeRegionFirstEbayOffers(
    [
      { id: "it-1", location: "IT", price: 20 },
      { id: "unknown", location: null, price: 25 },
    ],
    [
      { id: "es-1", location: "ES", price: 12 },
      { id: "it-1", location: "IT", price: 19 },
      { id: "it-2", location: "Italy", price: 30 },
    ],
    4,
    "IT",
  );

  assert.deepEqual(
    offers.map((offer) => [offer.id, offer.marketScope]),
    [
      ["it-1", "preferred"],
      ["it-2", "preferred"],
      ["unknown", "other"],
      ["es-1", "other"],
    ],
  );
  assert.equal(offers[0].price, 20);
  assert.deepEqual(mergeRegionFirstEbayOffers([], offers, 1, "ES").map(offer => offer.id), ["es-1"]);
  assert.deepEqual(mergeRegionFirstEbayOffers([], offers, 0, "ES"), []);
});

test("broad regions retain the provider order without a default Spanish group", () => {
  const offers = mergeRegionFirstEbayOffers([], [{ id: "it", location: "IT" }, { id: "es", location: "ES" }], 6, null);
  assert.deepEqual(offers.map(offer => [offer.id, offer.marketScope]), [["it", "unrestricted"], ["es", "unrestricted"]]);
});

test("the real offer service requests and exposes the ficha country with fallback and deduplication", async () => {
  const { getAffiliateOfferBlock } = await import("../affiliate-offers");
  const { getCatalogGame } = await import("../catalog");
  const env = {
    AFFILIATE_OFFERS_ENABLED: "1", EBAY_AFFILIATE_ENABLED: "1", AMAZON_AFFILIATE_ENABLED: "0",
    AFFILIATE_OFFERS_PRODUCTION_WHITELIST: "false", EBAY_CLIENT_ID: "local-test-id",
    EBAY_CLIENT_SECRET: "local-test-secret", EBAY_CAMPAIGN_ID: "local-test-campaign",
    EBAY_AFFILIATE_LIMIT: "6", EBAY_AFFILIATE_PRIORITY_MIN: "3",
  };
  const previousEnv = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  const previousToken = globalThis.__regionAtlasEbayTokenCache;
  const previousBackoff = globalThis.__regionAtlasEbayBackoffCache;
  try {
    Object.assign(process.env, env);
    globalThis.__regionAtlasEbayTokenCache = undefined;
    globalThis.__regionAtlasEbayBackoffCache = undefined;
    const baseGame = getCatalogGame("ps2-scudetto-5");
    assert.ok(baseGame);
    for (const country of ["IT", "ES", "CN", "JP", null]) {
      const filters: string[] = [];
      const game = { ...baseGame, regionCode: country ?? "EU", marketRegion: country ?? "Europe" };
      const rawItem = (id: string, location: string) => ({
        itemId: id, title: `${game.title} PS2`, itemLocation: { country: location },
        itemWebUrl: `https://www.ebay.es/itm/${id}`, itemAffiliateWebUrl: `https://www.ebay.es/itm/${id}?campid=local-test`,
        price: { value: location === country ? "30" : "10", currency: "EUR" },
      });
      globalThis.fetch = async input => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/oauth2/token")) return Response.json({ access_token: "local-test-token", expires_in: 3600 });
        assert.equal(url.hostname, "api.ebay.com");
        assert.equal(url.pathname, "/buy/browse/v1/item_summary/search");
        const filter = url.searchParams.get("filter") ?? "";
        filters.push(filter);
        return Response.json({ itemSummaries: filter.includes("itemLocationCountry:")
          ? [rawItem("preferred-1", country!)]
          : [rawItem("other-1", country === "ES" ? "IT" : "ES"), rawItem("preferred-1", country ?? "IT"), rawItem("preferred-2", country ?? "IT")] });
      };
      const block = await getAffiliateOfferBlock(game, null);
      assert.equal(block.ebayPriorityCountry, country);
      assert.deepEqual(filters, country
        ? [ebayAffiliateSearchFilter("preferred", country), ebayAffiliateSearchFilter("expanded", country)]
        : [ebayAffiliateSearchFilter("expanded", null)]);
      assert.equal(block.offers.length, 3);
      if (country) {
        assert.deepEqual(block.offers.map(offer => offer.location), [country, country, country === "ES" ? "IT" : "ES"]);
        assert.equal(block.offers[0].marketScope, "preferred");
      } else assert.equal(block.offers[0].location, "ES");
    }
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.__regionAtlasEbayTokenCache = previousToken;
    globalThis.__regionAtlasEbayBackoffCache = previousBackoff;
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
