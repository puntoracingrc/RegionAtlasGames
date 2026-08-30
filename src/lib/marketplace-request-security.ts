import { NextResponse } from "next/server";
import { checkRequestRateLimit, rateLimitHeaders } from "./request-security";

export async function marketplaceRateLimitResponse(
  request: Request,
  options: {
    action: string;
    userId: string;
    limit: number;
    windowMs: number;
  },
): Promise<NextResponse | null> {
  const result = await checkRequestRateLimit(request, {
    namespace: `marketplace-${options.action}`,
    identity: options.userId,
    limit: options.limit,
    windowMs: options.windowMs,
  });
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Demasiadas acciones seguidas. Espera un poco antes de continuar." },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}
