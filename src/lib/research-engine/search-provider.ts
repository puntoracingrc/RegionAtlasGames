import type {
  ResearchProviderHealth,
  ResearchRetrievalEvent,
  ResearchImageSearchProvider,
  ResearchImageSearchResult,
  ResearchSearchProviderV2,
  ResearchSearchRequest,
  ResearchSearchResult,
} from "./v2-types";
import { boundedBackoff, classifyRetrievalFailure, isRetryableRetrievalFailure, safeRetrievalDetail } from "./retrieval-resilience";

const USER_AGENT = "RegionAtlasResearchEngine/2.0 (+https://www.regionatlas.games/)";
const DEFAULT_TIMEOUT_MS = 12_000;

type ProviderOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxTechnicalRetries?: number;
};

export class ResearchSearchProviderError extends Error {
  constructor(public readonly code: string, providerMessage?: string) {
    super(providerMessage ? `${code}: ${providerMessage}` : code);
    this.name = "ResearchSearchProviderError";
  }
}

function safeProviderMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim().slice(0, 300);
  return compact || undefined;
}

function isEmptyResultMessage(value: unknown): boolean {
  return typeof value === "string" && /(?:hasn't|has not) returned any results|no results (?:were )?found/i.test(value);
}

function configuredGoogle(): boolean {
  return Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_CX?.trim());
}

function serpApiKey(): string {
  return process.env.SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim() || "";
}

function queryWithDomains(request: ResearchSearchRequest): string {
  const terms = [request.query.trim()];
  if (request.domains?.length) terms.push(`(${request.domains.map((domain) => `site:${domain}`).join(" OR ")})`);
  for (const domain of request.excludeDomains ?? []) terms.push(`-site:${domain}`);
  return terms.filter(Boolean).join(" ");
}

function safeResultUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function providerTimeout(value: number | undefined): number {
  return Math.max(1_000, Math.min(60_000, value ?? DEFAULT_TIMEOUT_MS));
}

export class GoogleCustomResearchSearchProvider implements ResearchSearchProviderV2 {
  readonly name = "google-custom-search";
  private calls = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = providerTimeout(options.timeoutMs);
  }

  async search(request: ResearchSearchRequest): Promise<ResearchSearchResult[]> {
    this.calls += 1;
    const key = process.env.GOOGLE_SEARCH_API_KEY?.trim();
    const cx = process.env.GOOGLE_SEARCH_CX?.trim();
    if (!key || !cx) throw new ResearchSearchProviderError("GOOGLE_SEARCH_NOT_CONFIGURED");
    const params = new URLSearchParams({
      key,
      cx,
      q: queryWithDomains(request),
      num: String(Math.max(1, Math.min(10, request.maxResults ?? 8))),
      hl: request.language ?? "es",
      safe: "active",
    });
    if (request.country) params.set("gl", request.country.toLowerCase());
    if (request.recencyDays) params.set("dateRestrict", `d${Math.max(1, Math.floor(request.recencyDays))}`);
    const response = await this.fetchImpl(`https://www.googleapis.com/customsearch/v1?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) throw new ResearchSearchProviderError(`GOOGLE_SEARCH_HTTP_${response.status}`);
    const payload = await response.json() as {
      items?: Array<{ title?: string; link?: string; snippet?: string; pagemap?: { metatags?: Array<Record<string, string>> } }>;
    };
    return (payload.items ?? []).flatMap((item, index) => {
      const url = safeResultUrl(item.link);
      if (!url) return [];
      const publishedAt = item.pagemap?.metatags?.map((tags) => tags["article:published_time"] || tags.date || tags.datepublished).find(Boolean) ?? null;
      return [{
        title: item.title?.trim() ?? "",
        url: url.toString(),
        snippet: item.snippet?.trim() ?? "",
        host: url.hostname.toLowerCase(),
        rank: index + 1,
        publishedAt,
        provider: this.name,
      }];
    });
  }

  getUsage(): Record<string, number> {
    return { [this.name]: this.calls };
  }
}

export class SerpApiResearchSearchProvider implements ResearchSearchProviderV2 {
  readonly name = "serpapi-google";
  private calls = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = providerTimeout(options.timeoutMs);
  }

  async search(request: ResearchSearchRequest): Promise<ResearchSearchResult[]> {
    this.calls += 1;
    const key = serpApiKey();
    if (!key) throw new ResearchSearchProviderError("SERPAPI_NOT_CONFIGURED");
    const params = new URLSearchParams({
      engine: "google",
      api_key: key,
      q: queryWithDomains(request),
      google_domain: "google.es",
      gl: (request.country ?? "es").toLowerCase(),
      hl: request.language ?? "es",
      num: String(Math.max(1, Math.min(20, request.maxResults ?? 8))),
      safe: "active",
    });
    if (request.recencyDays) params.set("tbs", `qdr:d${Math.max(1, Math.floor(request.recencyDays))}`);
    const response = await this.fetchImpl(`https://serpapi.com/search.json?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: unknown };
      const message = safeProviderMessage(failure.error);
      const code = message && /quota|credits? exhausted|plan limit|monthly searches|run out of searches/i.test(message)
        ? "SERPAPI_QUOTA_EXHAUSTED"
        : `SERPAPI_HTTP_${response.status}`;
      throw new ResearchSearchProviderError(code, message);
    }
    const payload = await response.json() as {
      error?: string;
      organic_results?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>;
    };
    if (isEmptyResultMessage(payload.error)) return [];
    if (payload.error) {
      const code = /quota|credits? exhausted|plan limit|monthly searches|run out of searches/i.test(payload.error)
        ? "SERPAPI_QUOTA_EXHAUSTED"
        : "SERPAPI_PROVIDER_ERROR";
      throw new ResearchSearchProviderError(code, safeProviderMessage(payload.error));
    }
    return (payload.organic_results ?? []).flatMap((item, index) => {
      const url = safeResultUrl(item.link);
      if (!url) return [];
      return [{
        title: item.title?.trim() ?? "",
        url: url.toString(),
        snippet: item.snippet?.trim() ?? "",
        host: url.hostname.toLowerCase(),
        rank: index + 1,
        publishedAt: item.date ?? null,
        provider: this.name,
      }];
    });
  }

  getUsage(): Record<string, number> {
    return { [this.name]: this.calls };
  }
}

