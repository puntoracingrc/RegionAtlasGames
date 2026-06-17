import { NextResponse } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  buildGoogleAuthUrl,
  createOAuthState,
  isGoogleAuthConfigured,
  sanitizeNextPath,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?google=not-configured", request.url));
  }

  const { searchParams } = new URL(request.url);
  const next = sanitizeNextPath(searchParams.get("next"));
  const state = createOAuthState();
  const requestUrl = new URL(request.url);
  const redirectUri = new URL("/api/auth/google/callback", requestUrl.origin).toString();
  const googleUrl = buildGoogleAuthUrl(state, redirectUri);

  const response = NextResponse.redirect(googleUrl);
  const secure = process.env.NODE_ENV === "production";
  const host = requestUrl.hostname.toLowerCase();
  const domain =
    host === "regionatlas.games" || host === "www.regionatlas.games"
      ? ".regionatlas.games"
      : undefined;
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 60 * 10,
    path: "/",
    ...(domain ? { domain } : {}),
  };

  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_NEXT_COOKIE, next, cookieOptions);
  response.cookies.set(OAUTH_REDIRECT_COOKIE, redirectUri, cookieOptions);

  return response;
}
