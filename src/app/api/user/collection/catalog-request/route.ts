import { NextResponse } from "next/server";
import {
  buildCatalogGapReport,
  formatCatalogGapReportHtml,
  formatCatalogGapReportText,
} from "@/lib/catalog-gap-report";
import { readUserCollection, writeUserCollection } from "@/lib/collection-store";
import {
  catalogRequestRecipient,
  isCatalogRequestConfigured,
  sendCatalogGapReportEmail,
} from "@/lib/email";
import { outOfScopeCollectionItems, pendingCatalogItems } from "@/lib/import-collection";
import { SITE_LOGO } from "@/lib/site-brand";
import { getCurrentUser } from "@/lib/users";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const file = await readUserCollection(user.id);
  const pending = pendingCatalogItems(file.items);
  const outOfScope = outOfScopeCollectionItems(file.items);
  const report = buildCatalogGapReport({ pending, outOfScope });

  if (!report) {
    return NextResponse.json(
      { error: "No hay juegos pendientes de ficha en tu colección." },
      { status: 400 },
    );
  }

  const meta = {
    userName: user.name,
    userEmail: user.email,
    userId: user.id,
    importSource: file.source,
    importedAt: file.importedAt,
  };

  const text = formatCatalogGapReportText(report, meta);
  const html = formatCatalogGapReportHtml(report, meta);
  const subject = `[${SITE_LOGO}] ${report.totalItems} fichas pendientes · ${user.name}`;

  if (!isCatalogRequestConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[catalog-request] dev preview\n", text);
      return NextResponse.json({
        ok: true,
        message: "Modo desarrollo: revisa la consola del servidor para ver el informe.",
        preview: text,
      });
    }
    return NextResponse.json(
      { error: "El envío al equipo de catálogo no está configurado todavía." },
      { status: 503 },
    );
  }

  const to = catalogRequestRecipient();
  if (!to) {
    return NextResponse.json(
      { error: "Falta configurar CATALOG_REQUEST_TO_EMAIL." },
      { status: 503 },
    );
  }

  const sent = await sendCatalogGapReportEmail({
    to,
    replyTo: user.email,
    subject,
    html,
    text,
  });

  if ("error" in sent) {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  await writeUserCollection({
    ...file,
    catalogGapReportSentAt: sentAt,
  });

  return NextResponse.json({
    ok: true,
    message: "Listado enviado al equipo de catálogo. Gracias por ayudarnos a completar el índice.",
    sentAt,
    totalItems: report.totalItems,
  });
}