export class FallbackResearchSearchProvider implements ResearchSearchProviderV2 {
  readonly name: string;
  private readonly health = new Map<string, ResearchProviderHealth>();
  private readonly events: ResearchRetrievalEvent[] = [];
  private readonly cache = new Map<string, ResearchSearchResult[]>();
  private readonly maxTechnicalRetries: number;

  constructor(private readonly providers: ResearchSearchProviderV2[], options: ProviderOptions = {}) {
    if (!providers.length) throw new Error("NO_SEARCH_PROVIDERS");
    this.name = providers.map((provider) => provider.name).join("+");
    this.maxTechnicalRetries = Math.max(0, Math.min(3, options.maxTechnicalRetries ?? Number(process.env.RESEARCH_MAX_TECHNICAL_RETRIES ?? 1)));
    for (const provider of providers) this.setHealth(provider.name, "DEGRADED", null, "Preflight pending");
  }

  private setHealth(provider: string, state: ResearchProviderHealth["state"], failureCode: ResearchProviderHealth["failureCode"], detail: string | null): void {
    this.health.set(provider, { provider, state, checkedAt: new Date().toISOString(), failureCode, detail });
  }

  private event(provider: string, outcome: ResearchRetrievalEvent["outcome"], failureCode: ResearchRetrievalEvent["failureCode"], detail: string | null, operation: ResearchRetrievalEvent["operation"] = "SEARCH"): void {
    this.events.push({ at: new Date().toISOString(), operation, provider, outcome, failureCode, detail });
  }

  private cacheKey(request: ResearchSearchRequest): string {
    return JSON.stringify({ ...request, query: request.query.toLowerCase().replace(/\s+/g, " ").trim(), domains: [...(request.domains ?? [])].sort() });
  }

  async preflight(): Promise<ResearchProviderHealth[]> {
    for (const provider of this.providers) {
      if (this.health.get(provider.name)?.state === "OPEN_CIRCUIT") continue;
      try {
        await provider.search({ query: "RegionAtlas", maxResults: 1, country: "ES", language: "es" });
        this.setHealth(provider.name, "HEALTHY", null, null);
        this.event(provider.name, "SUCCESS", null, "Preflight request completed", "PREFLIGHT");
      } catch (error) {
        const code = classifyRetrievalFailure(error);
        const open = code === "PROVIDER_QUOTA_EXHAUSTED";
        this.setHealth(provider.name, open ? "OPEN_CIRCUIT" : "DEGRADED", code, safeRetrievalDetail(error));
        this.event(provider.name, open ? "OPEN_CIRCUIT" : "FAILURE", code, safeRetrievalDetail(error), "PREFLIGHT");
      }
    }
    return this.getHealth();
  }

