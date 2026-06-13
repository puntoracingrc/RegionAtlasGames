import { NextResponse } from "next/server";
import { isResendConfigured, sendMagicLinkEmail } from "@/lib/email";
import { createMagicLinkToken } from "@/lib/magic-link";
import { readUsers } from "@/lib/users";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email no válido." }, { status: 400 });
  }

  const users = await readUsers();
  if (!users.some((u) => u.email === email)) {
    return NextResponse.json(
      { error: "No hay cuenta con ese email. Regístrate primero." },
      { status: 404 },
    );
  }

  const { verifyUrl } = createMagicLinkToken(email);

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
      message: "Te hemos enviado un enlace a tu email. Caduca en 15 minutos.",
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
