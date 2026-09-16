import assert from "node:assert/strict";
import test from "node:test";
import {
  FallbackResearchSearchProvider,
  GoogleCustomResearchImageSearchProvider,
  GoogleCustomResearchSearchProvider,
  ResearchSearchProviderError,
  SerpApiResearchSearchProvider,
} from "./search-provider";
import type { ResearchSearchProviderV2 } from "./v2-types";

function withEnv(values: Record<string, string | undefined>, callback: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return callback().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("Google search applies domain routing and returns normalized HTTP results", async () => {
  await withEnv({ GOOGLE_SEARCH_API_KEY: "test-key", GOOGLE_SEARCH_CX: "test-cx" }, async () => {
    let requested = "";
    const provider = new GoogleCustomResearchSearchProvider({
      fetchImpl: (async (input) => {
        requested = String(input);
        return Response.json({ items: [
          { title: " Exact item ", link: "https://example.com/item", snippet: " Barcode visible " },
          { title: "Unsafe", link: "javascript:alert(1)", snippet: "ignored" },
        ] });
      }) as typeof fetch,
    });
    const results = await provider.search({ query: "Test Game", domains: ["example.com"], excludeDomains: ["bad.example"], maxResults: 4 });
    const query = new URL(requested).searchParams.get("q") ?? "";
    assert.ok(query.includes("site:example.com"));
    assert.ok(query.includes("-site:bad.example"));
    assert.equal(results.length, 1);
    assert.equal(results[0].host, "example.com");
    assert.deepEqual(provider.getUsage(), { "google-custom-search": 1 });
  });
});

test("fallback provider records attempted Google and successful SerpAPI calls", async () => {
  await withEnv({ GOOGLE_SEARCH_API_KEY: "test-key", GOOGLE_SEARCH_CX: "test-cx", SERPAPI_KEY: "serp-key" }, async () => {
    const google = new GoogleCustomResearchSearchProvider({ fetchImpl: (async () => new Response("down", { status: 503 })) as typeof fetch });
    const serp = new SerpApiResearchSearchProvider({
      fetchImpl: (async () => Response.json({ organic_results: [{ title: "Recovered", link: "https://example.org/item", snippet: "match" }] })) as typeof fetch,
    });
    const fallback = new FallbackResearchSearchProvider([google, serp]);
    const results = await fallback.search({ query: "barcode" });
    assert.equal(results[0]?.provider, "serpapi-google");
    assert.deepEqual(fallback.getUsage(), { "google-custom-search": 2, "serpapi-google": 1 });
    assert.ok(fallback.getEvents().some((event) => event.provider === "google-custom-search" && event.outcome === "RETRY"));
    assert.equal(fallback.getHealth().find((row) => row.provider === "serpapi-google")?.state, "HEALTHY");
  });
});

test("SerpAPI no-results responses are an empty result set, not a provider failure", async () => {
  await withEnv({ SERPAPI_KEY: "serp-key" }, async () => {
    const provider = new SerpApiResearchSearchProvider({
      fetchImpl: (async () => Response.json({ error: "Google hasn't returned any results for this query." })) as typeof fetch,
    });
    assert.deepEqual(await provider.search({ query: "missing physical variant" }), []);
  });
});

test("SerpAPI quota errors keep a stable code without exposing credentials", async () => {
  await withEnv({ SERPAPI_KEY: "serp-key" }, async () => {
    const provider = new SerpApiResearchSearchProvider({
      fetchImpl: (async () => Response.json({ error: "Your account has run out of searches." })) as typeof fetch,
    });
    await assert.rejects(
      provider.search({ query: "barcode" }),
      (error: unknown) => error instanceof ResearchSearchProviderError
        && error.code === "SERPAPI_QUOTA_EXHAUSTED"
        && !error.message.includes("serp-key"),
    );
  });
});

test("quota exhaustion opens the provider circuit and cached success avoids a second provider call", async () => {
  await withEnv({ SERPAPI_KEY: "serp-key" }, async () => {
    let exhaustedCalls = 0;
    const exhausted = new SerpApiResearchSearchProvider({
      fetchImpl: (async () => {
        exhaustedCalls += 1;
        return Response.json({ error: "Your account quota is exhausted." });
      }) as typeof fetch,
    });
    let healthyCalls = 0;
    const healthy: ResearchSearchProviderV2 = {
      name: "healthy-provider",
      async search() {
        healthyCalls += 1;
        return [{ title: "Exact", url: "https://example.test/item", snippet: "", host: "example.test", rank: 1, publishedAt: null, provider: "healthy-provider" }];
      },
      getUsage: () => ({ "healthy-provider": healthyCalls }),
    };
    const pool = new FallbackResearchSearchProvider([exhausted, healthy], { maxTechnicalRetries: 2 });
    assert.equal((await pool.search({ query: "exact barcode" })).length, 1);
    assert.equal((await pool.search({ query: "exact barcode" })).length, 1);
    assert.equal(exhaustedCalls, 1);
    assert.equal(healthyCalls, 1);
    assert.equal(pool.getHealth().find((row) => row.provider === "serpapi-google")?.state, "OPEN_CIRCUIT");
    assert.ok(pool.getEvents().some((event) => event.outcome === "CACHE_HIT"));
  });
});

test("image search keeps source-page binding and rejects non-HTTP image URLs", async () => {
  await withEnv({ GOOGLE_SEARCH_API_KEY: "test-key", GOOGLE_SEARCH_CX: "test-cx" }, async () => {
    const provider = new GoogleCustomResearchImageSearchProvider({
      fetchImpl: (async () => Response.json({ items: [
        { title: "Back cover", link: "https://images.example/back.jpg", image: { thumbnailLink: "https://images.example/thumb.jpg", contextLink: "https://example.com/item" } },
        { title: "Bad", link: "data:image/png;base64,AAAA", image: { contextLink: "https://example.com/bad" } },
      ] })) as typeof fetch,
    });
    const results = await provider.search({ query: "back cover" });
    assert.equal(results.length, 1);
    assert.equal(results[0].sourcePageUrl, "https://example.com/item");
    assert.deepEqual(provider.getUsage(), { "google-custom-images": 1 });
  });
});
