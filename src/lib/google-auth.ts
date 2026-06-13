import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getSiteUrl } from "./site-url";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const OAUTH_STATE_COOKIE = "pal-es-oauth-state";
export const OAUTH_NEXT_COOKIE = "pal-es-oauth-next";

export type GoogleProfile = {
  googleId: string;
  email: string;
  name: string;
};

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ?? "dev-only-secret-min-32-chars-long!!"
  );
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function googleRedirectUri(): string {
  return `${getSiteUrl()}/api/auth/google/callback`;
}

export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/coleccion";
  return next;
}

export function createOAuthState(): string {
  const nonce = randomBytes(24).toString("hex");
  const signature = createHmac("sha256", sessionSecret()).update(nonce).digest("hex");
  return `${nonce}.${signature}`;
}

export function verifyOAuthState(state: string | null | undefined): boolean {
  if (!state) return false;
  const [nonce, signature] = state.split(".");
  if (!nonce || !signature || nonce.length < 16) return false;
  const expected = createHmac("sha256", sessionSecret()).update(nonce).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID no configurado.");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth no configurado.");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? tokenData.error ?? "Token Google inválido.");
  }

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const profile = (await profileRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!profileRes.ok || !profile.sub || !profile.email) {
    throw new Error("No se pudo leer el perfil de Google.");
  }

  if (profile.email_verified === false) {
    throw new Error("Tu email de Google no está verificado.");
  }

  return {
    googleId: profile.sub,
    email: profile.email.trim().toLowerCase(),
    name: (profile.name ?? profile.email.split("@")[0] ?? "Usuario").trim(),
  };
}