  getHealth(): ResearchProviderHealth[] {
    return [...this.health.values()];
  }

  getEvents(): ResearchRetrievalEvent[] {
    return [...this.events];
  }

  async search(request: ResearchSearchRequest): Promise<ResearchSearchResult[]> {
    const cacheKey = this.cacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.event(this.name, "CACHE_HIT", null, `${cached.length} cached results`);
      return cached;
    }
    const errors: unknown[] = [];
    for (const provider of this.providers) {
      if (this.health.get(provider.name)?.state === "OPEN_CIRCUIT") continue;
      for (let attempt = 0; attempt <= this.maxTechnicalRetries; attempt += 1) {
        try {
          const results = await provider.search(request);
          this.setHealth(provider.name, "HEALTHY", null, null);
          this.event(provider.name, results.length ? "SUCCESS" : "EMPTY", null, `${results.length} results`);
          if (results.length) {
            this.cache.set(cacheKey, results);
            return results;
          }
          break;
        } catch (error) {
          errors.push(error);
          const code = classifyRetrievalFailure(error);
          const detail = safeRetrievalDetail(error);
          if (code === "PROVIDER_QUOTA_EXHAUSTED") {
            this.setHealth(provider.name, "OPEN_CIRCUIT", code, detail);
            this.event(provider.name, "OPEN_CIRCUIT", code, detail);
            break;
          }
          if (attempt < this.maxTechnicalRetries && isRetryableRetrievalFailure(code)) {
            this.setHealth(provider.name, "DEGRADED", code, detail);
            this.event(provider.name, "RETRY", code, detail);
            await boundedBackoff(attempt + 1);
            continue;
          }
          this.setHealth(provider.name, "DEGRADED", code, detail);
          this.event(provider.name, "FAILOVER", code, detail);
          break;
        }
      }
    }
    if (errors.length && this.providers.every((provider) => this.health.get(provider.name)?.state !== "HEALTHY")) throw errors.at(-1);
    return [];
  }

  getUsage(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const provider of this.providers) {
      for (const [name, calls] of Object.entries(provider.getUsage?.() ?? {})) result[name] = (result[name] ?? 0) + calls;
    }
    return result;
  }
}

export function createConfiguredResearchSearchProvider(options: ProviderOptions = {}): ResearchSearchProviderV2 | null {
  const providers: ResearchSearchProviderV2[] = [];
  if (configuredGoogle()) providers.push(new GoogleCustomResearchSearchProvider(options));
  if (serpApiKey()) providers.push(new SerpApiResearchSearchProvider(options));
  return providers.length ? new FallbackResearchSearchProvider(providers, options) : null;
}

