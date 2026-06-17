import {
  clearRakutenCachedToken,
  getRakutenAccessToken,
} from "../affiliate/providers/rakuten/rakuten-auth";
import { normalizeRakutenAdvertiserCandidates } from "./advertiser-search-normalize";
import { parseRakutenAdvertiserSearchXml } from "./advertiser-search-xml";
import {
  RakutenAdvertiserSearchError,
  type RakutenAdvertiserCandidate,
  type RakutenAdvertiserSearchMerchant,
} from "./advertiser-search.types";

const RAKUTEN_ADVERTISER_SEARCH_URL = "https://api.linksynergy.com/advertisersearch/1.0";
const cache = new Map<string, { expiresAt: number; merchants: RakutenAdvertiserSearchMerchant[] }>();

export type RakutenAdvertiserSearchDeps = {
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  clearToken?: () => void;
  now?: () => Date;
  cacheTtlMs?: number;
};

function normalizeQuery(merchantName: string): string {
  return merchantName.trim().replace(/\s+/g, " ");
}

function cacheKey(query: string): string {
  return query.toLowerCase();
}

async function requestAdvertisers(
  query: string,
  token: string,
  fetcher: typeof fetch,
): Promise<RakutenAdvertiserSearchMerchant[]> {
  const url = new URL(RAKUTEN_ADVERTISER_SEARCH_URL);
  url.searchParams.set("merchantname", query);
  const response = await fetcher(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/xml",
    },
  });

  if (response.status === 401) throw new RakutenAdvertiserSearchError("RAKUTEN_ADVERTISER_AUTH_FAILED", 401);
  if (response.status === 403) throw new RakutenAdvertiserSearchError("RAKUTEN_ADVERTISER_RATE_LIMIT", 403);
  if (!response.ok) throw new RakutenAdvertiserSearchError("RAKUTEN_ADVERTISER_REQUEST_FAILED", response.status);

  return parseRakutenAdvertiserSearchXml(await response.text());
}

export async function searchRakutenAdvertisersByName(
  merchantName: string,
  deps: RakutenAdvertiserSearchDeps = {},
): Promise<RakutenAdvertiserSearchMerchant[]> {
  const query = normalizeQuery(merchantName);
  if (!query) throw new RakutenAdvertiserSearchError("RAKUTEN_ADVERTISER_QUERY_EMPTY");

  const ttlMs = deps.cacheTtlMs ?? 10 * 60_000;
  const cached = cache.get(cacheKey(query));
  if (cached && cached.expiresAt > Date.now()) return cached.merchants;

  const fetcher = deps.fetcher ?? fetch;
  const getAccessToken = deps.getAccessToken ?? getRakutenAccessToken;
  const clearToken = deps.clearToken ?? clearRakutenCachedToken;

  try {
    const merchants = await requestAdvertisers(query, await getAccessToken(), fetcher);
    cache.set(cacheKey(query), { expiresAt: Date.now() + ttlMs, merchants });
    return merchants;
  } catch (error) {
    if (error instanceof RakutenAdvertiserSearchError && error.status === 401) {
      clearToken();
      const merchants = await requestAdvertisers(query, await getAccessToken(), fetcher);
      cache.set(cacheKey(query), { expiresAt: Date.now() + ttlMs, merchants });
      return merchants;
    }
    throw error;
  }
}

export async function discoverRakutenAdvertiserCandidates(
  merchantName: string,
  deps: RakutenAdvertiserSearchDeps = {},
): Promise<RakutenAdvertiserCandidate[]> {
  const query = normalizeQuery(merchantName);
  const merchants = await searchRakutenAdvertisersByName(query, deps);
  return normalizeRakutenAdvertiserCandidates(merchants, query, (deps.now ?? (() => new Date()))().toISOString());
}
