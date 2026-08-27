import { NextResponse } from "next/server";
import { authConfigErrors } from "@/lib/server-env";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/request-security";
import { getSession } from "@/lib/users";
import { registerUser } from "@/lib/users";

export async function POST(request: Request) {
  const configErrors = authConfigErrors();
  if (configErrors.length > 0) {
    console.error("[auth/register] config", configErrors.join(" "));
    return NextResponse.json(
      { error: "Registro no disponible: configuración del servidor incompleta." },
      { status: 503 },
    );
  }

  const limit = await checkRequestRateLimit(request, {
    namespace: "auth-register",
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiados registros desde esta conexión. Inténtalo más tarde." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  try {
    const parsed = await readJsonBody<{
      name?: unknown;
      email?: unknown;
      password?: unknown;
      city?: unknown;
    }>(request);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = parsed.data;
    const result = await registerUser({
      name: typeof body.name === "string" ? body.name : "",
      email: typeof body.email === "string" ? body.email : "",
      password: typeof body.password === "string" ? body.password : "",
      city: typeof body.city === "string" ? body.city : "",
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const session = await getSession();
    session.userId = result.user.id;
    session.email = result.user.email;
    session.name = result.user.name;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json(
      { user: result.user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Error interno al crear la cuenta. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
