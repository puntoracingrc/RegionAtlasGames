import assert from "node:assert/strict";
import test from "node:test";
import {
  BraveResearchImageSearchProvider,
  BraveResearchSearchProvider,
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

test("Brave normalizes web results and preserves source metadata", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    const provider = new BraveResearchSearchProvider({
      fetchImpl: (async () => Response.json({
        query: { more_results_available: true },
        web: { results: [{ title: " Exact item ", url: "https://example.com/item", description: " Barcode visible ", page_age: "2026-09-15T00:00:00Z" }] },
      })) as typeof fetch,
    });
    assert.deepEqual(await provider.search({ query: "Test Game" }), [{
      title: "Exact item",
      url: "https://example.com/item",
      snippet: "Barcode visible",
      host: "example.com",
      rank: 1,
      publishedAt: "2026-09-15T00:00:00Z",
      provider: "brave-search",
    }]);
    assert.deepEqual(provider.getUsage(), { "brave-search": 1 });
  });
});

test("Brave preflight becomes healthy after one real-shaped request", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    let calls = 0;
    const brave = new BraveResearchSearchProvider({
      fetchImpl: (async () => {
        calls += 1;
        return Response.json({ web: { results: [] } });
      }) as typeof fetch,
    });
    const pool = new FallbackResearchSearchProvider([brave]);
    const health = await pool.preflight();
    assert.equal(calls, 1);
    assert.equal(health[0]?.state, "HEALTHY");
    assert.ok(pool.getEvents().some((event) => event.operation === "PREFLIGHT" && event.outcome === "SUCCESS"));
  });
});

test("Brave without a key is NOT_CONFIGURED rather than an HTTP failure", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: undefined }, async () => {
    const provider = new BraveResearchSearchProvider();
    await assert.rejects(
      provider.search({ query: "barcode" }),
      (error: unknown) => error instanceof ResearchSearchProviderError && error.code === "BRAVE_SEARCH_NOT_CONFIGURED",
    );
    assert.deepEqual(provider.getUsage(), { "brave-search": 0 });
  });
});

test("Brave 429 retries once and then opens its circuit", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key", RESEARCH_RETRY_BASE_MS: "0" }, async () => {
    let calls = 0;
    const brave = new BraveResearchSearchProvider({
      fetchImpl: (async () => {
        calls += 1;
        return Response.json({ error: { detail: "rate limited" } }, { status: 429 });
      }) as typeof fetch,
    });
    const pool = new FallbackResearchSearchProvider([brave], { maxTechnicalRetries: 1 });
    await assert.rejects(pool.search({ query: "barcode" }));
    assert.equal(calls, 2);
    assert.equal(pool.getHealth()[0]?.state, "OPEN_CIRCUIT");
    assert.deepEqual(await pool.search({ query: "different query" }), []);
    assert.equal(calls, 2);
  });
});

test("Brave timeout falls back without failing the research case", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    const brave = new BraveResearchSearchProvider({
      fetchImpl: (async () => { throw new Error("request timed out"); }) as typeof fetch,
    });
    const fallback: ResearchSearchProviderV2 = {
      name: "fallback",
      async search() {
        return [{ title: "Recovered", url: "https://example.test/item", snippet: "", host: "example.test", rank: 1, publishedAt: null, provider: "fallback" }];
      },
    };
    const pool = new FallbackResearchSearchProvider([brave, fallback], { maxTechnicalRetries: 0 });
    assert.equal((await pool.search({ query: "barcode" }))[0]?.provider, "fallback");
    assert.ok(pool.getEvents().some((event) => event.provider === "brave-search" && event.outcome === "FAILOVER"));
  });
});

test("Brave maps country and search language without restricting global requests", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    const requested: URL[] = [];
    const provider = new BraveResearchSearchProvider({
      fetchImpl: (async (input) => {
        requested.push(new URL(String(input)));
        return Response.json({ web: { results: [] } });
      }) as typeof fetch,
    });
    await provider.search({ query: "Spanish release", country: "es", language: "ES" });
    await provider.search({ query: "technical source" });
    assert.equal(requested[0]?.searchParams.get("country"), "ES");
    assert.equal(requested[0]?.searchParams.get("search_lang"), "es");
    assert.equal(requested[1]?.searchParams.get("country"), "ALL");
  });
});

test("Brave preserves an explicit site operator without widening it to sibling hosts", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    let requested = "";
    const provider = new BraveResearchSearchProvider({
      fetchImpl: (async (input) => {
        requested = String(input);
        return Response.json({ web: { results: [] } });
      }) as typeof fetch,
    });
    await provider.search({ query: 'site:game.es "Assassin Discovery"', domains: ["game.es", "fnac.es"] });
    const query = new URL(requested).searchParams.get("q") ?? "";
    assert.equal(query, 'site:game.es "Assassin Discovery"');
    assert.ok(!query.includes("fnac.es"));
  });
});

test("Brave pagination does not request another page when none is available", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    let calls = 0;
    const provider = new BraveResearchSearchProvider({
      fetchImpl: (async () => {
        calls += 1;
        return Response.json({ query: { more_results_available: false }, web: { results: [] } });
      }) as typeof fetch,
    });
    await provider.search({ query: "barcode", offset: 0 });
    assert.deepEqual(await provider.search({ query: "barcode", offset: 1 }), []);
    assert.equal(calls, 1);
  });
});

test("Brave deduplicates equivalent result URLs", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    const provider = new BraveResearchSearchProvider({
      fetchImpl: (async () => Response.json({ web: { results: [
        { title: "One", url: "https://example.com/item#details", description: "first" },
        { title: "Duplicate", url: "https://example.com/item", description: "second" },
      ] } })) as typeof fetch,
    });
    const results = await provider.search({ query: "barcode" });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.url, "https://example.com/item");
  });
});

test("Brave image normalization binds the original image to its source page", async () => {
  await withEnv({ BRAVE_SEARCH_API_KEY: "brave-key" }, async () => {
    const provider = new BraveResearchImageSearchProvider({
      fetchImpl: (async () => Response.json({ results: [{
        title: " Back cover ",
        url: "https://example.com/listing",
        source: "Example",
        thumbnail: { src: "https://imgs.search.brave.com/thumb.jpg" },
        properties: { url: "https://cdn.example.com/back.jpg" },
        meta_url: { hostname: "example.com" },
      }] })) as typeof fetch,
    });
    assert.deepEqual(await provider.search({ query: "back cover", country: "ES", language: "es" }), [{
      imageUrl: "https://cdn.example.com/back.jpg",
      thumbnailUrl: "https://imgs.search.brave.com/thumb.jpg",
      sourcePageUrl: "https://example.com/listing",
      title: "Back cover",
      host: "example.com",
      rank: 1,
    }]);
    assert.deepEqual(provider.getUsage(), { "brave-images": 1 });
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
