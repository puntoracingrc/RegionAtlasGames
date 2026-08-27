import { clearEbayCachedToken, getEbayAccessToken } from "./ebay-auth.ts";
import { EbayApiError } from "./ebay-errors.ts";
import { buildEbayEndUserContext } from "./ebay-enduserctx.ts";

export function ebayMarketplaceId(override?: string): string {
  return override?.trim() || process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_ES";
}

function mergeHeaders(
  existing: HeadersInit | undefined,
  token: string,
  marketplaceId?: string,
  gameId?: string,
  platformSlug?: string,
): HeadersInit {
  const headers: Record<string, string> = {
    ...(existing as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-EBAY-C-MARKETPLACE-ID": ebayMarketplaceId(marketplaceId),
  };

  const endUserContext = buildEbayEndUserContext({ gameId, platformSlug });
  if (endUserContext) headers["X-EBAY-C-ENDUSERCTX"] = endUserContext;

  return headers;
}

export function ebayBrowseApiBase(): string {
  return process.env.EBAY_BROWSE_API_BASE?.trim() || "https://api.ebay.com/buy/browse/v1";
}

export function ebayCatalogApiBase(): string {
  return process.env.EBAY_CATALOG_API_BASE?.trim() || "https://api.ebay.com/commerce/catalog/v1_beta";
}

export async function ebayFetch<T>(
  pathOrUrl: string,
  options: RequestInit = {},
  context: { marketplaceId?: string; gameId?: string; platformSlug?: string } = {},
): Promise<T> {
  const accessToken = await getEbayAccessToken();
  const response = await fetch(pathOrUrl, {
    ...options,
    headers: mergeHeaders(options.headers, accessToken, context.marketplaceId, context.gameId, context.platformSlug),
  });

  if (response.status === 401) {
    clearEbayCachedToken();
    const retryToken = await getEbayAccessToken();
    const retry = await fetch(pathOrUrl, {
      ...options,
      headers: mergeHeaders(options.headers, retryToken, context.marketplaceId, context.gameId, context.platformSlug),
    });
    if (!retry.ok) throw new EbayApiError("ebay_api_retry_failed", { status: retry.status });
    return retry.json() as Promise<T>;
  }

  if (!response.ok) throw new EbayApiError("ebay_api_request_failed", { status: response.status });
  return response.json() as Promise<T>;
}
