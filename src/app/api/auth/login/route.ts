import { NextResponse } from "next/server";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/request-security";
import { authConfigErrors } from "@/lib/server-env";
import { loginUser } from "@/lib/users";

export async function POST(request: Request) {
  const configErrors = authConfigErrors();
  if (configErrors.length > 0) {
    console.error("[auth/login] config", configErrors.join(" "));
    return NextResponse.json(
      { error: "Inicio de sesión no disponible: configuración del servidor incompleta." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const limit = await checkRequestRateLimit(request, {
    namespace: "auth-login",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos antes de volver a probar." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const parsed = await readJsonBody<{ email?: unknown; password?: unknown }>(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const email = typeof parsed.data.email === "string" ? parsed.data.email : "";
  const password = typeof parsed.data.password === "string" ? parsed.data.password : "";
  const result = await loginUser(email, password);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { user: result.user },
    { headers: { "Cache-Control": "no-store" } },
  );
}
