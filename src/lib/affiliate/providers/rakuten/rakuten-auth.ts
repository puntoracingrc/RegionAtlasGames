import { RakutenAuthError } from "./rakuten-errors";
import type { RakutenAccessTokenResponse, RakutenCachedToken } from "./rakuten-types";

let cachedRakutenToken: RakutenCachedToken | null = null;
let rakutenTokenPromise: Promise<RakutenCachedToken> | null = null;

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRakutenEnabled(): boolean {
  return process.env.RAKUTEN_AFFILIATE_ENABLED === "true";
}

function tokenEndpoint(): string {
  return process.env.RAKUTEN_TOKEN_ENDPOINT?.trim() || "https://api.linksynergy.com/token";
}

function tokenTimeoutMs(): number {
  const parsed = Number(process.env.RAKUTEN_TOKEN_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.max(1000, parsed) : 10_000;
}

function refreshSafetySeconds(): number {
  const parsed = Number(process.env.RAKUTEN_TOKEN_REFRESH_SAFETY_SECONDS);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 300;
}

function includeGrantType(): boolean {
  return process.env.RAKUTEN_TOKEN_INCLUDE_GRANT_TYPE === "true";
}

function requireRakutenEnv(name: string): string {
  const value = configured(process.env[name]);
  if (!value) throw new RakutenAuthError("RAKUTEN_MISSING_ENV", { name });
  return value;
}

export function buildRakutenTokenKey(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

export function getRakutenTokenKey(): string {
  const existing = configured(process.env.RAKUTEN_TOKEN_KEY);
  if (existing) return existing;
  return buildRakutenTokenKey(requireRakutenEnv("RAKUTEN_CLIENT_ID"), requireRakutenEnv("RAKUTEN_CLIENT_SECRET"));
}

function parseRakutenTokenResponse(json: RakutenAccessTokenResponse, code: string): RakutenCachedToken {
  if (!json.access_token || !json.refresh_token || !json.expires_in) {
    throw new RakutenAuthError(code);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    tokenType: json.token_type ?? "bearer",
    expiresAt: Date.now() + Math.max(0, json.expires_in - refreshSafetySeconds()) * 1000,
  };
}

async function postRakutenToken(body: URLSearchParams, code: string): Promise<RakutenCachedToken> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), tokenTimeoutMs());
  try {
    const response = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getRakutenTokenKey()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new RakutenAuthError(code, { status: response.status });
    }

    return parseRakutenTokenResponse((await response.json()) as RakutenAccessTokenResponse, `${code}_INVALID_RESPONSE`);
  } catch (error) {
    if (error instanceof RakutenAuthError) throw error;
    throw new RakutenAuthError(code, { reason: error instanceof Error ? error.name : "unknown" });
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestRakutenAccessToken(): Promise<RakutenCachedToken> {
  const body = new URLSearchParams();
  if (includeGrantType()) body.set("grant_type", "password");
  body.set("scope", requireRakutenEnv("RAKUTEN_ACCOUNT_ID"));
  return postRakutenToken(body, "RAKUTEN_ACCESS_TOKEN_REQUEST_FAILED");
}

export async function refreshRakutenAccessToken(refreshToken: string): Promise<RakutenCachedToken> {
  const body = new URLSearchParams();
  body.set("refresh_token", refreshToken);
  body.set("scope", requireRakutenEnv("RAKUTEN_ACCOUNT_ID"));
  return postRakutenToken(body, "RAKUTEN_REFRESH_TOKEN_REQUEST_FAILED");
}

export function clearRakutenCachedToken(): void {
  cachedRakutenToken = null;
}

export async function getRakutenAccessToken(): Promise<string> {
  if (!isRakutenEnabled()) throw new RakutenAuthError("RAKUTEN_DISABLED");

  if (cachedRakutenToken && Date.now() < cachedRakutenToken.expiresAt) {
    return cachedRakutenToken.accessToken;
  }

  if (rakutenTokenPromise) {
    const token = await rakutenTokenPromise;
    return token.accessToken;
  }

  rakutenTokenPromise = (async () => {
    try {
      if (cachedRakutenToken?.refreshToken) {
        try {
          cachedRakutenToken = await refreshRakutenAccessToken(cachedRakutenToken.refreshToken);
          return cachedRakutenToken;
        } catch {
          cachedRakutenToken = await requestRakutenAccessToken();
          return cachedRakutenToken;
        }
      }
      cachedRakutenToken = await requestRakutenAccessToken();
      return cachedRakutenToken;
    } finally {
      rakutenTokenPromise = null;
    }
  })();

  const token = await rakutenTokenPromise;
  return token.accessToken;
}
