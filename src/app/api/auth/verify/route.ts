import { NextResponse } from "next/server";
import { consumeMagicLinkToken } from "@/lib/magic-link";
import { loginUserByEmail } from "@/lib/users";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const origin = new URL(request.url).origin;

  if (!token) {
    return NextResponse.redirect(`${origin}/login?magic=invalid`);
  }

  const result = consumeMagicLinkToken(token);
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
