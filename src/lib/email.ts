import { Resend } from "resend";
import { SITE_LOGO } from "./site-brand";
import { getSiteUrl } from "./site-url";

function mailFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (from) return from;
  return `${SITE_LOGO} <onboarding@resend.dev>`;
}

function buildMagicLinkHtml(verifyUrl: string): string {
  const site = getSiteUrl();
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f12;font-family:system-ui,-apple-system,sans-serif;color:#e8e8ec;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f12;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#18181f;border:1px solid #2a2a35;border-radius:16px;padding:32px 28px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">${SITE_LOGO}</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f5f5f7;">Accede a tu colección</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#a1a1aa;">
            Pulsa el botón para iniciar sesión. El enlace caduca en <strong style="color:#e8e8ec;">15 minutos</strong> y solo puede usarse una vez.
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="${verifyUrl}" style="display:inline-block;background:#d4a017;color:#1a1200;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">Entrar en ${SITE_LOGO}</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#71717a;">
            Si el botón no funciona, copia este enlace en el navegador:
          </p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#a1a1aa;word-break:break-all;">
            <a href="${verifyUrl}" style="color:#d4a017;">${verifyUrl}</a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#52525b;">
            Si no solicitaste este acceso, ignora este email. · ${site}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function catalogRequestRecipient(): string | null {
  const to =
    process.env.CATALOG_REQUEST_TO_EMAIL?.trim() ||
    process.env.DEVELOPER_EMAIL?.trim() ||
    null;
  return to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : null;
}

export function isCatalogRequestConfigured(): boolean {
  return isResendConfigured() && catalogRequestRecipient() != null;
}

export async function sendMagicLinkEmail(
  to: string,
  verifyUrl: string,
): Promise<{ ok: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { error: "RESEND_API_KEY no configurada." };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: mailFromAddress(),
    to,
    subject: `Tu enlace de acceso a ${SITE_LOGO}`,
    html: buildMagicLinkHtml(verifyUrl),
    text: `Entra en ${SITE_LOGO}:\n${verifyUrl}\n\nEl enlace caduca en 15 minutos y solo puede usarse una vez.\n\nSi no solicitaste este acceso, ignora este email.`,
  });

  if (error) {
    console.error("[resend] magic-link", error.message ?? error);
    return { error: "No se pudo enviar el email. Inténtalo de nuevo más tarde." };
  }

  return { ok: true };
}

export async function sendCatalogGapReportEmail(input: {
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { error: "RESEND_API_KEY no configurada." };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: mailFromAddress(),
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    console.error("[resend] catalog-gap-report", error.message ?? error);
    return { error: "No se pudo enviar el email al equipo de catálogo." };
  }

  return { ok: true };
}
