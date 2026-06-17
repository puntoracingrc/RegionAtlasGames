import { EbayAuthError } from "./ebay-errors.ts";
import type { EbayCachedToken, EbayTokenResponse } from "./ebay.types.ts";

let cachedEbayToken: EbayCachedToken | null = null;
let ebayTokenPromise: Promise<EbayCachedToken> | null = null;

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isEbayAffiliateEnabled(): boolean {
  return process.env.EBAY_AFFILIATE_ENABLED === "true";
}

function tokenEndpoint(): string {
  return process.env.EBAY_OAUTH_TOKEN_ENDPOINT?.trim() || "https://api.ebay.com/identity/v1/oauth2/token";
}

function tokenTimeoutMs(): number {
  const parsed = Number(process.env.EBAY_TOKEN_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.max(1000, parsed) : 10_000;
}

function refreshSafetySeconds(): number {
  const parsed = Number(process.env.EBAY_TOKEN_REFRESH_SAFETY_SECONDS);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 300;
}

function requireEbayEnv(name: string): string {
  const value = configured(process.env[name]);
  if (!value) throw new EbayAuthError(`missing_${name.replace(/^EBAY_/, "").toLowerCase()}`);
  return value;
}


export function buildEbayBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function ebayScope(): string {
  return process.env.EBAY_OAUTH_SCOPE?.trim() || "https://api.ebay.com/oauth/api_scope";
}

function parseEbayTokenResponse(json: EbayTokenResponse): EbayCachedToken {
  if (!json.access_token || !json.expires_in) {
    throw new EbayAuthError("invalid_token_response");
  }
  return {
    accessToken: json.access_token,
    tokenType: json.token_type ?? "Bearer",
    expiresAt: Date.now() + Math.max(0, json.expires_in - refreshSafetySeconds()) * 1000,
  };
}

export async function requestEbayAccessToken(): Promise<EbayCachedToken> {
  const clientId = requireEbayEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEbayEnv("EBAY_CLIENT_SECRET");
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", ebayScope());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), tokenTimeoutMs());
  try {
    const response = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: {
        Authorization: buildEbayBasicAuthHeader(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new EbayAuthError("token_request_failed", { status: response.status });
    }

    return parseEbayTokenResponse((await response.json()) as EbayTokenResponse);
  } catch (error) {
    if (error instanceof EbayAuthError) throw error;
    throw new EbayAuthError("token_request_failed", { reason: error instanceof Error ? error.name : "unknown" });
  } finally {
    clearTimeout(timeout);
  }
}

export function clearEbayCachedToken(): void {
  cachedEbayToken = null;
}

export async function getEbayAccessToken(): Promise<string> {
  if (!isEbayAffiliateEnabled()) throw new EbayAuthError("ebay_disabled");

  if (cachedEbayToken && Date.now() < cachedEbayToken.expiresAt) {
    return cachedEbayToken.accessToken;
  }

  if (ebayTokenPromise) {
    const token = await ebayTokenPromise;
    return token.accessToken;
  }

  ebayTokenPromise = (async () => {
    try {
      const token = await requestEbayAccessToken();
      cachedEbayToken = token;
      return token;
    } finally {
      ebayTokenPromise = null;
    }
  })();

  const token = await ebayTokenPromise;
  return token.accessToken;
}


export async function getEbayAccessTokenInfo(): Promise<{ expiresAt: number; tokenType: string }> {
  const accessToken = await getEbayAccessToken();
  void accessToken;
  if (!cachedEbayToken) throw new EbayAuthError("token_cache_missing");
  return { expiresAt: cachedEbayToken.expiresAt, tokenType: cachedEbayToken.tokenType };
}
