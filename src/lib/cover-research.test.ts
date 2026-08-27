import assert from "node:assert/strict";
import test from "node:test";
import {
  companyCoverDomains,
  coverCandidatesFromEbay,
  isTrustedCoverSourceUrl,
  officialCoverTitleCoverage,
} from "./cover-research";
import type { EbayResearchReport } from "./ebay/ebay-research";

test("only allowlists known official cover source domains", () => {
  assert.equal(isTrustedCoverSourceUrl("https://store.nintendo.com/es-es/game"), true);
  assert.equal(isTrustedCoverSourceUrl("https://news.capcom-games.com/game"), true);
  assert.equal(isTrustedCoverSourceUrl("https://store.nintendo.com.example.test/fake"), false);
  assert.equal(isTrustedCoverSourceUrl("http://127.0.0.1/internal"), false);
});

test("maps a publisher to its own domains without leaking into other brands", () => {
  const domains = companyCoverDomains(["Konami Computer Entertainment Tokyo", "Konami"]);
  assert.deepEqual(domains, ["konami.com"]);
  assert.equal(domains.includes("nintendo.com"), false);
});

test("does not accept a generic official article because its snippet mentions the game", () => {
  assert.equal(officialCoverTitleCoverage("Silent Hill 2", "8 de los juegos de PS2 preferidos"), 0);
  assert.equal(officialCoverTitleCoverage("Silent Hill 2", "SILENT HILL 2 | PlayStation"), 1);
});

test("keeps eBay images temporary and preserves other-region evidence", () => {
  const report: EbayResearchReport = {
    generatedAt: "2026-08-27T00:00:00.000Z",
    target: { catalogId: "game", title: "Game", platformSlug: "ps2", region: "PAL España", gtins: [], reference: null, exactEpids: [] },
    catalogCandidates: [],
    listings: [{
      itemId: "us",
      title: "Game PS2 NTSC USA",
      url: "https://www.ebay.es/itm/us",
      affiliateUrl: null,
      imageUrls: ["https://i.ebayimg.com/images/g/us/s-l1600.jpg"],
      price: 30,
      shippingPrice: 0,
      totalPrice: 30,
      currency: "EUR",
      condition: "Used",
      conditionBucket: "complete",
      decision: "other_variant",
      confidence: 0.9,
      platformMatch: "exact",
      regionMatch: "conflict",
      suggestedRegion: "USA",
      exactIdentifier: false,
      exactReference: false,
      epid: null,
      gtin: null,
      reasons: [],
      searchBasis: [{ kind: "keyword", value: "Game" }],
    }],
    estimates: [],
    counts: { accept: 0, review: 0, other_variant: 1, reject: 0 },
    identifierCandidates: { epids: [] },
    warnings: [],
  };
  const candidates = coverCandidatesFromEbay(report);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].persistence, "temporary_only");
  assert.equal(candidates[0].regionMatch, "other_variant");
  assert.equal(candidates[0].suggestedRegion, "USA");
});
