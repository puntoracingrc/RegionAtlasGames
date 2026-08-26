import { NextResponse } from "next/server";
import { isResendConfigured, sendMagicLinkEmail } from "@/lib/email";
import { createMagicLinkToken } from "@/lib/magic-link";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/request-security";
import { authConfigErrors } from "@/lib/server-env";
import { readUsers } from "@/lib/users";

export async function POST(request: Request) {
  const configErrors = authConfigErrors();
  if (configErrors.length > 0) {
    console.error("[auth/magic-link] config", configErrors.join(" "));
    return NextResponse.json(
      { error: "Acceso por email no disponible: configuración del servidor incompleta." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ipLimit = await checkRequestRateLimit(request, {
    namespace: "auth-magic-link-ip",
    limit: 6,
    windowMs: 30 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera unos minutos antes de volver a probar." },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  const parsed = await readJsonBody<{ email?: unknown }>(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const email =
    typeof parsed.data.email === "string" ? parsed.data.email.trim().toLowerCase() : "";

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email no válido." }, { status: 400 });
  }

  const emailLimit = await checkRequestRateLimit(request, {
    namespace: "auth-magic-link-email",
    identity: email,
    limit: 3,
    windowMs: 30 * 60 * 1000,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Ya se han solicitado varios enlaces. Revisa tu correo o espera unos minutos." },
      { status: 429, headers: rateLimitHeaders(emailLimit) },
    );
  }

  const users = await readUsers();
  if (!users.some((u) => u.email === email)) {
    return NextResponse.json({
      ok: true,
      message: "Si existe una cuenta con ese email, recibirás un enlace en unos minutos.",
    });
  }

  const created = await createMagicLinkToken(email);
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: 503 });
  }
  const { verifyUrl } = created;

  if (isResendConfigured()) {
    const sent = await sendMagicLinkEmail(email, verifyUrl);
    if ("error" in sent) {
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json({
          ok: true,
          message: `Resend no pudo enviar (${sent.error}). Modo dev: usa el enlace.`,
          verifyUrl,
        });
      }
      return NextResponse.json({ error: sent.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      message: "Si existe una cuenta con ese email, recibirás un enlace en unos minutos.",
    });
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({
      ok: true,
      message: "Modo desarrollo (sin Resend): usa el enlace siguiente para entrar.",
      verifyUrl,
    });
  }

  return NextResponse.json(
    { error: "El envío de email no está configurado. Contacta con soporte." },
    { status: 503 },
  );
}
