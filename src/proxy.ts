import { NextResponse, type NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/request-origin";

export function proxy(request: NextRequest) {
  if (isTrustedMutationOrigin(request)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  return NextResponse.json(
    { error: "Origen de solicitud no permitido." },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/api/user/:path*",
    "/api/marketplace/:path*",
    "/api/contribuir/:path*",
    "/api/admin/:path*",
  ],
};
