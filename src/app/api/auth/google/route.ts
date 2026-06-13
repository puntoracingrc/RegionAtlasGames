import { NextResponse } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
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
  const googleUrl = buildGoogleAuthUrl(state);

  const response = NextResponse.redirect(googleUrl);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  response.cookies.set(OAUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}
