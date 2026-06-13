import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  exchangeGoogleCode,
  isGoogleAuthConfigured,
  sanitizeNextPath,
  verifyOAuthState,
} from "@/lib/google-auth";
import { loginOrRegisterWithGoogle } from "@/lib/users";

function redirectWithGoogleError(request: Request, code: string): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("google", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) {
    return redirectWithGoogleError(request, "not-configured");
  }

  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return redirectWithGoogleError(request, oauthError === "access_denied" ? "cancelled" : "failed");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const savedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const next = sanitizeNextPath(cookieStore.get(OAUTH_NEXT_COOKIE)?.value);

  if (!code || !verifyOAuthState(state) || state !== savedState) {
    return redirectWithGoogleError(request, "invalid-state");
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const result = await loginOrRegisterWithGoogle(profile);
    if ("error" in result) {
      return redirectWithGoogleError(request, result.error);
    }

    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_NEXT_COOKIE);
    return response;
  } catch (error) {
    console.error("[auth/google/callback]", error);
    return redirectWithGoogleError(request, "failed");
  }
}