export class SerpApiResearchImageSearchProvider implements ResearchImageSearchProvider {
  readonly name = "serpapi-google-images";
  private calls = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = providerTimeout(options.timeoutMs);
  }

  async search(request: ResearchSearchRequest): Promise<ResearchImageSearchResult[]> {
    this.calls += 1;
    const key = serpApiKey();
    if (!key) throw new ResearchSearchProviderError("SERPAPI_NOT_CONFIGURED");
    const params = new URLSearchParams({
      engine: "google_images",
      api_key: key,
      q: queryWithDomains(request),
      google_domain: "google.es",
      gl: (request.country ?? "es").toLowerCase(),
      hl: request.language ?? "es",
      safe: "active",
    });
    const response = await this.fetchImpl(`https://serpapi.com/search.json?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { error?: unknown };
      const message = safeProviderMessage(failure.error);
      const code = message && /quota|credits? exhausted|plan limit|monthly searches|run out of searches/i.test(message)
        ? "SERPAPI_IMAGE_QUOTA_EXHAUSTED"
        : `SERPAPI_IMAGE_HTTP_${response.status}`;
      throw new ResearchSearchProviderError(code, message);
    }
    const payload = await response.json() as {
      error?: string;
      images_results?: Array<{ title?: string; original?: string; thumbnail?: string; link?: string; source?: string }>;
    };
    if (isEmptyResultMessage(payload.error)) return [];
    if (payload.error) {
      const code = /quota|credits? exhausted|plan limit|monthly searches|run out of searches/i.test(payload.error)
        ? "SERPAPI_IMAGE_QUOTA_EXHAUSTED"
        : "SERPAPI_IMAGE_PROVIDER_ERROR";
      throw new ResearchSearchProviderError(code, safeProviderMessage(payload.error));
    }
    return (payload.images_results ?? []).slice(0, Math.max(1, Math.min(20, request.maxResults ?? 8))).flatMap((item, index) => {
      const image = safeResultUrl(item.original);
      if (!image) return [];
      const sourcePage = safeResultUrl(item.link);
      return [{
        imageUrl: image.toString(),
        thumbnailUrl: safeResultUrl(item.thumbnail)?.toString() ?? null,
        sourcePageUrl: sourcePage?.toString() ?? null,
        title: item.title?.trim() ?? "",
        host: sourcePage?.hostname.toLowerCase() ?? item.source?.trim().toLowerCase() ?? "",
        rank: index + 1,
      }];
    });
  }

  getUsage(): Record<string, number> {
    return { [this.name]: this.calls };
  }
}

export class GoogleCustomResearchImageSearchProvider implements ResearchImageSearchProvider {
  readonly name = "google-custom-images";
  private calls = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = providerTimeout(options.timeoutMs);
  }

  async search(request: ResearchSearchRequest): Promise<ResearchImageSearchResult[]> {
    this.calls += 1;
    const key = process.env.GOOGLE_SEARCH_API_KEY?.trim();
    const cx = process.env.GOOGLE_SEARCH_CX?.trim();
    if (!key || !cx) throw new ResearchSearchProviderError("GOOGLE_IMAGE_NOT_CONFIGURED");
    const params = new URLSearchParams({
      key,
      cx,
      q: queryWithDomains(request),
      searchType: "image",
      num: String(Math.max(1, Math.min(10, request.maxResults ?? 8))),
      hl: request.language ?? "es",
      safe: "active",
    });
    const response = await this.fetchImpl(`https://www.googleapis.com/customsearch/v1?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) throw new ResearchSearchProviderError(`GOOGLE_IMAGE_HTTP_${response.status}`);
    const payload = await response.json() as {
      items?: Array<{ title?: string; link?: string; image?: { thumbnailLink?: string; contextLink?: string } }>;
    };
    return (payload.items ?? []).flatMap((item, index) => {
      const image = safeResultUrl(item.link);
      if (!image) return [];
      const sourcePage = safeResultUrl(item.image?.contextLink);
      return [{
        imageUrl: image.toString(),
        thumbnailUrl: safeResultUrl(item.image?.thumbnailLink)?.toString() ?? null,
        sourcePageUrl: sourcePage?.toString() ?? null,
        title: item.title?.trim() ?? "",
        host: sourcePage?.hostname.toLowerCase() ?? "",
        rank: index + 1,
      }];
    });
  }

  getUsage(): Record<string, number> {
    return { [this.name]: this.calls };
  }
}

export class FallbackResearchImageSearchProvider implements ResearchImageSearchProvider {
  readonly name: string;

  constructor(private readonly providers: ResearchImageSearchProvider[]) {
    if (!providers.length) throw new Error("NO_IMAGE_SEARCH_PROVIDERS");
    this.name = providers.map((provider) => provider.name).join("+");
  }

  async search(request: ResearchSearchRequest): Promise<ResearchImageSearchResult[]> {
    const errors: unknown[] = [];
    for (const provider of this.providers) {
      try {
        const results = await provider.search(request);
        if (results.length) return results;
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === this.providers.length) throw errors[0];
    return [];
  }

  getUsage(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const provider of this.providers) {
      for (const [name, calls] of Object.entries(provider.getUsage?.() ?? {})) result[name] = (result[name] ?? 0) + calls;
    }
    return result;
  }
}

export function createConfiguredResearchImageSearchProvider(options: ProviderOptions = {}): ResearchImageSearchProvider | null {
  const providers: ResearchImageSearchProvider[] = [];
  if (configuredGoogle()) providers.push(new GoogleCustomResearchImageSearchProvider(options));
  if (serpApiKey()) providers.push(new SerpApiResearchImageSearchProvider(options));
  return providers.length ? new FallbackResearchImageSearchProvider(providers) : null;
}

export async function searchResearchWeb(query: string, options: ProviderOptions = {}): Promise<ResearchSearchResult[]> {
  const provider = createConfiguredResearchSearchProvider(options);
  return provider ? provider.search({ query, maxResults: 3, country: "ES", language: "es" }) : [];
}
