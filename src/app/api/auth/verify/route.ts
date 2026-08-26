import { NextResponse } from "next/server";
import { consumeMagicLinkToken } from "@/lib/magic-link";
import { checkRequestRateLimit } from "@/lib/request-security";
import { loginUserByEmail } from "@/lib/users";

export async function GET(request: Request) {
  const limit = await checkRequestRateLimit(request, {
    namespace: "auth-magic-verify",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.redirect(new URL("/login?magic=invalid", request.url));
  }

  const token = new URL(request.url).searchParams.get("token");
  const origin = new URL(request.url).origin;

  if (!token) {
    return NextResponse.redirect(`${origin}/login?magic=invalid`);
  }

  const result = await consumeMagicLinkToken(token);
  if ("error" in result) {
    return NextResponse.redirect(
      `${origin}/login?magic=${encodeURIComponent(result.error)}`,
    );
  }

  const login = await loginUserByEmail(result.email);
  if ("error" in login) {
    return NextResponse.redirect(`${origin}/login?magic=login-failed`);
  }

  return NextResponse.redirect(`${origin}/coleccion`);
}
